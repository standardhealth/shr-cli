const bunyan = require('bunyan');
const reserved = require('reserved-words');
const { Value, IdentifiableValue, RefValue, ChoiceValue, TBD, INHERITED, Identifier, PrimitiveIdentifier } = require('shr-models');
const CodeWriter = require('./CodeWriter');
const { sanitizeName, className, upperCaseFirst, stringify } = require('./common.js');

var rootLogger = bunyan.createLogger({name: 'shr-es6-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

// toFHIR is currently disabled due to known issues, so we don't want to give the impression it's fully functional
// to enable generating toFHIR functions, set this to true.
// (once it is fully functional, delete this flag and any comments about it)
const ENABLE_TO_FHIR = false;

/**
 * Generates an ES6 class for the provided element definition.
 * @param {DataElement} def - The definition of the SHR element to generate a class for.
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {object} fhir - All exported FHIR profiles and extensions.
 * @returns {string} The ES6 class definition as a string (to be persisted to a .js file).
 */
function generateClass(def, specs, fhir) {
  const lastLogger = logger;
  logger = rootLogger.child({ shrId: def.identifier.fqn });
  logger.debug('Start generating class');

  try {
    const cw = new CodeWriter();

    const imports = ['setPropertiesFromJSON', 'uuid'];

    const defFhirID = fhirID(def.identifier);
    const defFhirIDExtension = fhirID(def.identifier, 'extension');

    const fhirProfile = [...fhir.profiles, ...fhir._noDiffProfiles].find(p => p.id === defFhirID);
    const fhirExtension = fhir.extensions.find(p => p.id === defFhirIDExtension);

    // FHIRHelper should be conditionally added, but the logic to check where it's strictly necessary is basically all of writeFromFhir() so we don't want to dup that entire thing here.
    // instead just check if there's a profile or extension. it doesn't make sense to have a mapped FHIR profile or extension with no field-level mappings
    // this leaves open the possibility of "false positives" where there is an unused import. (preferable to "false negatives" where a function is used but not imported)
    if (fhirProfile || fhirExtension || def.value || def.isEntry) {
      imports.push('FHIRHelper');
    }

    cw.ln(`import { ${imports.join(', ')} } from '${relativeImportPath(def.identifier, 'json-helper')}';`).ln();
    const clazzName = className(def.identifier.name);
    let superClass;
    if (def.basedOn.length) {
      if (def.basedOn.length > 1) {
        //14009, 'Cannot create proper inheritance tree w/ multiple based on elements.  Using first element.', 'Unknown, 'errorNumber'
        logger.error('14009');

      }
      if (def.basedOn[0] instanceof TBD) {
        cw.ln(`// Ommitting import and extension of base element: ${def.basedOn[0]}`).ln();
      } else {
        superClass = className(def.basedOn[0].name);
        cw.ln(`import ${superClass} from '${relativeImportPath(def.identifier, def.basedOn[0])}';`).ln();
      }
    }

    cw.blComment(() => {
      cw.ln(`Generated class for ${def.identifier.fqn}.`);
      if (superClass) {
        cw.ln(`@extends ${superClass}`);
      }
    });
    cw.bl(`class ${clazzName}${superClass ? ` extends ${superClass}` : ''}`, () => {
      generateClassBody(def, specs, fhir, fhirProfile, fhirExtension, cw);
    });
    cw.ln(`export default ${clazzName};`);
    return cw.toString();
  } finally {
    logger.debug('Done generating class');
    logger = lastLogger;
  }
}

/**
 * Generates the body of the ES6 class.
 * @param {DataElement} def - The definition of the SHR element to generate a class body for.
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {object} fhir - All exported FHIR profiles and extensions.
 * @param {object} fhirProfile - The FHIR profile that the given SHR element maps to, if any.
 * @param {object} fhirExtension - The FHIR extension that the given SHR element maps to, if any.
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function generateClassBody(def, specs, fhir, fhirProfile, fhirExtension, cw) {
  cw.ln();

  const clazzName = className(def.identifier.name);
  if (def.isEntry) {
    writeGetterAndSetter(cw, clazzName, 'shr.base.Entry', 'entryInfo', 'entry information', '_entryInfo', 'Entry');
  }

  // Don't repeat properties that were purely inherited (without overriding).  Although overrides actually don't
  // affect the definitions now, they may in the future, so we'll leave them in.
  if (def.value && def.value.inheritance !== INHERITED) {
    if (def.value instanceof ChoiceValue) {
      writeGetterAndSetter(cw, clazzName, def.value, 'value');
    } else if (def.value instanceof IdentifiableValue) {
      // If it's the "Value" keyword, we can just rely on an inherited getter/setter
      if (!def.value.identifier.isValueKeyWord) {
        const symbol = toSymbol(def.value.identifier.name);
        writeGetterAndSetter(cw, clazzName, def.value, 'value', `value (aliases ${symbol})`, `_${symbol}`);
        writeGetterAndSetter(cw, clazzName, def.value);
      }
    } else {
      // This should only happen for TBDs
      writeGetterAndSetter(cw, clazzName, def.value);
    }
  }

  for (const field of def.fields) {
    // Don't repeat properties that were purely inherited (without overriding).  Although overrides actually don't
    // affect the definitions now, they may in the future, so we'll leave them in
    if (field.inheritance !== INHERITED) {
      writeGetterAndSetter(cw, clazzName, field);
    }
  }

  cw.blComment( () => {
    cw.ln(`Deserializes JSON data to an instance of the ${clazzName} class.`)
      .ln(`The JSON must be valid against the ${clazzName} JSON schema, although this is not validated by the function.`)
      .ln(`@param {object} json - the JSON data to deserialize`)
      .ln(`@returns {${clazzName}} An instance of ${clazzName} populated with the JSON data`);
  })
    .bl('static fromJSON(json={})', () => writeFromJson(def, cw))
    .ln();

  cw.blComment( () => {
    cw.ln(`Serializes an instance of the ${clazzName} class to a JSON object.`)
      .ln(`The JSON is expected to be valid against the ${clazzName} JSON schema, but no validation checks are performed.`)
      .ln(`@returns {object} a JSON object populated with the data from the element`);
  })
    .bl(`toJSON()`, () => writeToJson(def, cw))
    .ln();

  if (ENABLE_TO_FHIR) {
    cw.blComment( () => {
      cw.ln(`Serializes an instance of the ${clazzName} class to a FHIR object.`)
        .ln(`The FHIR is expected to be valid against the ${clazzName} FHIR profile, but no validation checks are performed.`)
        .ln(`@param {boolean} asExtension - Render this instance as an extension`)
        .ln(`@returns {object} a FHIR object populated with the data from the element`);
    })
      .bl(`toFHIR(asExtension=false)`, () => writeToFhir(def, specs, fhir, fhirProfile, fhirExtension, cw))
      .ln();
  }

  cw.blComment( () => {
    cw.ln(`Deserializes FHIR JSON data to an instance of the ${clazzName} class.`)
      .ln(`The FHIR must be valid against the ${clazzName} FHIR profile, although this is not validated by the function.`)
      .ln(`@param {object} fhir - the FHIR JSON data to deserialize`)
      .ln(`@param {string} shrId - a unique, persistent, permanent identifier for the overall health record belonging to the Patient; will be auto-generated if not provided`)
      .ln(`@param {Array} allEntries - the list of all entries that references in 'fhir' refer to`)
      .ln(`@param {object} mappedResources - any resources that have already been mapped to SHR objects. Format is { fhir_key: {shr_obj} }`)
      .ln(`@param {Array} referencesOut - list of all SHR ref() targets that were instantiated during this function call`)
      .ln(`@param {boolean} asExtension - Whether the provided instance is an extension`)
      .ln(`@returns {${clazzName}} An instance of ${clazzName} populated with the FHIR data`);
  }).bl('static fromFHIR(fhir, shrId=uuid(), allEntries=[], mappedResources={}, referencesOut=[], asExtension=false)', () => writeFromFhir(def, specs, fhir, fhirProfile, fhirExtension, cw))
    .ln();
}

/**
 * Generates a getter and a setter for a value or field.
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @param {string} clazzName - The name of the class.
 * @param {Value|string} formalDefOrName - The `Value` or a string representing the thing to generate get/set for
 * @param {string=} publicSymbol - The symbol which other classes will use to access the property.  If undefined, it will
 *    be generated using sensible defaults.
 * @param {string=} descriptiveName - The descriptive name, used in the generated comments for the get/set functions.  If
 *    undefined, it will be generated using sensible defaults.
 * @param {string=} privateSymbol - The private property name where the data will be stored in the class.  If undefined,
 *    it will be generated using sensible defaults.
 * @param {string=} typeName - The type name used in the generated JSDoc to indicate the type of the thing being got or
 *    set.  If undefined, it will be generated using sensible defaults.
 * @private
 */
function writeGetterAndSetter(cw, clazzName, formalDefOrName, publicSymbol, descriptiveName, privateSymbol, typeName) {
  if (formalDefOrName instanceof TBD) {
    cw.ln(`// Ommitting getter/setter for TBD: ${formalDefOrName.text}`).ln();
    return;
  }

  let formalName;
  let required = (formalDefOrName instanceof Value) ? formalDefOrName.effectiveCard.min === 1 : false;
  if (formalDefOrName instanceof ChoiceValue) {
    // Choices get a special treatment
    const options = formalDefOrName.options.filter(o => !(o instanceof TBD));
    if (options.length === 0) {
      cw.ln('// Ommitting getter/setter for choice with only TBD options').ln();
      return;
    }
    formalName = 'choice value; one of: ' + options.map(o => {
      return `${o.effectiveIdentifier.fqn}${o instanceof RefValue ? ' reference' : ''}`;
    }).join(', ');
    if (typeof publicSymbol === 'undefined') {
      publicSymbol = toSymbol(options.map(o => o.identifier.name).join('Or'));
    }
    if (typeof typeName === 'undefined') {
      // Create the set of types, squashing all references into one Reference type
      const typeMap = {};
      for (const o of options) {
        if (o instanceof RefValue) {
          typeMap['Reference'] = true;
        } else {
          typeMap[o.effectiveIdentifier.name] = true;
        }
      }
      const types = Object.keys(typeMap);
      typeName = types.length > 1 ? `(${types.join('|')})` : types[0];
    }
    if (typeof descriptiveName === 'undefined') {
      descriptiveName = formalName;
    }
  } else if (formalDefOrName instanceof RefValue){
    // References get a special treatment too
    formalName = `${formalDefOrName.effectiveIdentifier.fqn} reference`;
    if (typeof typeName === 'undefined') {
      typeName = 'Reference';
    }
    if (typeof publicSymbol === 'undefined') {
      publicSymbol = toSymbol(formalDefOrName.identifier.name);
    }
    if (typeof descriptiveName === 'undefined') {
      descriptiveName = formalName;
    }
  } else {
    // IdentifiableValue or string
    let originalName;
    if (formalDefOrName instanceof IdentifiableValue) {
      originalName = formalDefOrName.identifier.fqn;
      formalName = formalDefOrName.effectiveIdentifier.fqn;
    } else {
      originalName = formalDefOrName;
      formalName = formalDefOrName;
    }
    if (typeof typeName === 'undefined') {
      typeName = formalName.split('.').pop();
    }
    if (typeof publicSymbol === 'undefined') {
      publicSymbol = toSymbol(originalName.split('.').pop());
    }
    if (typeof descriptiveName === 'undefined') {
      descriptiveName = typeName;
    }
  }
  if (typeof privateSymbol === 'undefined') {
    privateSymbol = `_${publicSymbol}`;
  }
  let arrayDescriptionPostfix = '';
  if (formalDefOrName instanceof Value && formalDefOrName.card && formalDefOrName.card.isList) {
    typeName = `Array<${typeName}>`;
    arrayDescriptionPostfix = ' array';
  }
  const capitalizedPublicSymbol = upperCaseFirst(publicSymbol);
  // The variable name can't be a reserved word, so check it and modify if necessary
  const varName = reserved.check(publicSymbol, 'es2015', true) ? `${publicSymbol}Var` : publicSymbol;
  cw.blComment(() => {
    cw.ln(`Get the ${descriptiveName}${arrayDescriptionPostfix}.`)
      .ln(`@returns {${typeName}} The ${formalName}${arrayDescriptionPostfix}`);
  })
    .bl(`get ${publicSymbol}()`, `return this.${privateSymbol};`)
    .ln()
    .blComment(() => {
      cw.ln(`Set the ${descriptiveName}${arrayDescriptionPostfix}.`);
      if (required) {
        cw.ln('This field/value is required.');
      }
      cw.ln(`@param {${typeName}} ${varName} - The ${formalName}${arrayDescriptionPostfix}`);
    })
    .bl(`set ${publicSymbol}(${varName})`, `this.${privateSymbol} = ${varName};`)
    .ln()
    .blComment(() => {
      cw.ln(`Set the ${descriptiveName}${arrayDescriptionPostfix} and return 'this' for chaining.`);
      if (required) {
        cw.ln('This field/value is required.');
      }
      cw.ln(`@param {${typeName}} ${varName} - The ${formalName}${arrayDescriptionPostfix}`)
        .ln(`@returns {${clazzName}} this.`);
    })
    .bl(`with${capitalizedPublicSymbol}(${varName})`, `this.${publicSymbol} = ${varName}; return this;`)
    .ln();
}

/**
 * Generates a JSON deserializer for the class.
 * @param {DataElement} def - The definition of the SHR element to generate a deserializer for
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function writeFromJson(def, cw) {
  cw.ln(`const inst = new ${className(def.identifier.name)}();`);
  cw.ln('setPropertiesFromJSON(inst, json);');
  cw.ln('return inst;');
}

/**
 * Generates a JSON serializer for the element
 * @param {DataElement} def - The definition of the SHR element to generate a serializer for
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function writeToJson(def, cw) {
  // If the element is an Entry, put those fields on the JSON object first
  const url = `http://standardhealthrecord.org/spec/${def.identifier.namespace.replace('.', '/')}/${className(def.identifier.name)}`;
  if (def.isEntry) {
    cw.ln(`const inst = this._entryInfo.toJSON();`);
    cw.ln(`inst['EntryType'] = { 'Value' : '${url}' };`);
  } else if (def.identifier.name !== 'EntryType') {
    cw.ln(`const inst = { 'EntryType': { 'Value' : '${url}' } };`);
  } else {
    cw.ln(`const inst = {};`);
  }

  if (def.value !== undefined) {
    if (def.value instanceof ChoiceValue) {
      // Choices get a special treatment
      cw.bl(`if (this.value != null)`, () => {
        if (def.value.card.isList) {
          cw.ln(`inst['Value'] = this.value.map(f => typeof f.toJSON === 'function' ? f.toJSON() : f);`);
        } else {
          cw.ln(`inst['Value'] = typeof this.value.toJSON === 'function' ? this.value.toJSON() : this.value;`);
        }
      });
    } else if (def.value instanceof IdentifiableValue && def.value.identifier.isPrimitive) {
      cw.bl(`if (this.value != null)`, () => {
        cw.ln(`inst['Value'] = this.value;`);
      });
    } else {
      generateAssignmentIfList(def.value.card, 'Value', 'value', cw);
    }
  }

  for (const field of def.fields) {
    if (!(field instanceof TBD)) {
      generateAssignmentIfList(field.card, field.identifier.name, toSymbol(field.identifier.name), cw);
    }
  }

  cw.ln(`return inst;`);
}

/**
 * Pre-process any "choice" fields, ex "value[x]",
 * so that instead of 1 field with N type choices and M mappings it looks like NxM simple non-choice fields
 * @param {Array} elements - List of all elements in a FHIR profile, i.e., fhirProfile.snapshot.element
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {object} fhir - All exported FHIR profiles and extensions.
* @returns {Array} elements, duplicated and choice fields expanded
 */
function preProcessChoiceFields(elements, specs, fhir) {
  const newElements = [];

  for(const element of elements) {
    if (!element.path.endsWith('[x]')) {
      // passthrough for non-choice elements. dup it so we don't stomp on the original
      newElements.push( JSON.parse(JSON.stringify(element)) );
      continue;
    }

    const shrMappings = (element.mapping || []).filter(m => m.identity === 'shr');
    const typeChoiceMappings = validTypesForChoices(shrMappings, element.type, specs, fhir);

    const preStringifiedElement = JSON.stringify(element); // we're going to clone the element via stringify/parse, only stringify it once for perf
    for (const mapping in typeChoiceMappings) {
      const types = typeChoiceMappings[mapping];

      for (const type of types) {
        const dupElement = JSON.parse(preStringifiedElement);
        // now put in an entry with the given type and mapping
        const capitalizedTypeName = upperCaseFirst(type);
        dupElement.path = dupElement.path.replace('[x]', capitalizedTypeName);
        dupElement.type = [{ code: type }];
        dupElement.mapping = [{ identity: 'shr', map: mapping }];

        newElements.push(dupElement);
      }
    }
  }

  return newElements;
}

/**
 * Pre-process SHR mappings so that they only have to be looked up once.
 * @param {Array} elements - List of all elements in a FHIR profile, i.e., fhirProfile.snapshot.element
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {DataElement} def - The definition of the SHR element currently being processed
 * @returns {Array} elements, with non-SHR mappings removed, and field objects added to SHR mappings
 */
function preProcessFieldMappings(elements, specs, def) {
  for (const element of elements) {
    let mapping = element.mapping || [];

    // filter out the non-SHR mappings, which we don't care about
    mapping = mapping.filter(m => m.identity === 'shr');

    // then for any remaining ones, look up the field object
    for (const m of mapping) {
      if (m.map !== '<Value>') { // 'Value' means something special; we don't need the actual field object
        Object.assign(m, getFieldAndMethodChain(m.map, def, specs, element)); // Object.assign merges the properties to the first arg, from the following args
      }
    }

    // finally, clear out any that we couldn't find the field for
    mapping = mapping.filter(m => m.field || m.map === '<Value>');

    element.mapping = mapping;
  }
}

/**
 * Get all the "child elements" of the given element.
 * A child element is defined as follows:
 * - The path of a parent element is a prefix of the path of a child element. (ex. "Resource.field.sub" is a child of "Resource.field")
 * - If an element is sliced, elements with the same path are children.
 * - If an element is a slice, other slices on the same base element are not children.
 *
 * Note that because of how FHIR elements are defined, it is not possible to write a single function `isChild(child, parent)`
 * (ex. the name of a slice is not preserved down the line, so a sub-field of slice 2 may look like a child of slice 1, but really it is not)
 * But child elements of a given element will always be contiguous,
 * so the implementation of this function takes the list of elements, and returns the list starting from the first child after the given element up to but not including the first element that is not a child of the given element.
 * @param {ElementDefinition} parent - Element to get children of.
 * @param {Array} allElements - List of all elements to find children in.
 * @returns {Array} elements from allElements that are children of `parent`. (parent itself is not returned in the list)
 */
function childElementsOf(parent, allElements) {
  const children = [];
  let seenSelf = false;

  for (const element of allElements) {
    if (element === parent) {
      seenSelf = true;
      continue; // an element cannot be its own child
    }

    if (!seenSelf) {
      continue; // skip everything before the given element
    }

    // note - adding the dot is to prevent false positives where one field has a similar name to the next one
    // ex. AdverseEvent.suspectEntity.causality and AdverseEvent.suspectEntity.causalityAssessment
    // this logic means that slices with the same path are considered "children" of the base element
    if (element.path != parent.path && !element.path.startsWith(parent.path + '.')) {
      break; // nothing else will be a child
    }

    // but slices should not be children of each other
    if (element.path == parent.path && !parent.slicing) { // if the parent isn't a slice-root then we know it is a slice. TODO: this might break on nested slices!!
    // previously: sliceName(parent) && sliceName(element) != sliceName(parent)) {  // this one doesn't work on DSTU2 because every element has a "name", there is no distinct sliceName field
      break;
    }

    children.push(element);
  }

  return children;
}

/**
 * Generates a FHIR deserializer for the element.
 * @param {DataElement} def - The definition of the SHR element to generate a serializer for
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {object} fhir - All exported FHIR profiles and extensions.
 * @param {StructureDefinition} fhirProfile - The FHIR profile that the given SHR element maps to, if any.
 * @param {StructureDefinition} fhirExtension - The FHIR extension that the given SHR element maps to, if any.
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function writeFromFhir(def, specs, fhir, fhirProfile, fhirExtension, cw) {
  cw.ln(`const inst = new ${className(def.identifier.name)}();`);

  if (def.isEntry) {
    cw.ln(`inst.entryInfo = FHIRHelper.createInstanceFromFHIR('shr.base.Entry', {});`); // do it this way so we don't have to import Entry
    cw.ln(`inst.entryInfo.shrId = FHIRHelper.createInstanceFromFHIR('shr.base.ShrId', shrId);`);
    cw.ln(`inst.entryInfo.entryId = FHIRHelper.createInstanceFromFHIR('shr.base.EntryId', fhir['id'] || uuid());`); // re-use the FHIR id if it exists, otherwise generate a new uuid

    // copied from writeToJson above --- should this URL be configurable?
    const url = `http://standardhealthrecord.org/spec/${def.identifier.namespace.replace('.', '/')}/${className(def.identifier.name)}`;
    cw.ln(`inst.entryInfo.entryType = FHIRHelper.createInstanceFromFHIR('shr.base.EntryType', '${url}');`);
  }

  if(fhirProfile){
    writeFromFhirProfile(def, specs, fhir, fhirProfile, cw);
  }

  if (fhirExtension) {
    // extension not a profile
    writeFromFhirExtension(def, specs, fhir, fhirExtension, cw);
  }

  if (!fhirProfile && def.value) {
    // If not a profile and can be resolved directly to a value, set it as the "value" field
    writeFromFhirValue(def, specs, cw);
  }

  cw.ln('return inst;');
}

/**
 * Generates the body of the FHIR deserializer, when there is a matching FHIR profile for the element.
 * @param {DataElement} def - The definition of the SHR element to generate a serializer for
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {object} fhir - All exported FHIR profiles and extensions.
 * @param {StructureDefinition} fhirProfile - The FHIR profile that the given SHR element maps to.
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function writeFromFhirProfile(def, specs, fhir, fhirProfile, cw) {
  // FHIR profile exists, so we will pull out the mapping information from element maps

  const sliceMap = preprocessSlicing(fhirProfile);

  const isDstu2 = fhirProfile.fhirVersion === '1.0.2';

  const sliceName = (element) => isDstu2 ? element.name : element.sliceName;

  const elementHierarchy = []; // keep a stack to make looking "upward" in the object hierarchy easy
  // elementHierarchy contains objects of the form
  // {
  //    element: {ElementDefinition},  // the actual FHIR element definition
  //    didOpenBlock: {boolean},       // whether or not a new code block was opened in processing this element. necessary to know when to close blocks
  //    fhirBasePath: {string},        // the path that should be used to access child FHIR elements beyond this point. for instance, if processing a loop a variable may be declared, that variable will go here
  //    shrElementPath: {string},      // the full actual path to the mapped shrElement
  //    shrBasePath: {string},         // the path that should be used to access child SHR elements beyond this point. for instance, if processing a loop a variable may be declared, that variable will go here
  // }

  const allFhirElements = preProcessChoiceFields(fhirProfile.snapshot.element, specs, fhir);
  preProcessFieldMappings(allFhirElements, specs, def);

  for (const element of allFhirElements) {

    if (element === allFhirElements[0]) {
      // special case for the "base" element, ex the "Procedure" or "Condition" element at the top-level

      elementHierarchy.unshift({ element, didOpenBlock: false, fhirBasePath: 'fhir' });
      continue; // we know that the top-level element does not have a mapping
    }

    while (elementHierarchy.length > 0 &&
      (!element.path.startsWith(elementHierarchy[0].element.path)
        || (element.path === elementHierarchy[0].element.path && !elementHierarchy[0].element.slicing))) { // slices are not parents of other slices. we know these are both slices if they have the same path and the earlier one doesn't slice. TODO: this might break on nested slices!!
      // the top element is not our parent, so pop until it is
      const parentContext = elementHierarchy.shift();

      if (parentContext.didOpenBlock) {
        cw.outdent().ln('}');
      }
    }

    const slicing = sliceMap[element.path];
    elementHierarchy.unshift({ element, slicing });

    if (element.max === '0' || elementHierarchy.some(e => e.element.max === '0')) {
      // ignore the element, since this profile does not allow it to have a value
      // also look to see if a parent element has a max of 0, in which case we also ignore this element
      continue;
    }

    let fhirElementPath = element.path;

    // look ahead to see if this or any "child" elements have an SHR mapping

    const childElementsWithMapping = childElementsOf(element, allFhirElements).filter(e => e.mapping.length > 0);
    const elementIsList = element.max === '*' || Number(element.max) > 1;
    const baseIsList = element.base && (element.base.max == '*' || Number(element.base.max) > 1);
    const fhirIsList = elementIsList || baseIsList;
    if (element.mapping.length > 0 || childElementsWithMapping.length > 0) {
      // this element has a mapping, or some child element does, so we open up a block

      // look upward in the element hierarchy to find the first parent with a base path, if one exists
      // start with i = 1, because i = 0 = the current element
      for (let i = 1 ; i < elementHierarchy.length ; i++) {
        const parentBasePath = elementHierarchy[i].fhirBasePath;

        if (parentBasePath) {
          const parentPath = elementHierarchy[i].element.path;
          fhirElementPath = element.path.replace(parentPath, parentBasePath);
          break;
        }
      }

      if (fhirIsList) {

        // if it's a list in FHIR AND in SHR, iterate over the list
        // but if it's not a list in SHR, we need to pick the right items out (i.e. slicing, or just [0])

        // since there could be multiple mappings, assume they all have the same cardinality
        // if they don't, we'll wind up with mixing & matching lists & single items which gets messy
        // TODO: how to handle it if they don't match?

        // also consider that a [0..*] element in FHIR could map to a [0..*].[0..1] element in SHR, where there is no mapping to the parent [0..*] SHR element

        let shrIsList = elementIsList;

        if (element.mapping.length > 0) {
          shrIsList = element.mapping.some(m => m.fieldChain.some(f => f.card.isList)); // isList is true if this element's mapped field or any parents thereof is a list // TODO: we really want "unmapped" parents not "any" parents
        } else {
          // check children
          const firstChildMapping = childElementsWithMapping[0].mapping[0];
          shrIsList = firstChildMapping.field.card.isList;
        }

        let basePath;
        if (slicing && sliceName(element) && slicing[sliceName(element)]) {
          // we should already be inside the list if element has a sliceName

          // so check if the current item of the list matches the discriminator
          let discriminatorCheck = buildDiscriminatorCheck(element, slicing[sliceName(element)], fhirElementPath, allFhirElements);
          if (!discriminatorCheck) {
            discriminatorCheck = 'false'; // hack to ensure that the discriminator always includes *something* and the generated "if" is syntactically valid. should be removed once all slicing types are supported
          }
          cw.ln(`if (${discriminatorCheck}) {`).indent();

          basePath = fhirElementPath; // don't rewrite the base path
        } else if (shrIsList || element.slicing) { // if it has slicing, we should iterate to check items against the discriminator
          basePath = createVariableName(fhirElementPath);
          // if it's a list, create a for loop (including '|| []' to avoid a null check)
          cw.ln(`for (const ${basePath} of ${bracketNotation(fhirElementPath)} || []) {`).indent();
        } else {
          basePath = fhirElementPath + '[0]';
          // just a single item, create a null check for the array and the item
          cw.ln(`if (${bracketNotation(fhirElementPath)} != null && ${bracketNotation(basePath)} != null) {`).indent();
        }
        elementHierarchy[0].fhirBasePath = basePath;
        fhirElementPath = basePath; // use the new base path going forward
      } else {

        // check if we're a sliced item. ideally the "baseIsList" check above would catch that, but not all elements necessarily report the base even if there is one

        if (slicing && sliceName(element) && slicing[sliceName(element)]) {
          // we should already be inside the list if element has a sliceName

          // so check if the current item of the list matches the discriminator
          let discriminatorCheck = buildDiscriminatorCheck(element, slicing[sliceName(element)], fhirElementPath, allFhirElements);
          if (!discriminatorCheck) {
            discriminatorCheck = 'false'; // hack to ensure that the discriminator always includes *something* and the generated "if" is syntactically valid. should be removed once all slicing types are supported
          }
          cw.ln(`if (${discriminatorCheck}) {`).indent();

        } else {
          // if it's a single item, create a null check
          cw.ln(`if (${bracketNotation(fhirElementPath)} != null) {`).indent();
        }
      }
      elementHierarchy[0].didOpenBlock = true;
    }

    for (const mapping of element.mapping) {
      // now it's time to create the assignment

      if(mapping.map === '<Value>'){
        // Mapping to the value of this es6 instance
        if (def.value instanceof IdentifiableValue && def.value.identifier.isPrimitive) {
          generateFromFHIRAssignment(def.value, element, fhirElementPath, [], 'value', fhirProfile, null, cw);
        } else {
          //14008, 'Value referenced in mapping but none exist on this element ${element1}', 'Unknown, 'errorNumber'
          logger.error({ element1 : JSON.stringify(element) } ,'14008' );


        }
      } else {
        let shrElementPath = 'inst';

        for (let i = 0 ; i < mapping.fieldChain.length ; i++) {
          const field = mapping.fieldChain[i];
          const method = mapping.classMethodChain[i];

          shrElementPath = shrElementPath + '.' + method;

          if (elementHierarchy.some(e => e.element !== element && e.element.mapping.some(m => m.fieldChain.includes(field)))) {
            // this field was already handled by a parent
            continue;
          }

          // again look upward in the element hierarchy to find the first parent with an SHR base path, if one exists
          // in this case we do want to consider the current element because of nested SHR fields
          for (let i = 0 ; i < elementHierarchy.length ; i++) {
            const parentBasePath = elementHierarchy[i].shrBasePath;

            if (parentBasePath) {
              const parentPath = elementHierarchy[i].shrElementPath;
              shrElementPath = shrElementPath.replace(parentPath, parentBasePath);
              break;
            }
          }
          elementHierarchy[0].shrElementPath = shrElementPath;

          if (field.card.isList) {
            cw.ln(`${shrElementPath} = ${shrElementPath} || [];`); // initialize the list. ideally we would move this outside the loop but not a high priority

            // then create a variable to assign into
            const basePath = createVariableName(shrElementPath); // replace non-word characters to make a variable name
            elementHierarchy[0].shrBasePath = basePath;

            shrElementPath = basePath; // use the new base path going forward
          }

          if (i == mapping.fieldChain.length - 1) { // if it's the last field in the chain
            generateFromFHIRAssignment(field, element, fhirElementPath, mapping.fieldMapPath, shrElementPath, fhirProfile, slicing, cw);
          } else {
            // if it's not the last element in the field chain, it's an intermediate one so we just want to initialize the value so it's not null
            const dec = field.card.isList ? 'const ' : ''; // if in a list, we need to declare the new variable, so do `const x = new()`
            const nullCheck = field.card.isList ? '' : `${shrElementPath} || `; // if not in a list, consider that the field was already init'ed, so do `x = x || new()`

            let rhs = `FHIRHelper.createInstanceFromFHIR('${field.effectiveIdentifier.fqn}', {}, shrId)`;
            if (field instanceof RefValue) {
              rhs = `FHIRHelper.createReference( ${rhs}, referencesOut)`;
            }
            cw.ln(`${dec}${shrElementPath} = ${nullCheck}${rhs};`);
          }

          if (field.card.isList) {
            // add the newly created element to the list it belongs to
            cw.ln(`${elementHierarchy[0].shrElementPath}.push(${shrElementPath});`);
          }

          if (field instanceof RefValue) {
            // it's a Reference, so we need to follow the pointer to get to the real object
            // the simplest approach is update the path going forward by adding '.reference' to the end
            // (if we were manually writing code we'd probably define another variable, but this is a lot easier to implement)
            shrElementPath = shrElementPath + '.reference';
          }
        }
      }
    }
  }

  // close out any remaining blocks
  while (elementHierarchy.length > 0 ) {
    const parentContext = elementHierarchy.shift();

    if (parentContext.didOpenBlock) {
      cw.outdent().ln('}');
    }
  }
}

/**
 * Generates the body of the FHIR deserializer, when there is a matching FHIR extension for the element.
 * @param {DataElement} def - The definition of the SHR element to generate a serializer for
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {object} fhir - All exported FHIR profiles and extensions.
 * @param {StructureDefinition} fhirExtension - The FHIR extension that the given SHR element maps to.
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function writeFromFhirExtension(def, specs, fhir, fhirExtension, cw) {
  // When calling a method on an es6 instance that has a FHIR extension, you may either want to method to resolve directly to a value (e.g. 12)
  //   or you may want it to be represented as an extension if it is not mapped to an element in a FHIR resource, such as
  //   [{url: 'http://extension, valueInteger: 12}]
  //   asExtension tells which way to import it depending where in the parent class this exists (extension or not)
  cw.bl(`if (asExtension)`, () => {
    fhirExtension.differential.element.forEach( (element, i) => {
      if(element.path.startsWith('Extension.value') && element.path !== 'Extension.value[x]'){
        // Simple extension with a valueType
        let name = element.path.split('.')[1];

        cw.ln(`inst.value = fhir['${name}'];`);
      } else if(element.path === 'Extension.extension' && element.max != '0'){
        // Complex extension

        // The current implementation only seems to reference nested extensions, which promotes reuse of
        // components of extensions, instead of expanding them out into a form like Patient.extension.extension.valueSting
        // If this changes, this code could need to be more generic to traverse the extension tree recursively
        // Need to figure out the name of the field we are looking at by grabbing the extension and looking at the identifier
        // This seemed better than parsing the URL, which seems like a somewhat arbitrary format
        let matchingExtension;

        if (fhirExtension.fhirVersion === '1.0.2') {
          // DSTU2, element.type.profile is `0..*`:
          // http://hl7.org/fhir/DSTU2/elementdefinition-definitions.html#ElementDefinition.type.profile
          matchingExtension = fhir.extensions.find(e => e.url === element.type[0].profile[0]);
        } else {
          // assume STU3 until it crashes
          // STU3, `element.type.profile` is `0..1`:
          // http://hl7.org/fhir/STU3/elementdefinition-definitions.html#ElementDefinition.type.profile
          matchingExtension = fhir.extensions.find(e => e.url === element.type[0].profile);
        }

        let instance = matchingExtension.identifier[0].value;
        let methodName = toSymbol(instance.split('.')[instance.split('.').length-1]);
        // find the right extension in the list
        const url = element.type[0].profile;
        const varName = `match_${i}`; // ensure a unique variable name here
        cw.ln(`const ${varName} = fhir['extension'].find(e => e.url == '${url}');`);
        cw.bl(`if (${varName} != null)`, () => {
          cw.ln(`inst.${methodName} = FHIRHelper.createInstanceFromFHIR('${instance}', ${varName}, shrId, allEntries, mappedResources, referencesOut, true);`); // asExtension = true here, false(default value) everywhere else
        });
      }
    });
  });
}

/**
 * Generates a FHIR deserializer for the element when the element maps to a single value.
 * @param {DataElement} def - The definition of the SHR element to generate a serializer for
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function writeFromFhirValue(def, specs, cw) {
  cw.bl(`if (!asExtension && fhir != null)`, () => {
    if (def.value.effectiveIdentifier != null) {
      if (def.value.effectiveIdentifier.isPrimitive) {
        // it's a primitive value means we can set it directly
        cw.ln(`inst.value = fhir;`);
      } else {
        const shrType = def.value.effectiveIdentifier.fqn;
        cw.ln(`inst.value = FHIRHelper.createInstanceFromFHIR('${shrType}', fhir, shrId, allEntries, mappedResources, referencesOut);`);
      }
    } else {
      // it could be any of the options, and we can't necessarily tell which one here
      // so just call createInstance to leverage the logic that looks up profiles
      cw.ln(`inst.value = FHIRHelper.createInstanceFromFHIR(null, fhir, shrId, allEntries, mappedResources, referencesOut);`);
    }
  });
}

/**
 * Convert dot notation for a given path to bracket notation.
 * Used to maintain a convention of SHR => dot notation, FHIR => bracket notation,
 * but dot notation is used internally to make the logic simpler.
 * Ex. "field1.field2[0].field3" => "field1['field2'][0]['field3']"
 * @param {string} dotNotation - Path to some location, ex "field1.field2.field3"
 */
function bracketNotation(dotNotation) {
  return dotNotation.split('.')
    .map((e, i) => {
      if (i == 0) {
        return e;
      }

      if (e.endsWith(']')) {
        // already bracketed, ie, an array index
        const bracket = e.lastIndexOf('[');

        return `['${e.slice(0, bracket)}']${e.slice(bracket)}`;
      }

      return `['${e}']`;
    })
    .join('');
}

/**
 * Construct a variable name to contain the value at the given path.
 * @param {string} path - Path to some location, ex "field1.field2.field3"
 */
function createVariableName(path) {
  return path.replace(/\W+/g, '_');
}

/**
 * Helper to get the target profile for a FHIR reference type, across different FHIR versions.
 * @param {ElementDefinition} fhirElement - FHIR element to get the target profile for
 * @param {boolean} isDstu2 - Whether the given element comes from a DSTU2 definition. Assume if it's not DSTU2 then it's STU3.
 * @returns {string} target profile URL
 * @private
 */
function getTargetProfile(fhirElement, isDstu2) {
  if (isDstu2) {
    // DSTU2, use element.type.profile, 0..*
    // http://hl7.org/fhir/DSTU2/elementdefinition-definitions.html#ElementDefinition.type.profile
    return fhirElement.type[0].profile[0];
  } else {
    // assume STU3 until it crashes
    // STU3, use `element.type.targetProfile`, 0..1
    // http://hl7.org/fhir/STU3/elementdefinition-definitions.html#ElementDefinition.type.targetProfile
    return fhirElement.type[0].targetProfile;
  }
}

/**
 * Pre-processing to identify slices.
 * Slicing requires information spread across multiple elements so it doesn't play nice with the iterative approach in writeFromFhir.
 * Example: https://www.hl7.org/fhir/profiling-examples.html#blood-pressure
 * Say we want to pull out the "systolic" component,
 *  1) we need the context of the prior Observation.component element to know what the discriminator of the slice is ("code")
 *  2) we need the fixed value of the later Obervation.component.code element to know which value to look for
 * so to handle this we create a map of sliceGroup -> sliceName -> discriminator&code. in the blood pressure example, we'd produce a map like the following:
 * { 'Observation.component' : {
 *     'systolic': [{path: 'Observation.component.code', value: <loinc, 8480-6...>}],
 *     'diastolic': [{path: 'Observation.component.code', value: <loinc, 8462-4...>}]
 *   }
 * }
 * Note that the structure of slicing changed a little between DSTU2 and STU3 - this function should produce a single consistent output format.
 */
function preprocessSlicing(fhirProfile) {
  const sliceMap = {};

  const isDstu2 = fhirProfile.fhirVersion === '1.0.2';

  const sliceName = (element) => isDstu2 ? element.name : element.sliceName;

  // to build up this map, we keep a stack because slices can be nested
  const sliceStack = []; // note: javascript doesn't have Array.peek so we use shift/unshift to keep the "top" at index 0

  for (let element of fhirProfile.snapshot.element) {

    while (sliceStack.length > 0 && !element.path.startsWith(sliceStack[0].path)) {
      // ended a slice group so pop the top element
      const sliceGroup = sliceStack.shift();

      sliceMap[sliceGroup.path] = sliceGroup.elements;
    }

    if (element.slicing) {
      // starting a new slice group

      const elementSlicing = JSON.parse(JSON.stringify(element.slicing)); // deep copy so we don't stomp on the source object

      // pre-process and combine the element paths so we don't have to do it on every check
      if (isDstu2) {
        // in DSTU2 the discriminator is a list of strings = list of paths
        // we convert it to make it look more like STU3
        elementSlicing.discriminator = elementSlicing.discriminator.map( d => ({ path: element.path + '.' + d}));
      } else {
        // in STU3 the discriminator is a list of objects
        elementSlicing.discriminator.forEach( d => d.path = element.path + '.' + d.path);
      }

      const sliceGroup = { path: element.path, slicing: elementSlicing, currentSlice: null, elements: {} };

      sliceStack.unshift(sliceGroup);
    }

    // if we just started a new slice group above ^,
    // there is the possibility that it is within another slice. so if we just started one check to see if there is an index 1; if not, check if there is an index 0
    /* sample elements: (truncated)
        {
          "id": "DomainResource:odh-OccupationalDataSection.extension",
          "path": "DomainResource.extension",
          "slicing": {
            "discriminator": [{ "type": "value", "path": "url" }],
            "rules": "open"
          }
        }, {
          "id": "DomainResource:odh-OccupationalDataSection.extension:informationitem",
          "path": "DomainResource.extension",
          "type": [{ "code": "Extension", "profile": "http://example.com/fhir/StructureDefinition/shr-base-InformationItem-extension" }],
          "sliceName": "informationitem",
          "slicing": {
            "id": "1",
            "discriminator": [{ "type": "profile", "path": "valueReference.reference.resolve()" }],
            "ordered": false,
            "rules": "open"
          }
        }
    */

    const sliceIndex = element.slicing ? 1 : 0;
    if (sliceStack[sliceIndex]) {
      const sliceNm = sliceName(element);
      if (sliceNm) {
        // starting a new slice element, only possible if already within a slice group
        sliceStack[sliceIndex].currentSlice = sliceNm;
        sliceStack[sliceIndex].elements[sliceNm] = [];
      }

      for (const sliceGroup of sliceStack) { // multiple slices can slice on the same discriminator so this needs to loop
        if (pathMatchesDiscriminator(element.path, sliceGroup.slicing.discriminator)) {
          // element.path matches a discriminator; we found a value to match on

          // this could be all sorts of things, fixedCode, fixedString, fixedWhatever, so figure out what type it is and look for fixed<Type>
          let fixedValue;

          // TODO: this only works for "value" type discriminators; don't forget about the other types

          for (const type of element.type) {
            const typeName = type.code;
            const fieldName = 'fixed' + upperCaseFirst(typeName); // ex. 'code' => 'fixedCode'

            if (element[fieldName] != null) {
              // don't just check for falsy, consider `fixedBoolean: false`
              fixedValue = element[fieldName];
            }
          }

          if (fixedValue == null) {
            //14005, 'Could not identify fixed value for: ${element1}', 'Unknown, 'errorNumber'
            logger.error({ element1 : JSON.stringify(element) }, '14005');
          }

          sliceGroup.elements[sliceGroup.currentSlice].unshift( { path: element.path, value: fixedValue } );
        } else if (element.path.endsWith('.extension') && pathMatchesDiscriminator(`${element.path}.url`, sliceGroup.slicing.discriminator)) {
          // extensions slice on .url, which doesn't necessarily have its own element definition. use the extension

          let url;
          if (isDstu2) {
            if (element.type[0].profile) {
              url = element.type[0].profile[0];
            }
          } else {
            url = element.type[0].profile;
          }

          if (url) {
            sliceGroup.elements[sliceGroup.currentSlice].unshift( { path: `${element.path}.url`, value: url } );
          }
        } else if (
          element.type
          && element.type[0].code === 'CodeableConcept'
          && (
            pathMatchesDiscriminator(`${element.path}.coding`, sliceGroup.slicing.discriminator)
            || pathMatchesDiscriminator(`${element.path}.coding.code`, sliceGroup.slicing.discriminator)
          )
        ) {
          // possibly sliced on code.coding.code, but the sub-coding.code fields weren't included.
          // check for a value set binding here

          if (element.binding && element.binding.strength === 'required' && element.binding.valueSetReference && element.binding.valueSetReference.reference) {
            sliceGroup.elements[sliceGroup.currentSlice].unshift( { path: `${element.path}.coding.code`, valueSet: element.binding.valueSetReference.reference } );
          }

        } else if (
          element.type
          && element.type[0].code === 'Reference'
          && (
            pathMatchesDiscriminator(`${element.path}.reference`, sliceGroup.slicing.discriminator)
            || (isDstu2 && pathMatchesDiscriminator(`${element.path}.reference.@profile`, sliceGroup.slicing.discriminator))
          )
        ) {
          sliceGroup.elements[sliceGroup.currentSlice].unshift( {
            path: `${element.path}.reference`,
            profile: getTargetProfile(element, isDstu2),
            resolve: sliceGroup.slicing.discriminator.some(d => d.path.startsWith(`${element.path}.reference.resolve()`))
          } );
        }
      }
    }
  }

  // if the fhir profile ends and we still have "open" slices, finalize them here
  while (sliceStack.length > 0) {
    const sliceGroup = sliceStack.shift();
    sliceMap[sliceGroup.path] = sliceGroup.elements;
  }

  return sliceMap;
}

/**
 * Checks if a given path matches a discriminator, allowing for the special case of discriminators
 * containing resolve() functions.
 * @param {string} elementPath - the element path from the profile
 * @param {string[]} discriminator - the discriminator array
 * @returns {object} the matching discriminator if there is one, null otherwise
 */
function pathMatchesDiscriminator(elementPath, discriminator) {
  // According to spec, valid discriminator paths can contain:
  // - Element selections (e.g. FHIRPath statements without "()" such as component.value)
  // - The function extension(url) to allow selection of a particular extension
  // - The function resolve() to allow slicing to across resource boundaries
  // The FHIR exporter only exports discriminators for the first and last cases, so we don't need
  // to handle the extension(url) case.  For the resolve() case, wherever resolve() occurs, that
  // marks where the current profile instance's path stops (any remaining path is in the resolved
  // reference). In our case, I think the resolve() will always be at the end anyway, but just in case
  // split on the resolve() phrase and only match against the first part.
  return discriminator.find((d) => {
    return elementPath == d.path.split(/\.resolve\(\)\.?/)[0];
  });
}

/**
 * Build up the check to see if an item matches the slicing discriminator.
 * The return value of this function is expected to be used inside an "if",
 * so this function should not include that if.
 * @param {ElementDefinition} element - The current FHIR element that is being mapped
 * @param {Array} slicing - Preprocessed slicing information for the given element path and slice, see `preprocessSlicing`.
 * @param {string} fhirElementPath - Context-based path of the current location
 * @param {Array} allFhirElements - All FHIR elements, used for lookups
 */
function buildDiscriminatorCheck(element, slicing, fhirElementPath, allFhirElements) {
  return slicing.map(discriminator => {
    const path = discriminator.path.slice(element.path.length + 1); // slice off the current path plus the dot from the start of the discriminator path
    const pathArray = path.split('.');
    // first build up some null checks
    let prev = fhirElementPath;
    let fullPath = element.path;
    let discCheck;
    for (let i = 0 ; i < pathArray.length ; i++) {
      const v = pathArray[i];
      prev = prev + '.' + v;
      const bracketPath = bracketNotation(prev);

      discCheck = (i == 0 ? '' : discCheck + ' && ') + bracketPath + ' != null'; // don't add to the previous on index 0; there is no previous

      fullPath = fullPath + '.' + v;

      let currElement = allFhirElements.find(e => e.path === fullPath);

      if (!currElement) {
        if (fullPath.endsWith('.extension.url')) {
          // extension.url doesn't always exist in the profiles
          currElement = {}; // HACK just to get past the list check below
        } else if (fullPath.endsWith('.coding')) {
          // codeable concepts don't always get their .coding and .coding.code included in the profile. we need to manually fake an element for .coding
          currElement = { max: '*', type: [{ code: 'Coding' }], path: fullPath };
        } else if (fullPath.endsWith('.coding.code')) {
          currElement = {}; // HACK just to get past the list check below
        } else if (fullPath.endsWith('.reference')) {
          currElement = {}; // HACK just to get past the list check below
        }
      }

      if (currElement.max == '*' || Number(currElement.max) > 1 || ( currElement.base && (currElement.base.max == '*' || Number(currElement.base.max) > 1))) {
        // we found a list, so we need to loop over the list to find if ANY element matches the discriminator
        let innerVar = String.fromCharCode(fhirElementPath.charCodeAt(0) + 1); // pick a single letter variable name, increment the first character of the previous by 1
        // note: this will break if we go past 'z'. presumably it should always start from 'fhir' then go to 'g' so theres not much chance of hitting 'z'

        discCheck = discCheck + ' && ' + bracketNotation(prev) + '.some(' + innerVar + ' => ' + buildDiscriminatorCheck(currElement, [discriminator], innerVar, allFhirElements) + ')';
        break; // break the loop here because the recursive call handles the rest of the elements
      }

      if (i == pathArray.length - 1) {
        // last element is the one we actually have to check for things

        // Reminder of the 5 types of slicing
        // value   - The slices have different values in the nominated element
        // exists  - The slices are differentiated by the presence or absence of the nominated element
        // pattern - The slices have different values in the nominated element, as determined by testing them against the applicable ElementDefinition.pattern[x]
        // type    - The slices are differentiated by type of the nominated element to a specifed profile
        // profile - The slices are differentiated by conformance of the nominated element to a specifed profile

        // TODO: only value and profile are implemented right now. Does shr-fhir-export produce any other type?

        if (discriminator.value) {
          discCheck = `${discCheck} && ${bracketPath} === ${stringify(discriminator.value)}`;
        } else if (discriminator.valueSet) {
          discCheck = `${discCheck} && FHIRHelper.valueSet('${discriminator.valueSet}').includes(${bracketPath})`;
        } else if (discriminator.profile) {
          discCheck = `${discCheck} && FHIRHelper.conformsToProfile(allEntries.find(e => e.fullUrl === ${bracketPath}), '${discriminator.profile}')`;
        }
      }
    }

    return discCheck;

  }).join(' && ');
}

/**
 * Given a list of mappings, get the object representing the field definition found by traversing those mappings,
 * plus a single "method chain" that represents the path to that field.
 * @param {string} mapping - A mapping string taken directly from a FHIR element mapping, ex "<shr.core.Something>.<shr.pkg.OtherThing>"
 * @param {DataElement} def - The definition of the SHR element currently being processed
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {ElementDefinition} element - Element the mapping belongs to, currently only used for debugging and logging
 * @returns {object} field: found field object, classMethodChain: path to destination field, fieldMapPath: array of individual mappings
 */
function getFieldAndMethodChain(mapping, def, specs, element) {
  const fieldMapPath = mapping.match(/<([^>]*)>/g);
  if(fieldMapPath){
    let field;
    const fieldChain = [];
    let currDef = def;

    const classMethodChain = []; // build up the method chain as we iterate over the path in the mapping

    // for nested element mappings, such as "Patient.person.address", we have to look up Patient.person and then Person.address
    for(const pathElement of fieldMapPath) {
      const elementIdentifier = fhirMappingToIdentifier(pathElement);

      let methodName;

      if (elementIdentifier.isEntryKeyWord || elementIdentifier.isConceptKeyWord) {
        // TODO: figure out how to handle these.
        // note that the only case in the spec right now is mapping _Entry.EntryId and _Entry.EntryType, which are already handled.

        // example from an earlier version of the spec: "AllergyIntolerance:cimi-allergy-AdverseSensitivityToSubstanceStatement.assertedDate" maps to "<_Entry>.<shr.core.CreationTime>"
        break;
      }

      if (currDef.value instanceof IdentifiableValue && matchesEffectiveIdentifierOrIncludesTypes(currDef.value, elementIdentifier)) {
        methodName = 'value';
        field = currDef.value;
      } else {
        let matchingChoice = currDef.value instanceof ChoiceValue && currDef.value.options.find(o => elementIdentifier.equals(o.effectiveIdentifier));

        if (matchingChoice) {
          methodName = 'value';
          field = matchingChoice;
        } else {
          // look for it in all the fields
          field = currDef.fields.find(f => matchesEffectiveIdentifierOrIncludesTypes(f, elementIdentifier));

          if (field) {
            methodName = toSymbol(field.effectiveIdentifier.name);
          }
        }
      }

      if (!field) {
        //14006,  'Unable to find field with identifer ${elementId1} on element ${currDefId1}; Original Element: ${defId1}; full mapping: ${mapping1}; FHR Path: ${elementPath1} ID: ${elementId2}', 'Unknown, 'errorNumber'
        logger.error( { elementId1 : elementIdentifier, currDefId1: currDef.identifier, defId1: def.identifier, mapping1 : mapping, elementPath1: element.path, elementId2 : element.id },  '14006' );
        break;
      }

      fieldChain.push(field);
      classMethodChain.push(methodName);
      currDef = specs.dataElements.byNamespace(field.effectiveIdentifier.namespace).find(e => e.identifier.equals(field.effectiveIdentifier));
    }

    return {field, fieldChain, classMethodChain, fieldMapPath};
  }
  return {};
}

/**
 * Checks if an IdentifiableValue field is a match for an identifier, taking into account includesType constraints.
 * NOTE: EffectiveIdentifier is checked instead of identifier because the mapping should always use the effectiveIdentifier.
 * NOTE: Does not work with ChoiceValues.  Thos should be handled separately.
 * @param {IdentifiableValue} identifiableValueField - an IdentifiableValueField to check for a match against an identifier
 * @param {Identifier} identifier - the identifier to match against
 */
function matchesEffectiveIdentifierOrIncludesTypes(identifiableValueField, identifier) {
  // First check the effectiveIdentifier
  if (identifier.equals(identifiableValueField.effectiveIdentifier)) {
    return true;
  }
  // Now check the includesType constraints (if applicable)
  const includesTypeConstraints = identifiableValueField.constraintsFilter.own.includesType.constraints;
  for (const itc of includesTypeConstraints) {
    if (identifier.equals(itc.isA)) {
      return true;
    }
  }
  // No match
  return false;
}


/**
 * Given a FHIR element with a "choice" type, e.g. "value[x]",
 * this function maps the choices for type to the appropriate mapping choices.
 *
 * Example 1: (in pseudo-FHIR)
 *  mcode.Tumor.value[x]
 *   - type: [Quantity, CodeableConcept, string, Range, Ratio, time, dateTime, Period]
 *   - mapping: [shr.core.Quantity, shr.core.CodeableConcept, shr.core.Range, shr.core.Ratio, shr.core.TimePeriod]
 *
 * result:
 *  { shr.core.Quantity => [Quantity], shr.core.CodeableConcept => CodeableConcept, shr.core.Range => Range, shr.core.Ratio => Ration, shr.core.TimePeriod => Period }
 *
 * Example 2:
 *  mcode.CancerDisorder.onset[x]
 *   - type: [dateTime, Age, Period, Range, string]
 *   - mapping: [shr.base.Onset]
 *
 * result:
 *  { shr.base.Onset => [dateTime, Age, Period, Range, string] }
 *
 * @param {Array} shrMappings - The list of SHR mappings for the field (i.e., element.mapping)
 * @param {Array} fhirTypes - The list of FHIR types the field can be (i.e., element.type)
 * @param {Specifications} specs - All specifications, to perform lookups
 * @param {object} fhir - All exported FHIR profiles and extensions.
 * @returns {object} mapping between SHR types => FHIR types
 */
function validTypesForChoices(shrMappings, fhirTypes, specs, fhir) {
  const typesByChoice = {};

  const allFHIRProfiles = [...fhir.profiles, ...fhir._noDiffProfiles];

  for (const mapping of shrMappings) {
    const fieldMapPath = mapping.map.match(/<([^>]*)>/g);
    const identifier = fhirMappingToIdentifier(fieldMapPath[fieldMapPath.length - 1]);
    const currMappingTypes = [];

    const de = specs.dataElements.byNamespace(identifier.namespace).find(e => e.identifier.equals(identifier));

    if (de.value instanceof IdentifiableValue) {
      const match = fhirTypes.find(t => t.code == de.value.effectiveIdentifier.fqn);
      if (match) {
        currMappingTypes.push(match.code);
      }
    } else if (de.value instanceof ChoiceValue) {
      for (const choice of de.value.options) {
        const matches = fhirTypes.filter(t => t.code == choice.effectiveIdentifier.fqn || t.code == choice.effectiveIdentifier.name);
        // note that the name check matches on, eg "Quantity" and "shr.core.Quantity".
        // TODO: is this a safe assumption that if an SHR type name matches a FHIR type name they are related?
        if (matches) {
          currMappingTypes.push(...matches.map(m => m.code));
        }

        const fhirProfile = allFHIRProfiles.find(p => p.id == fhirID(choice.effectiveIdentifier));
        if (fhirProfile) {
          const fhirMatch = fhirTypes.find(t => t.code == fhirProfile.type);
          if (fhirMatch) {
            currMappingTypes.push(fhirMatch.code);
          }
        }
      }
    }

    const match = fhirTypes.find(t => t.code == de.identifier.fqn || t.code == de.identifier.name);
    if (match) {
      currMappingTypes.push(match.code);
    }

    const fhirProfile = allFHIRProfiles.find(p => p.id == fhirID(de.identifier));
    if (fhirProfile) {
      const fhirMatch = fhirTypes.find(t => t.code == fhirProfile.type);
      if (fhirMatch) {
        currMappingTypes.push(fhirMatch.code);
      }
    }

    typesByChoice[mapping.map] = new Set(currMappingTypes); // using a Set here to avoid dups
  }

  return typesByChoice;
}

/**
 * NOTE toFHIR is disabled by default - see ENABLE_TO_FHIR at top
 * Generates a FHIR serializer for the element.
 * @param {DataElement} def - The definition of the SHR element to generate a serializer for
 * @param {Specifications} specs - All SHR specifications, to be used for lookups and xrefs.
 * @param {object} fhir - All exported FHIR profiles and extensions.
 * @param {object} fhirProfile - The FHIR profile that the given SHR element maps to, if any.
 * @param {object} fhirExtension - The FHIR extension that the given SHR element maps to, if any.
 * @param {CodeWriter} cw - The CodeWriter instance to use during generation
 * @private
 */
function writeToFhir(def, specs, fhir, fhirProfile, fhirExtension, cw) {
  const alreadyMappedElements = new Map;

  cw.ln(`let inst = {};`);

  if(fhirProfile !== undefined){
    // FHIR profile exists, so we will pull out the mapping information from element maps

    if(def.isEntry){
      cw.ln(`inst['resourceType'] = '${fhirProfile.type}';`);
    }

    /* UNCOMMENT BELOW CODE TO JAM IN DUMMY MAPPING DATA */

    // const addMapping = (path, map, id) => {
    //   const el = fhirProfile.snapshot.element.find(f => (f.path === path && (!id || f.id === id)));
    //   el.mapping = el.mapping || [];
    //   el.mapping = el.mapping.filter(m => m.identity !== 'shr');
    //   el.mapping.push(map);
    // };
    // if(fhirProfile.name === 'PatientEntryProfile'){
    //   // addMapping('Patient.active', {'identity': 'shr', 'map': '<shr.simple.BooleanValue>'}); // DONE
    //   // addMapping('Patient.birthDate', {'identity': 'shr', 'map': '<Value>'}); // DONE
    //   // addMapping('Patient.name.text', {'identity': 'shr', 'map': '<shr.simple.StringValue>'}); // DONE
    //   // addMapping('Patient.deceasedBoolean', {'identity': 'shr', 'map': '<shr.fhir.Deceased>'}); // DONE
    //   addMapping('Patient.extension', {'identity': 'shr', 'map': '<shr.simple.IntegerValueElement>'}, 'Patient:shr-fhir-PatientEntry.extension:integervalueelement');
    //   addMapping('Patient.extension', {'identity': 'shr', 'map': '<shr.simple.DecimalValueElement>'}, 'Patient:shr-fhir-PatientEntry.extension:decimalvalueelement');
    //   addMapping('Patient.extension', {'identity': 'shr', 'map': '<shr.fhir.ComplexExtension>'}, 'Patient:shr-fhir-PatientEntry.extension:complexextension');
    // }
    // if(fhirProfile.name === 'PractitionerEntryProfile'){
    //   // addMapping('Practitioner.active', {'identity': 'shr', 'map': '<shr.simple.DoubleNestedBooleanValue>.<shr.simple.NestedBooleanValue>.<shr.simple.BooleanValue>'}); // DONE
    //   // addMapping('Practitioner.name.text', {'identity': 'shr', 'map': '<shr.simple.NestedStringValue>.<shr.simple.StringValue>'}); // DONE
    // }
    // if(fhirProfile.name === 'PhotoNoteProfile'){
    //   // addMapping('Attachment.title', {'identity': 'shr', 'map': '<Value>'}); // DONE
    // }

    for (let element of fhirProfile.snapshot.element) {
      const mapping = element.mapping && element.mapping.find(m => m['identity'] === 'shr');
      let baseIsList = element.base && element.base.max == '*';
      baseIsList = baseIsList || (element.mapping && element.mapping.filter(elem => elem.identity == 'shr').length > 1);
      if(mapping !== undefined){
        if(mapping.map === '<Value>'){
          // Mapping to the value of this es6 instance
          if (def.value instanceof IdentifiableValue && def.value.identifier.isPrimitive) {
            generateToFHIRAssignment(def.value.card.isList, baseIsList, 1, element.path, 'value', fhirProfile, cw);
          } else {
            //14007, 'Value referenced in mapping but none exist on this element ${element1}', 'Unknown, 'errorNumber'
            logger.error({ element1 : element } ,'14007' );

          }
        } else {
          // Mapping to a field within this es6 instance
          const fieldMapPath = mapping.map.match(/<([^>]*)>/g);
          if(fieldMapPath){
            // Generate a chain if mapped multiple levels deep, such as myField1.subField2
            const classMethodChain = fieldMapPath.map(e => toSymbol(fhirMappingToIdentifier(e).name)).join('.');
            // find related field if available
            let field = def.fields.find(f => f.identifier && f.identifier.equals(fhirMappingToIdentifier(fieldMapPath[0])));

            // TODO: for nested element mappings, such as "Patient.person.address", we have to look up Patient.person and then Person.address
            // currently it will only look at Patient.person

            if(field !== undefined){
              // console.log(field.identifier.name);
              if (!alreadyMappedElements.has(classMethodChain)) {
                const constraintsLength = field.constraintsFilter.includesType.constraints.length;
                generateToFHIRAssignment(field.card.isList, baseIsList, constraintsLength, element.path, classMethodChain, fhirProfile, cw);
                alreadyMappedElements.set(classMethodChain, element.path);
              }
            }
          }
        }
      }
    }
  }

  // not a profile, check to see if it has an extension
  if(fhirExtension){
    // When calling a method on an es6 instance that has a FHIR extension, you may either want to method to resolve directly to a value (e.g. 12)
    //   or you may want it to be represented as an extension if it is not mapped to an element in a FHIR resource, such as
    //   [{url: 'http://extension, valueInteger: 12}]
    //   asExtension tells which way to export it depending where in the parent class this exists (extension or not)
    cw.bl(`if (asExtension)`, () => {
      fhirExtension.differential.element.forEach( (element) => {
        if(element.path === 'Extension.url'){
          cw.ln(`inst['url'] = '${element.fixedUri}';`);
        } else if(element.path.startsWith('Extension.value') && element.path !== 'Extension.value[x]'){
          // Simple extension with a valueType
          let name = element.path.split('.')[1];
          cw.ln(`inst['${name}'] = this.value;`);
        } else if(element.path === 'Extension.extension' && element.max != '0'){
          // Complex extension
          // The current implementation only seems to reference nested extensions, which promotes reuse of
          // components of extensions, instead of expanding them out into a form like Patient.extension.extension.valueSting
          // If this changes, this code could need to be more generic to traverse the extension tree recursively
          // Need to figure out the name of the field we are looking at by grabbing the extension and looking at the identifier
          // This seemed better than parsing the URL, which seems like a somewhat arbitrary format

          let matchingExtension;

          if (fhirExtension.fhirVersion === '1.0.2') {
            // DSTU2, element.type.profile is `0..*`:
            // http://hl7.org/fhir/DSTU2/elementdefinition-definitions.html#ElementDefinition.type.profile
            matchingExtension = fhir.extensions.find(e => e.url === element.type[0].profile[0]);
          } else {
            // assume STU3 until it crashes
            // STU3, `element.type.profile` is `0..1`:
            // http://hl7.org/fhir/STU3/elementdefinition-definitions.html#ElementDefinition.type.profile
            matchingExtension = fhir.extensions.find(e => e.url === element.type[0].profile);
          }
          let instance = matchingExtension.identifier[0].value;
          let methodName = toSymbol(instance.split('.')[instance.split('.').length-1]);
          cw.bl(`if (this.${methodName} != null)`, () => {
            cw.ln(`inst['extension'] = inst['extension'] || [];`);
            cw.ln(`inst['extension'].push(this.${methodName}.toFHIR(true));`);
          });
        }
      });
    });
  }

  // Check to see if this can be resolved directly to a value and it is not a profile
  if (!fhirProfile && def.value) {

    // If this can be resolved directly to a value, give it the option to generate the value
    // Don't resolve to a value if it is flagged as being represented as an Extension
    cw.bl(`if (!asExtension && this.value != null)`, () => {

      // No profile, no mapping, not an extension, but it has a value so we can resolve the value
      cw.bl(`if (this.value != null)`, () => {
        if (def.value.card.isList) {
          cw.ln(`inst = this.value.map(f => typeof f.toFHIR === 'function' ? f.toFHIR() : f );`);
        } else {
          cw.ln(`inst = typeof this.value.toFHIR === 'function' ? this.value.toFHIR() : this.value;`);
        }
      });
    });
  }

  cw.ln(`return inst;`);
}

/**
 * Returns identifier from mapping in FHIR profile element
 * @param {string} mappingString - string in the format <shr.namespace.Element>
 * @returns {identifier} The identifier; returns null if Value
 */
function fhirMappingToIdentifier(mappingString){
  if(mappingString === '<Value>'){
    return null;
  } else if(mappingString === '<_Entry>'){
    return new Identifier('', 'Entry');
  }
  const bareMappingString = mappingString.slice(1,-1); // remove <>
  const mappingStringArray = bareMappingString.split('.');
  const name = mappingStringArray.pop();
  const namespace = mappingStringArray.join('.');
  return namespace === '' ? new PrimitiveIdentifier(name) : new Identifier(namespace, name);
}

/**
 * Writes out an object assignment string based on the cardinality
 * @param {object} card - the Cardinality object for the value being written
 * @param {string} jsonString - the key to use to write the value to JSON
 * @param {string} valueString - the string to get the required value out of 'this'
 * @param {CodeWriter} cw - The CodeWriter that's writing the class
 */
function generateAssignmentIfList(card, jsonString, valueString, cw) {
  cw.bl(`if (this.${valueString} != null)`, () => {
    if (card.isList) {
      cw.ln(`inst['${jsonString}'] = this.${valueString}.map(f => f.toJSON());`);
    } else {
      cw.ln(`inst['${jsonString}'] = typeof this.${valueString}.toJSON === 'function' ? this.${valueString}.toJSON() : this.${valueString};`);
    }
  });
}

/**
 * NOTE toFHIR is disabled by default - see ENABLE_TO_FHIR at top
 * Generates the "assignment" portion of the toFHIR method, where the SHR elements get built into the FHIR json
 * @param {boolean} cardIsList whether the element cardinality is a "list" (aka > 1)
 * @param {boolean} baseCardIsList whether the element is "based" on an element whose cardinality is a list (> 1)
 * @param {Number} constraintsLength the number of constraints on the element; used to determine whether there are more contstrained elements than cardinalities
 * @param {string} fhirElementPath the FHIR element that the data should be put into (in FQN notation)
 * @param {string} valueString the SHR element that the data should be taken from (in FQN notation)
 * @param {StructureDefinition} fhirProfile the FHIR profile the element comes from
 * @param {CodeWriter} cw the CodeWriter that is writing the file for this element
 */
function generateToFHIRAssignment(cardIsList, baseCardIsList, constraintsLength, fhirElementPath, valueString, fhirProfile, cw) {
  const valueArray = valueString.split('.');
  let prev = 'this.' + valueArray.shift(); // start with this.firstInChain
  let check = `${prev} != null`; // e.g. this.firstInChain !== null && this.firstInChain.secondInChain !== null
  valueArray.forEach(v => {
    prev = prev + '.' + v;
    check = check + ' && ' + prev + ' != null';
  });

  // If we have more things (as evidenced by the 'IncludesTypeConstraints' that we need to fit into the end of the path)
  // than we can fit into it, then we need to figure out where the closest array to the current element is.
  // This will get put into 'containerProfile' if it exists.
  let containerProfileArray;
  if (!(cardIsList || baseCardIsList) && constraintsLength > 1) {
    const pathArrayClone = fhirElementPath.split('.');
    // loop over the pathArrayClone to figure out where th nearest 0..*-cardinality element is
    while (pathArrayClone.length > 0) {
      pathArrayClone.pop();
      const searchString = pathArrayClone.join('.');
      const candidateSnapshotElement = fhirProfile.snapshot.element.find(e => { return e.path === searchString; });
      // If we find a snapshot element that matches the search string, and which has a 'max' (cardinality) of *
      // That's our nearest array element (into which we're going to put our elements)
      if (candidateSnapshotElement && candidateSnapshotElement.max == '*') {
        // containerProfileArray gives us the string array to the nearest array element
        containerProfileArray = pathArrayClone.slice(1);
        break;
      }
    }
  }

  cw.bl(`if (${check})`, () => {
    const pathArray = fhirElementPath.split('.');
    pathArray.shift(); // discard the first because it is the resource name
    let pathString = '';  // pathstring contains inst['fhirFirstLevel']['fhirSecondLevel']
    const previous = [];
    let containedPathArray;
    while(pathArray.length > 0){
      previous.push(pathArray.shift());
      pathString = previous.map(e => `['${e}']`).join(''); // build out the pathString
      if(pathArray.length > 0){
        cw.bl(`if(inst${pathString} === undefined)`, () => {
          // Handle cases where there's an array in the middle of the element chain
          if (containerProfileArray && containerProfileArray.map(e => `['${e}']`).join('') == pathString) {
            cw.ln(`inst${pathString} = [];`);
            containedPathArray = pathArray.slice(0);
          } else {
            cw.ln(`inst${pathString} = {};`); // make sure the each level of the json is initialized first
          }
        });
      }
    }

    if(fhirElementPath.split('.')[1] === 'extension'){
      cw.ln(`inst['extension'] = inst['extension'] || [];`);
      cw.ln(`inst['extension'].push(typeof this.${valueString}.toFHIR === 'function' ? this.${valueString}.toFHIR(true) : this.${valueString});`);
    } else {
      if (cardIsList || baseCardIsList) {
        cw.ln(`inst${pathString} = inst ${pathString} || [];`);
        if (cardIsList) {
          cw.ln(`inst${pathString} = inst${pathString}.concat(this.${valueString}.map(f => typeof f.toFHIR === 'function' ? f.toFHIR() : f));`);
        } else {
          cw.ln(`inst${pathString}.push(typeof this.${valueString}.toFHIR === 'function' ? this.${valueString}.toFHIR() : this.${valueString});`);
        }
      } else {
        // If we have to map our elements to an array higher up in the profile
        if (containerProfileArray && containedPathArray) {
          // Iterate through each element at current level, and map it to the array element
          cw.bl(`this.${valueString}.forEach( (elem) => `, () => {
            cw.ln('let containerInst = {};');
            let containedPathString = '';
            // Iterate through each level between the array element and our current element, and make sure they're all initialized.
            containedPathArray.forEach(e => {
              containedPathString = containedPathString.concat(`['${e}']`);
              cw.ln(`containerInst${containedPathString} = {};`);
            });
            // Set the contained element instance's data with the current 'elem' element
            cw.ln(`containerInst${containedPathString} = typeof elem.toFHIR === 'function' ? elem.toFHIR() : elem;`);
            // Push the contained element instance onto the higher-level array
            cw.ln(`inst${containerProfileArray.map(e => `['${e}']`).join('')}.push(containerInst);`);
          });
          // Close the `this.${valueString}.forEach( (elem) => block's parenthesis
          cw.ln(');');
        } else {
          cw.ln(`inst${pathString} = typeof this.${valueString}.toFHIR === 'function' ? this.${valueString}.toFHIR() : this.${valueString};`);
        }
      }
    }
  });
}

/**
 * Generates the "assignment" portion of the fromFHIR method, where the SHR elements get built from the FHIR json
 * @param {Value} field - The SHR field that the assignment will put a value into
 * @param {string} fhirElement - the FHIR element that the data should be taken from  (in FQN notation)
 * @param {string} fhirElementPath - the path to the FHIR element. may be different from fhirElement.path, ex in the case of value[x] this will be a specific choice
 * @param {Array} shrElementMapping - chain of SHR elements that the FHIR element maps to
 * @param {string} shrElementPath - the SHR element that the data should be put into (in FQN notation)
 * @param {StructureDefinition} fhirProfile - the FHIR profile the element comes from
 * @param {Object} slicing - information on this element related to slicing, if any
 * @param {CodeWriter} cw - the CodeWriter that is writing the file for this element
 */
function generateFromFHIRAssignment(field, fhirElement, fhirElementPath, shrElementMapping, shrElementPath, fhirProfile, slicing, cw) {
  const cardIsList = field.card.isList;
  const isRef = field instanceof RefValue;
  const fhirPathString = bracketNotation(fhirElementPath);

  const dec = cardIsList ? 'const ' : ''; // if it's a list, we are declaring a variable

  if (fhirElement.type[0].code === 'Reference') {
    // look up reference by ID
    cw.ln(`const entryId = ${fhirPathString}['reference'];`);

    let shrType;

    cw.bl('if (!mappedResources[entryId])', () => {
      cw.ln('const referencedEntry = allEntries.find(e => e.fullUrl === entryId);');
      cw.bl('if (referencedEntry)', () => {
        const profileUrl = getTargetProfile(fhirElement, (fhirProfile.fhirVersion === '1.0.2'));
        const parts = profileUrl.split('/');
        shrType = parts[parts.length - 1].replace(/-/g, '.');

        cw.ln(`mappedResources[entryId] = FHIRHelper.createInstanceFromFHIR('${shrType}', referencedEntry['resource'], shrId, allEntries, mappedResources, referencesOut);`);
      });
    });

    if (isRef) {
      if (dec !== '') {
        cw.ln(`let ${shrElementPath};`); // override the declaration and make it a let
      }

      cw.bl(`if (mappedResources[entryId])`, () => {
        cw.ln(`${shrElementPath} = FHIRHelper.createReference(mappedResources[entryId], referencesOut);`);
      });
      cw.bl(`else`, () => {
        // create a fake object with the real IDs so it can at least be looked up later
        // inspired by writeToJson above --- should this URL be configurable?
        // TODO: ideally this would be based on field.effectiveIdentifier but that doesn't always give us the most specific result, ex when slicing. is this guaranteed to be an SHR type?
        const url = `http://standardhealthrecord.org/spec/${shrType.replace(/\./g, '/')}`;

        cw.ln(`const entryType = '${url}';`);
        cw.ln(`${shrElementPath} = FHIRHelper.createReferenceWithoutObject(shrId, entryId, entryType);`);
      });
    } else {
      cw.ln(`${dec}${shrElementPath} = mappedResources[entryId];`);
    }

  } else {
    if (shrElementPath == 'value' && shrElementMapping.length == 0) { // "primitive" values that do not map to an SHR type
      cw.ln(`inst.value = ${fhirPathString};`);
    } else {
      const shrMapping = shrElementMapping[shrElementMapping.length - 1];
      const shrType = fhirMappingToIdentifier(shrMapping);
      const isExtension = fhirElement.path.endsWith('.extension');
      let rhs;
      if (shrType.isPrimitive && !isExtension) {
        rhs = fhirPathString;
      } else {
        rhs = `FHIRHelper.createInstanceFromFHIR('${shrType.fqn}', ${fhirPathString}, shrId, allEntries, mappedResources, referencesOut, ${isExtension})`;
      }
      if (isRef) {
        rhs = `FHIRHelper.createReference( ${rhs}, referencesOut)`;
      }
      cw.ln(`${dec}${shrElementPath} = ${rhs};`);
    }
  }
}

/**
 * Creates a symbol given a name.  Useful when a specific `publicSymbol` is not provided.
 * @param {string} name - The name to create the symbol for.
 * @private
 */
function toSymbol(name) {
  const _name = sanitizeName(name);
  return `${_name.charAt(0).toLowerCase()}${_name.slice(1)}`;
}

/**
 * Creates a fhirID based on an identifier
 * @param {Identifier} identifier - The identifier to change into a fhirID
 * @param {string} extra - Extra info to add to end of the fhirID
 * @private
 */
function fhirID(identifier, extra = '') {
  const id = `${identifier.namespace.replace(/\./g, '-')}-${identifier.name}`;
  if (extra.length > 0) {
    return `${id}-${extra}`;
  }
  return id;
}

/**
 * Determines the relative path from one generated class to another generated class or included file.  Needed when
 * generating imports.
 * @param {Identifier} fromIdentifier - The element identifier representing the ES6 class that is doing the import
 * @param {Identifier|string} to - The element identifier representing the ES6 class being imported or the string
 *   representing the file being imported
 * @returns {string} A relative path to where the imported class or file can be expected to be found
 * @private
 */
function relativeImportPath(fromIdentifier, to) {
  const fromNS = fromIdentifier.namespace.split('.');
  if (typeof to === 'string') {
    return [...fromNS.map(n => '..'), to].join('/');
  } else {
    const toNS = to.namespace.split('.');
    while (fromNS.length > 0 && toNS.length > 0 && fromNS[0] === toNS[0]) {
      fromNS.shift();
      toNS.shift();
    }
    const fromPath = fromNS.length ? fromNS.map(x => '..') : ['.'];
    return [...fromPath, ...toNS, className(to.name)].join('/');
  }
}

module.exports = { generateClass, setLogger };
