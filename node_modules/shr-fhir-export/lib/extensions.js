const bunyan = require('bunyan');
const mdls = require('shr-models');
const common = require('./common');
const MVH = require('./multiVersionHelper');

var rootLogger = bunyan.createLogger({name: 'shr-fhir-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

const VALUE_SUPPORTED_TYPES = [ 'Coding', 'CodeableConcept', 'Attachment', 'Identifier', 'Quantity', 'SampledData',
  'Range', 'Period', 'Ratio', 'HumanName', 'Address', 'ContactPoint', 'Timing', 'Reference', 'Annotation', 'Signature'];


class ExtensionExporter {
  constructor(_profileExporter, specifications, fhir, target, configuration) {
    this._profileExporter = _profileExporter;
    this._specs = specifications;
    this._fhir = fhir;
    this._target = target;
    this._config = configuration;
    this._extensionsMap = new Map();
    this._processTracker = new common.ProcessTracker();
  }

  // The process tracker is used to keep track of what profiles are currently being processed.  This allows us to
  // check for possible issues when looking up and using a profile that is currently mid-process.
  get processTracker() {
    return this._processTracker;
  }

  get extensions() {
    return Array.from(this._extensionsMap.values());
  }

  lookupExtension(identifier, createIfNeeded=true, warnIfExtensionIsProcessing=false) {
    let ext = this._extensionsMap.get(identifier.fqn);
    if (typeof ext === 'undefined' && createIfNeeded) {
      ext = this.createExtension(identifier);
    } else if (warnIfExtensionIsProcessing && this._processTracker.isActive(identifier)) {
      logger.warn('Using extension that is currently in the middle of processing: %s. ERROR_CODE:13055', common.fhirID(identifier, 'extension'));
    }
    return ext;
  }

  createExtension(identifier) {
    this._processTracker.start(identifier.fqn, common.fhirID(identifier, 'extension'));
    let def = this._specs.dataElements.findByIdentifier(identifier);
    if (typeof def === 'undefined' && identifier.isPrimitive) {
      // We can cheat by creating a definition to represent the primitive value
      def = new mdls.DataElement(identifier, false)
        .withDescription(`The ${identifier.name} that represents the value of the element to which it is applied.`)
        .withValue(new mdls.IdentifiableValue(identifier).withMinMax(1,1));
    }

    const ext = this._fhir.extensionTemplate;
    ext.id = common.fhirID(def.identifier, 'extension');
    ext.text.div = this.getTextDiv(identifier);
    ext.url = common.fhirURL(def.identifier, this._config.fhirURL, 'extension');

    ext.name = def.identifier.name;
    MVH.setSdTitle(ext, common.fhirID(def.identifier));
    ext.publisher = this._config.publisher;
    ext.contact = MVH.convertContactDetails(ext, this._config.contact);
    ext.identifier[0].value = def.identifier.fqn;
    ext.identifier[0].system = this._config.projectURL;

    ext.date = this._config.publishDate || common.todayString();
    if (def.description) {
      ext.description = def.description.trim();
    } else {
      delete(ext.description);
    }
    const baseId = `Extension:${common.shortID(def.identifier)}`;

    // Set the extension in the extensionsMap _before_ iterating over the fields in order to avoid
    // an infinite loop.  For example, if element A has field B, and element B has field A, then
    // during the creation of extension A, it will need to reference extension B.  If extension B
    // does not yet exist, it will try to create it.  When creating extension B, it will then iterate
    // over B's fields and check if extension A exists yet.  If A isn't in the extensionsMap, it will
    // try to create extension A again, starting the infinite loop.  We add the extension to the map
    // early to avoid this situation.
    this._extensionsMap.set(identifier.fqn, ext);

    // Now add all the snapshot and differential elements.  Since the extension is in the map by
    // reference, we shouldn't need to set it in the map again after.
    this.pushDefExtensionElements(ext, baseId, '', def);
    this._processTracker.stop(identifier.fqn, common.fhirID(identifier, 'extension'));
    return ext;
  }

  pushDefExtensionElements(extension, baseId, baseExpression, def, card=new mdls.Cardinality(0)) {
    this.pushExtensionBaseElement(extension, baseId, def, card);
    this.pushExtensionIdElement(extension, baseId);

    // If this supports a simple extension, then determine its type (and other necessary data)
    let type, value;
    const map = this._specs.maps.findByTargetAndIdentifier(this._target, def.identifier);
    if (typeof map !== 'undefined') {
      type = VALUE_SUPPORTED_TYPES.indexOf(common.TargetItem.parse(map.targetItem).target) >= 0 ? common.TargetItem.parse(map.targetItem).target : 'Reference';
      value = new mdls.IdentifiableValue(map.identifier).withMinMax(1,1);
    } else if (typeof def.value !== 'undefined' && def.value.effectiveCard.max <= 1 && def.fields.length == 0) {
      if (def.value instanceof mdls.ChoiceValue && this.choiceSupportsValueX(def.value)) {
        value = def.value;
        type = '[x]';
      } else if (def.value instanceof mdls.IdentifiableValue) {
        value = def.value;
        if (def.value.identifier.isPrimitive) {
          type = def.value.identifier.name;
        } else {
          const valMap = this._specs.maps.findByTargetAndIdentifier(this._target, def.value.identifier);
          if (typeof valMap !== 'undefined') {
            type = VALUE_SUPPORTED_TYPES.indexOf(common.TargetItem.parse(valMap.targetItem).target) >= 0 ? common.TargetItem.parse(valMap.targetItem).target : 'Reference';
            value = def.value;
          }
        }
      }
    }

    // If 'type' is not defined, that means we can't represent this as a simple extension
    if (typeof type === 'undefined') {
      this.pushExtensionSlicedExtensionsElement(extension, baseId);
      for (const field of [def.value, ...def.fields]) {
        if (typeof field === 'undefined') {
          continue;
        } else if (field instanceof mdls.IdentifiableValue) {
          this.pushExtensionSubExtensionElements(extension, baseId, baseExpression, def, field);
        } else if (field instanceof mdls.ChoiceValue) {
          // For now... we put the choice options at the same level as everything else
          // TODO: Take out the options that are individually mapped to other things?
          //       Is this necessary if we don't automagically create extensions for anything that does have a deeper mapping path present?
          const optExpressions = [];
          for (const opt of field.aggregateOptions) {
            if (opt instanceof mdls.IdentifiableValue) {
              // Need to clone and set min card to 0 since this is a choice option.  Will have to enforce that one
              // be picked via invariants.
              const newOpt = opt.clone().withConstraint(new mdls.CardConstraint(new mdls.Cardinality(0, opt.effectiveCard.max)));
              this.pushExtensionSubExtensionElements(extension, baseId, baseExpression, def, newOpt);
              optExpressions.push(this.appendExtensionExpression(baseExpression, opt.identifier));
            }
          }
          // NOTE: Don't generate out the constraints for FHIR DSTU2
          if (extension.fhirVersion !== '1.0.2' && optExpressions.length > 1) {
            const choiceNum = 1 + extension.snapshot.element[0].constraint.filter(c => c.key.startsWith('choice-')).length;
            const constraint = {
              key: `choice-${choiceNum}`,
              severity: 'error',
              human: `${extension.id} SHALL have either `,
              expression: '( '
            };
            for (let i=0; i < optExpressions.length; i++) {
              if (i > 0) {
                constraint.human += ' or ';
                constraint.expression += ' | ';
              }
              constraint.human += optExpressions[i];
              constraint.expression += `${optExpressions[i]}.url`;
            }
            const distinctCountComparison = field.effectiveCard.min == 0 ? '<= 1' : '== 1';
            constraint.expression += ` ).distinct().count() ${distinctCountComparison}`;
            extension.snapshot.element[0].constraint.push(constraint);
            if (typeof extension.differential.element[0].constraint === 'undefined') {
              extension.differential.element[0].constraint = [];
            }
            extension.differential.element[0].constraint.push(constraint);
          }
        } else if (field instanceof mdls.TBD) {
          continue;
        } else {
          //13052 , 'Unsupported field value type: ${fieldValue1}.',  'Unknown' , 'errorNumber'
          logger.error({fieldValue1 : field.constructor.name}, '13052' );
        }
      }
      this.pushExtensionURLElement(extension, baseId, def);
      this.pushExtensionNoValueXElement(extension, baseId);
    } else {
      this.pushExtensionNoExtensionsElement(extension, baseId);
      this.pushExtensionURLElement(extension, baseId, def);
      this.pushExtensionValueXElement(extension, baseId, type, value);
    }
  }

  appendExtensionExpression(baseExpression, identifier) {
    if (baseExpression.length > 0) {
      return `${baseExpression}.extension('${common.shortID(identifier)}')`;
    }
    return `extension('${common.shortID(identifier)}')`;
  }

  pushExtensionBaseElement(extension, baseId, def, card=new mdls.Cardinality(0)) {
    const ssExt = {
      id: `${baseId}`,
      path: `${this.getExtensionPathFromExtensionID(baseId)}`,
      short: def.identifier.name,
      definition: def.description ? def.description.trim() : undefined,
      min: card.min,
      max: typeof card.max === 'undefined' ? '*' : card.max.toString(),
      base: { path: 'Extension', min: 0, max: '1' },
      condition: [],
      constraint: []
    };
    if (typeof ssExt.definition === 'undefined' || ssExt.definition == null || ssExt.definition == '') {
      // definition is *required*, so put something there
      ssExt.definition = def.identifier.name;
    }
    if (extension.fhirVersion !== '1.0.2' && ssExt.path == 'Extension') {
      // We're at very root of extension, so add the conditions and constraints
      ssExt.condition.push('ele-1');
      ssExt.constraint.push({
        key: 'ele-1',
        severity: 'error',
        human: 'All FHIR elements must have a @value or children',
        expression: 'children().count() > id.count()',
        xpath: '@value|f:*|h:div',
        source: 'Element'
      }, {
        key: 'ext-1',
        severity: 'error',
        human: 'Must have either extensions or value[x], not both',
        expression: 'extension.exists() != value.exists()',
        xpath: 'exists(f:extension)!=exists(f:*[starts-with(local-name(.), \'value\')])',
        source: 'Extension'
      });
    } else {
      delete(ssExt.condition);
      delete(ssExt.constraint);
    }
    extension.snapshot.element.push(ssExt);
    const dfExt = {
      id: ssExt.id,
      path: ssExt.path,
      short: ssExt.short,
      definition: ssExt.definition,
      min: ssExt.min,
      max: ssExt.max
    };
    extension.differential.element.push(dfExt);
  }

  pushExtensionIdElement(extension, baseId) {
    const ssExt = {
      id: `${baseId}.id`,
      path: `${this.getExtensionPathFromExtensionID(baseId)}.id`,
      representation: ['xmlAttr'],
      short: 'xml:id (or equivalent in JSON)',
      definition: 'unique id for the element within a resource (for internal references). This may be any string value that does not contain spaces.',
      min: 0,
      max: '1',
      base: { path: 'Element.id', min: 0, max: '1' },
      type: [{ code: 'string' }],
      mapping: [{ identity: 'rim', map: 'N/A' }]
    };
    extension.snapshot.element.push(ssExt);
    // ids apparently don't need to go into the differential
  }

  pushExtensionNoExtensionsElement(extension, baseId) {
    const ssExt = {
      id: `${baseId}.extension:extension`,
      path: `${this.getExtensionPathFromExtensionID(baseId)}.extension`,
      [MVH.nameOfEdSliceName(extension)]: 'extension',
      short: 'Extension',
      definition: 'An Extension',
      min: 0,
      max: '0',
      base: { path: 'Element.extension', min: 0, max: '*' },
      type: [{ code: 'Extension' }]
    };
    extension.snapshot.element.push(ssExt);
    const dfExt = {
      id: ssExt.id,
      path: ssExt.path,
      [MVH.nameOfEdSliceName(extension)]: MVH.edSliceName(extension, ssExt),
      max: ssExt.max
    };
    extension.differential.element.push(dfExt);
  }

  pushExtensionSlicedExtensionsElement(extension, baseId) {
    const ssExt = {
      id: `${baseId}.extension`,
      path: `${this.getExtensionPathFromExtensionID(baseId)}.extension`,
      slicing: common.createSlicingObject(extension, 'value', 'url'),
      short: 'Extension',
      definition: 'An Extension',
      min: 0,
      max: '*',
      base: { path: 'Element.extension', min: 0, max: '*' },
      type: [{ code: 'Extension' }]
    };
    extension.snapshot.element.push(ssExt);
    // extension.extension apparently doesn't need to go into the differential
  }

  pushExtensionURLElement(extension, baseId, def) {
    const ssURL = {
      id: `${baseId}.url`,
      path: `${this.getExtensionPathFromExtensionID(baseId)}.url`,
      representation: ['xmlAttr'],
      short: 'identifies the meaning of the extension',
      definition: 'Source of the definition for the extension code - a logical name or a URL.',
      min: 1,
      max: '1',
      base: { path: 'Extension.url', min: 1, max: '1' },
      type: [{ code: 'uri' }],
      fixedUri: baseId.indexOf('.') == -1 ? common.fhirURL(def.identifier, this._config.fhirURL, 'extension') : common.shortID(def.identifier),
      mapping: [{ identity: 'rim', map: 'N/A' }]
    };
    extension.snapshot.element.push(ssURL);
    const dfURL = {
      id: ssURL.id,
      path: ssURL.path,
      type: ssURL.type,
      fixedUri: ssURL.fixedUri
    };
    extension.differential.element.push(dfURL);
  }

  pushExtensionValueXElement(extension, baseId, type, value) {
    const ucType = type.charAt(0).toUpperCase() + type.slice(1);
    const ssValue = {
      id: `${baseId}.value${ucType}`,
      path: `${this.getExtensionPathFromExtensionID(baseId)}.value${ucType}`,
      short: 'Value of extension',
      definition: 'Value of extension - may be a resource or one of a constrained set of the data types (see Extensibility in the spec for list).',
      min: value.effectiveCard.min,
      max: typeof value.effectiveCard.max === 'undefined' ? '*' : value.effectiveCard.max.toString(),
      base: { path: 'Extension.value[x]', min: 0, max: '1' },
      type: [],
      mapping: [{ identity: 'rim', map: 'N/A' }]
    };
    const dfValue = {
      id: ssValue.id,
      path: ssValue.path,
      min: ssValue.min,
      type: ssValue.type
    };
    extension.snapshot.element.push(ssValue);
    extension.differential.element.push(dfValue);

    if (value instanceof mdls.ChoiceValue) {
      for (const opt of value.aggregateOptions) {
        const t = MVH.convertType(extension, this.getTypeFromValue(opt));
        if (typeof t === 'undefined') {
          continue;
        } else if (ssValue.type.some(x => x.code == t.code && MVH.typeProfile(x) == MVH.typeProfile(t) && MVH.typeTargetProfile(x) == MVH.typeTargetProfile(t))) {
          // TODO: Should we allow choices of codes w/ different value sets or require new VS be made?
          // This usually means we need some kind of composite valueset
        } else {
          ssValue.type.push(t);
          this._profileExporter.applyConstraints(opt, extension, ssValue, dfValue, false);
        }
      }
    } else if (value && value instanceof mdls.IdentifiableValue) {
      const typeObj = { code: type };
      // Set the profile or targetProfile if appropriate
      if (! value.identifier.isPrimitive) {
        const profile = this._profileExporter.lookupProfile(value.identifier, true, true);
        if (type == 'Reference') {
          MVH.setTypeTargetProfile(extension, typeObj, profile.url);
        } else if (common.isCustomProfile(profile)) {
          MVH.setTypeProfile(extension, typeObj, profile.url);
        }
      }
      ssValue.type.push(typeObj);
    } else {
      ssValue.type.push({ code: type});
    }
    if (value instanceof mdls.IdentifiableValue) {
      this._profileExporter.applyConstraints(value, extension, ssValue, dfValue, false);
    }
  }

  pushExtensionNoValueXElement(extension, baseId) {
    const ssValue = {
      id: `${baseId}.value[x]`,
      path: `${this.getExtensionPathFromExtensionID(baseId)}.value[x]`,
      short: 'Value of extension',
      definition: 'Value of extension - may be a resource or one of a constrained set of the data types (see Extensibility in the spec for list).',
      min: 0,
      max: '0',
      base: { path: 'Extension.value[x]', min: 0, max: '1' },
      type: [
        { code: 'base64Binary' }, { code: 'boolean' }, { code: 'code' }, { code: 'date' }, { code: 'dateTime' },
        { code: 'decimal' }, { code: 'id' }, { code: 'instant' }, { code: 'integer' }, { code: 'markdown' },
        { code: 'oid' }, { code: 'positiveInt' }, { code: 'string' }, { code: 'time' }, { code: 'unsignedInt' },
        { code: 'uri' }, { code: 'Address' }, { code: 'Age' }, { code: 'Annotation' }, { code: 'Attachment' },
        { code: 'CodeableConcept' }, { code: 'Coding' }, { code: 'ContactPoint' }, { code: 'Count' },
        { code: 'Distance' }, { code: 'Duration' }, { code: 'HumanName' }, { code: 'Identifier' }, { code: 'Money' },
        { code: 'Period' }, { code: 'Quantity' }, { code: 'Range' }, { code: 'Ratio' }, { code: 'Reference' },
        { code: 'SampledData' }, { code: 'Signature' }, { code: 'Timing' }, { code: 'Meta' }
      ],
      mapping: [{ identity: 'rim', map: 'N/A' }]
    };
    extension.snapshot.element.push(ssValue);
    const dfValue = {
      id: ssValue.id,
      path: ssValue.path,
      min: ssValue.min,
      max: ssValue.max,
    };
    extension.differential.element.push(dfValue);
  }

  pushExtensionSubExtensionElements(extension, baseId, baseExpression, def, field) {
    if (field.effectiveCard.max == 0) {
      // It doesn't make sense to profile *out* a sub-extension in a complex extension since the sub-extension isn't
      // there to begin with, so just skip it.
      return;
    }

    if (field.identifier && field.identifier._namespace === 'unknown') {
      //13045 , 'Unable to establish namespace for ${field1} (Extensions)' , 'Unknown' , 'errorNumber' 
      logger.error({field1 : field.identifier._name},'13045' );
      return;
    }

    const subExt = this.lookupExtension(field.identifier);

    const fieldBaseId = `${baseId}.extension:${common.shortID(field.identifier)}`;
    // By convention (for now) modifiers have the word "Modifier" in their name
    const isModifier = (/modifier/i).test(field.identifier.name);

    const ssExt = {
      id: `${fieldBaseId}`,
      path: `${this.getExtensionPathFromExtensionID(fieldBaseId)}`,
      [MVH.nameOfEdSliceName(extension)]: common.shortID(field.identifier),
      short: subExt.short,
      definition: field.identifier.isPrimitive ? (def.description ? def.description.trim() : undefined) : subExt.description,
      min: field.effectiveCard.min,
      max: typeof field.effectiveCard.max === 'undefined' ? '*' : field.effectiveCard.max.toString(),
      base: { path: 'Extension.extension', min: 0, max: '1' },
      type: [MVH.convertType(extension, { code: 'Extension', profile: subExt.url })],
      isModifier: isModifier,
      mapping: [{ identity: 'rim', map: 'N/A' }]
    };
    if (typeof ssExt.definition === 'undefined' || ssExt.definition == null || ssExt.definition == '') {
      // definition is *required*, so put something there
      ssExt.definition = field.identifier.name;
    }

    const dfExt = {
      id: ssExt.id,
      path: ssExt.path,
      [MVH.nameOfEdSliceName(extension)]: MVH.edSliceName(extension, ssExt),
      short: ssExt.short,
      definition: ssExt.definition,
      min: ssExt.min,
      max: ssExt.max,
      type: ssExt.type
    };

    extension.snapshot.element.push(ssExt);
    extension.differential.element.push(dfExt);
    this._profileExporter.applyConstraints(field, extension, ssExt, dfExt, true);
  }

  getExtensionPathFromExtensionID(id) {
    // Changes a:x.b:y.c.d:z to a.b.c.d
    return id.split('.').map(p => p.split(':')[0]).join('.');
  }

  // value[x] doesn't support choices that have extensions as elements, so we need to check for that
  choiceSupportsValueX(choice) {
    // TODO: This assumes choice options don't have their own cardinality.  This isn't true in SHR today, but
    // we're restricting it in SHR in the future.  No use going through the trouble of supporting it if it's going away.
    for (const opt of choice.aggregateOptions) {
      if (opt instanceof mdls.TBD) {
        continue;
      } else if (opt instanceof mdls.IdentifiableValue) {
        if (!opt.identifier.isPrimitive) {
          const map = this._specs.maps.findByTargetAndIdentifier(this._target, opt.identifier);
          if (typeof map === 'undefined') {
            return false;
          }
        }
      } else {
        //13053 , 'Unsupported value type: ${valueType1}. ' ,  'Unknown' , 'errorNumber'
        logger.error({valueType1 : opt.constructor.name }, '13053' );
        return false;
      }
    }

    return true;
  }

  // NOTE: Type conversion (for DSTU2) will be done by the caller
  getTypeFromValue(value) {
    if (value && value instanceof mdls.IdentifiableValue) {
      if (value.identifier.isPrimitive) {
        return { code: value.identifier.name };
      } else {
        const map = this._specs.maps.findByTargetAndIdentifier(this._target, value.identifier);
        if (typeof map === 'undefined') {
          return;
        }
        const code = VALUE_SUPPORTED_TYPES.indexOf(common.TargetItem.parse(map.targetItem).target) >= 0 ? common.TargetItem.parse(map.targetItem).target : 'Reference';
        const profile = this._profileExporter.lookupProfile(map.identifier, true, true);
        if (code == 'Reference') {
          return { code: code, targetProfile: profile.url };
        } else if (common.isCustomProfile(profile)) {
          return { code: code, profile: profile.url };
        }
        return { code };
      }
    }
  }

  getTextDiv(identifier) {
    const def = this._specs.dataElements.findByIdentifier(identifier);
    let description;
    if (def && def.description) {
      description = def.description.trim();
    }
    return `<div xmlns="http://www.w3.org/1999/xhtml">
  <p><b>${common.escapeHTML(identifier.name)} Extension</b></p>
  <p>${common.escapeHTML(description)}</p>
</div>`;
  }
}

module.exports = {ExtensionExporter, setLogger};