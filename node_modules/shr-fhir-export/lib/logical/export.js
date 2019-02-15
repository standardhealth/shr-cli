const bunyan = require('bunyan');
const mdls = require('shr-models');
const escapeRegExp = require('lodash/escapeRegExp');
const isEqual = require('lodash/isEqual');
const uniqWith = require('lodash/uniqWith');
const common = require('../common');
const StructureDefinition = require('./StructureDefinition');

/** @typedef {import('./ElementDefinition')} ElementDefinition */

// TODO: Update for DSTU2

// Constants used in various places throughout the code
const CODEABLE_CONCEPT_ID = new mdls.Identifier('shr.core', 'CodeableConcept');
const CODING_ID = new mdls.Identifier('shr.core', 'Coding');

var rootLogger = bunyan.createLogger({name: 'shr-fhir-models-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

/**
 * The primary class responsible for exporting SHR elements to FHIR logical models.  This class holds pointers to the
 * SHR specifications, FHIR definitions, configuration, and the logical models it has processed thus far.
 */
class ModelsExporter {
  constructor(specifications, fhir, configuration = {}) {
    this._specs = specifications;
    this._fhir = fhir;
    this._config = configuration;
    this._modelsMap = new Map();
  }

  /**
   * Gets the exported logical models as an array of JSON FHIR structure definitions.
   * @returns {Object[]} JSON FHIR structure definitions representing the exported logical models
   */
  get models() {
    return Array.from(this._modelsMap.values()).map(m => m.toJSON());
  }

  /**
   * Kicks off the export process based on the parameters passed into the class's constructor.
   * @returns {Object[]} JSON FHIR structure definitions representing the exported logical models
   */
  export() {
    // Iterate through the elements and export each to a logical model
    for (const element of this._specs.dataElements.all) {
      // Skip CodeableConcept and Coding since we'll use FHIR's built-in datatypes for those
      if (CODEABLE_CONCEPT_ID.equals(element.identifier) || CODING_ID.equals(element.identifier)) {
        continue;
      }
      try {
        this.exportModel(element);
      } catch (e) {
        //13082 , 'Unexpected error exporting element to FHIR Logical Model. ${errorText} ' ,  'Unknown' , 'errorNumber'
        // assigned new error message
        logger.error({errorText : e }, '13082' );
      }
    }

    // Compact the models
    this.compactModels();

    // Last step: clear out all of the aliases since they were only needed for processing
    this.clearAliases();

    return this.models;
  }

  /**
   * Exports a specific SHR DataElement as a FHIR logical model
   * @param {Object} def - the DataElement to export as a logical model
   * @returns {StructureDefinition} the exported logical model as an instance of the StructureDefinition class
   */
  exportModel(def) {
    // Setup a child logger to associate logs with the current element
    const lastLogger = logger;
    logger = rootLogger.child({ shrId: def.identifier.fqn });
    logger.debug('Start exporting element logical model');
    try {
      const model = new StructureDefinition();
      model.id = model.type = common.fhirID(def.identifier, 'model');
      model.text = this.getText(def);
      model.url = common.fhirURL(def.identifier, this._config.fhirURL, 'model');
      model.identifier = [{ system: this._config.projectURL, value: def.identifier.fqn }],
      model.name = def.identifier.name;
      model.title = common.fhirID(def.identifier);
      model.status = 'draft';
      model.date = this._config.publishDate || common.todayString();
      model.publisher = this._config.publisher;
      model.contact = this._config.contact;
      model.description = this.getDescription(def.identifier);
      if (!model.description) {
        // It's required to have a definition on the root element.  Normally setting model.description would do it
        // for us, but if model.description is null, we must do it ourselves.
        model.elements[0].short = model.elements[0].definition = def.identifier.name;
      }
      // Set the keywords if this element has Concepts defined
      const keywords = this.getConcepts(def.identifier);
      if (keywords && keywords.length) {
        model.keyword = keywords;
      }
      model.kind = 'logical';
      model.abstract = false;
      model.baseDefinition = 'http://hl7.org/fhir/StructureDefinition/Element';
      model.derivation = 'specialization';
      if (def.value) {
        this.addElement(model, def.value, true);
      }
      for (const field of def.fields) {
        this.addElement(model, field, false);
      }

      this._modelsMap.set(model.id, model);

      return model;
    } finally {
      // Close out the logging for this mapping
      logger.debug('Done exporting element logical model');
      logger = lastLogger;
    }
  }

  /**
   * Adds an SHR DataElement's value or field to the StructureDefinition model as an ElementDefinition
   * @param {StructureDefinition} model - the StructureDefinition to add the element to
   * @param {Object} value - the SHR Value object representing the value/field to add as an element to the model
   * @param {boolean} isValue - a flag indicating if the passed in `value` is the DataElement's value field
   */
  addElement(model, value, isValue=false) {
    // TODO: If choice is restricted to single item, don't make it value[x]
    let el;
    if (value instanceof mdls.TBD) {
      return;
    } else if (isValue) {
      const name = value instanceof mdls.ChoiceValue ? 'value[x]' : 'value';
      el = model.newElement(name);
      const parentDescription = model.description ? common.lowerFirst(common.trim(model.description)) : 'the logical model instance';
      el.short = `${common.capitalize(common.valueName(value))} representing ${this.shortDescription(parentDescription)}`;
      el.definition = `${common.capitalize(common.valueName(value))} representing ${parentDescription}`;
      el.alias = this.aliases(value, false);
    } else {
      el = model.newElement(common.shortID(value.effectiveIdentifier, true));
      const aliases = this.aliases(value, true);
      if (aliases.length) {
        el.alias = aliases;
      }
      const description = this.getDescription(value.effectiveIdentifier, value.effectiveIdentifier.name);
      el.short = this.shortDescription(description);
      el.definition = description;
    }
    // Set the type
    el.type = this.toTypeArray(value);
    // Set the card
    const card = value.effectiveCard;
    el.min = card.min;
    el.max = card.isMaxUnbounded ? '*' : `${card.max}`;
    // Set the codes if this element has Concepts defined
    if (value instanceof mdls.IdentifiableValue) {
      const codes = this.getConcepts(value.effectiveIdentifier);
      if (codes && codes.length) {
        el.code = codes;
      }
    }
    // Set the things we keep the same for everything
    el.mustSupport = false;
    el.isModifier = false;
    el.isSummary = false;
    // Apply constraints
    this.applyConstraints(model, value, el);
  }

  /**
   * Shortens a description by truncating it at the first newline. This is used when assigning to an ElementDefinition's
   * 'short' property, which generally shows up in the differential/snapshot table of the published IG.
   * @param {string} description - the description to shorten
   * @returns {string} the shortened string
   */
  shortDescription(description) {
    if (description == null) {
      return description;
    }
    return description.split('\n').shift().trim();
  }

  /**
   * Derives aliases for a given SHR Value object.  These are typically based on the Value object's identifier and type
   * constraints, but in the case of choices, will also include all valid options provided by the choice.
   * @param {Object} value - the SHR Value object to derive aliases from
   * @param {boolean} [excludeEffectiveIdentifier] - if set to true, will not use the effectiveIdentifier as an alias.
   *   This is done when the primary id is based on the effectiveIdentifier, so we don't need an alias for it.
   * @returns {string[]} an array of aliases associated with the passed in Value
   */
  aliases(value, excludeEffectiveIdentifier) {
    let aliases = [];
    if (value instanceof mdls.ChoiceValue) {
      const shortIDs = new Set();
      value.aggregateOptions.forEach((o) => this.aliases(o).forEach(o2 => shortIDs.add(o2)));
      aliases = Array.from(shortIDs);
    } else if (value instanceof mdls.IdentifiableValue) {
      aliases = [common.shortID(value.identifier, true)];
      // TODO: Should this also consider the constraint history?
      aliases.push(...value.constraintsFilter.own.type.constraints.map(c => common.shortID(c.isA, true)));
    }
    if (excludeEffectiveIdentifier) {
      const shortID = common.shortID(value.effectiveIdentifier, true);
      aliases = aliases.filter(a => a != shortID);
    }
    return aliases;
  }

  /**
   * Inspects an SHR Value object for constraints and applies all appropriate constraints to the associated
   * StructureDefinition element (or its children, as appropriate).
   * @param {StructureDefinition} model - the StructureDefinition to which to apply the constraints
   * @param {Object} value - the SHR Value object potentiall containing constraints to be applied
   * @param {ElementDefinition} el - the ElementDefinition associated with the SHR Value object
   */
  applyConstraints(model, value, el) {
    // First handle the card constraints because other constraints (IncludesType) may further
    // modify them as necessary.
    for (const c of value.constraintsFilter.card.constraints) {
      this.applyCardConstraint(model, value, el, c);
    }
    // Then apply the type constraints and includes type constraints because they build
    // out some structure and affect the types, then do the rest
    for (const c of value.constraintsFilter.type.constraints) {
      this.applyTypeConstraint(model, value, el, c);
    }
    for (const c of value.constraintsFilter.includesType.constraints) {
      this.applyIncludesTypeConstraint(model, value, el, c);
    }
    // Handle the other (less destructive) constraints
    for (const c of value.constraintsFilter.valueSet.constraints) {
      this.applyValueSetConstraint(model, value, el, c);
    }
    for (const c of value.constraintsFilter.code.constraints) {
      this.applyCodeConstraint(model, value, el, c);
    }
    for (const c of value.constraintsFilter.includesCode.constraints) {
      this.applyIncludesCodeConstraint(model, value, el, c);
    }
    for (const c of value.constraintsFilter.boolean.constraints) {
      this.applyBooleanConstraint(model, value, el, c);
    }

    // If the value is a choice, then there may be constraints on the individual options
    if (value instanceof mdls.ChoiceValue) {
      // If any of the choices options have constraints, we'll need to slice the choice to constrain the elements
      if (value.aggregateOptions.some(o => o.constraints && o.constraints.length > 0)) {
        el.sliceIt('type', '$this');
      }
      for (let o of value.aggregateOptions) {
        if (o instanceof mdls.TBD || o.constraints.length === 0) {
          continue;
        }

        if (o.constraints.some(c => c instanceof mdls.IncludesTypeConstraint)) {
          // It's not feasible to apply includes type constraints in a choice, since a choice cannot contain
          // a backbone element or a "section header" (typeless element).  Filter out the includesType constraints.
          // TODO: Log it
          o = o.clone();
          o.constraints = o.constraints.filter(c => !(c instanceof mdls.IncludesTypeConstraint));
        }
        // Create the individual slice to apply the constraints to
        const slice = el.newSlice(o.effectiveIdentifier.name, this.toSingleType(o));
        const description = this.getDescription(o.effectiveIdentifier, o.effectiveIdentifier.name);
        slice.short = this.shortDescription(description);
        slice.definition = description;
        this.applyConstraints(model, o, slice);
      }
    }
  }

  /**
   * Given an SHR Value object and a path (Identifier[]) relative to that object, calculates and returns what the
   * associated FHIR path would be in a FHIR StructureDefinition logical model.  This function is pretty simple
   * except that it also normalizes SHR CodeableConcept and Coding to a FHIR Coding representation.
   * @param {Object} value - the SHR Value Object that is the root of the path
   * @param {Object[]} path - an array of SHR Identifiers representing the SHR path from the value
   * @returns {string} - the dot-separated FHIR path corresponding to the passed in path
   */
  shrPathToFhirPath(value, path) {
    if (path.length === 0) {
      return '';
    }

    let fhirPath = path.map(id => common.shortID(id, true)).join('.');

    // Now we need to do some "fixing" to account for swapping CodeableConcept for Coding
    // and swapping the SHR definitions (w/ different field names) with FHIR definitions
    const valueIsCodeableConcept = value.possibleIdentifiers.some(id => id.equals(CODEABLE_CONCEPT_ID));
    const valueIsCoding = value.possibleIdentifiers.some(id => id.equals(CODING_ID));
    if (valueIsCodeableConcept || valueIsCoding || /(coding|codeableConcept)/.test(fhirPath)) {
      // (1) If it contains codeableConcept.coding, we can chop out the codeableConcept part
      fhirPath = fhirPath.replace(/codeableConcept\.coding/g, 'coding');

      // (2) If the value is a CodeableConcept and coding is the first part of the path,
      // then we can chop out the first coding part
      if (valueIsCodeableConcept) {
        fhirPath = fhirPath.replace(/^coding\.?/, '');
      }

      // (3) If it contains any coding.*, we need to rename the coding property to match FHIR
      fhirPath = fhirPath.replace(/coding\.codeSystem/g, 'coding.system');
      fhirPath = fhirPath.replace(/coding\.codeSystemVersion/g, 'coding.version');
      fhirPath = fhirPath.replace(/coding\.displayText/g, 'coding.display');

      // (4) If the value is a CodeableConcept or Coding, we need to rename the first part of the path
      if (valueIsCodeableConcept || valueIsCoding) {
        fhirPath = fhirPath.replace(/^codeSystem/, 'system');
        fhirPath = fhirPath.replace(/^codeSystemVersion/, 'version');
        fhirPath = fhirPath.replace(/^displayText/, 'display');
      }
    }

    return fhirPath;
  }

  /**
   * Applies a Value Set constraint to the given element or to a child of the element when the constraint specifies
   * a sub-path.
   * @param {StructureDefinition} model - the StructureDefinition to which this constraint should be applied
   * @param {Object} value - the SHR Value object that defined this constraint
   * @param {ElementDefinition} el - the ElementDefinition corresponding to the SHR Value Object
   * @param {Object} constraint - the constraint to apply
   */
  applyValueSetConstraint(model, value, el, constraint) {
    // TODO: Some of this code is copied from profile exporter.  We should consolidate when appropriate.
    const vsURI = constraint.valueSet;
    if (vsURI.startsWith('urn:tbd')) {
      // Skip TBD value set
      return;
    }

    let strength = 'required';
    if (constraint.isRequired) {
      strength = 'required';
    } else if (constraint.isExtensible) {
      strength = 'extensible';
    } else if (constraint.isPreferred) {
      strength = 'preferred';
    } else if (constraint.isExample) {
      strength = 'example';
    } else {
      //13027 , 'Unsupported binding strength: ${bindingStrength1}' , 'Unknown', 'errorNumber'
      logger.error({bindingStrength1 : constraint.bindingStrength }, '13027');
      return;
    }

    el.bindToVS(vsURI, strength, this.shrPathToFhirPath(value, constraint.path), this.resolve.bind(this));
  }

  /**
   * Applies a fixed code constraint to the given element or to a child of the element when the constraint specifies
   * a sub-path.
   * @param {StructureDefinition} model - the StructureDefinition to which this constraint should be applied
   * @param {Object} value - the SHR Value object that defined this constraint
   * @param {ElementDefinition} el - the ElementDefinition corresponding to the SHR Value Object
   * @param {Object} constraint - the constraint to apply
   */
  applyCodeConstraint(model, value, el, constraint) {
    el.fixCode(constraint.code, this.shrPathToFhirPath(value, constraint.path), this.resolve.bind(this));
  }

  /**
   * Applies a fixed boolean constraint to the given element or to a child of the element when the constraint specifies
   * a sub-path.
   * @param {StructureDefinition} model - the StructureDefinition to which this constraint should be applied
   * @param {Object} value - the SHR Value object that defined this constraint
   * @param {ElementDefinition} el - the ElementDefinition corresponding to the SHR Value Object
   * @param {Object} constraint - the constraint to apply
   */
  applyBooleanConstraint(model, value, el, constraint) {
    el.fixBoolean(constraint.value, this.shrPathToFhirPath(value, constraint.path), this.resolve.bind(this));
  }

  /**
   * Applies a cardinality constraint to the given element or to a child of the element when the constraint specifies
   * a sub-path.
   * @param {StructureDefinition} model - the StructureDefinition to which this constraint should be applied
   * @param {Object} value - the SHR Value object that defined this constraint
   * @param {ElementDefinition} el - the ElementDefinition corresponding to the SHR Value Object
   * @param {Object} constraint - the constraint to apply
   */
  applyCardConstraint(model, value, el, constraint) {
    el.modifyCard(constraint.card.min, constraint.card.max, this.shrPathToFhirPath(value, constraint.path), this.resolve.bind(this));
  }

  /**
   * Applies a type constraint to the given element or to a child of the element when the constraint specifies
   * a sub-path.  Note that when this is a nested path, it will result in parent elements being converted to a
   * "section header" (no type) or "BackboneElement".  We can't constraint nested elements to subtypes the normal way
   * because these logical models don't support true inheritance.
   * @param {StructureDefinition} model - the StructureDefinition to which this constraint should be applied
   * @param {Object} value - the SHR Value object that defined this constraint
   * @param {ElementDefinition} el - the ElementDefinition corresponding to the SHR Value Object
   * @param {Object} constraint - the constraint to apply
   */
  applyTypeConstraint(model, value, el, constraint) {
    if (!constraint.onValue && (constraint.path == null || constraint.path.length == 0)) {
      // Direct type constraints are already handled since we use effectiveType when building the models
      return;
    }

    // This constraint is nested (e.g. onValue or has path), so we must make it a backbone element instead.  This is
    // because we don't have true inheritance in the logical models, so we can't constrain the type of something in
    // an already defined model (because then it ceases to be that model).  Instead, we must simplify and treat the
    // element as an inner structure defined inline in this model and then constrain the nested type inside it.
    // See Grahame's Structured Cancer Reporting models for examples: http://fhir.hl7.org.au/fhir/rcpa/index.html
    if (el.type && el.type.length > 1) {
      // Here be dragons.  Reducing a choice to a "BackboneElement" is probably precarious!
      // TODO: Log this
    }

    // For a nested constraint on the value, we need to expand out the current element first (before wiping type)
    let currentEl = el;
    const elFhirPath = this.shrPathToFhirPath(value, constraint.path);
    const elPath = elFhirPath === '' ? [] : elFhirPath.split('.');
    if (constraint.onValue) {
      // We need to determine if it should be 'value' or 'value[x]'
      const parentID = constraint.path.length ? constraint.path[constraint.path.length-1] : value.effectiveIdentifier;
      const parent = this._specs.dataElements.findByIdentifier(parentID);
      if (parent && parent.value && parent.value instanceof mdls.ChoiceValue) {
        elPath.push('value[x]');
      } else {
        elPath.push('value');
      }
    }
    // Walk the path.  Every parent element in the chain needs to have its type changed to BackboneElement.
    for (let i=0; i < elPath.length; i++) {
      // Find the child *before* we change the type (otherwise it's hard to find the child)
      // NOTE: this also unfolds all of the child elements
      const child = currentEl.findChild(elPath[i], this.resolve.bind(this));
      currentEl.type = [{ code: 'BackboneElement' }];
      // Since we're now inlining this element anonymously, we need to reset all the `base` properties
      currentEl.resetBase();
      currentEl.children().forEach(c => c.resetBase());
      // Set the current element to the child for the next iteration
      currentEl = child;
    }
    // Now we're at the element to constrain type on, so change the type-related fields

    // Set the type
    const newType = constraint.isA;
    const tcValue = currentEl.type[0].code === 'Reference' ? new mdls.RefValue(newType) : new mdls.IdentifiableValue(newType);
    currentEl.type = this.toTypeArray(tcValue);

    // Adjust the aliases / id / path as necessary
    const shortName = common.shortID(newType, true);
    if (/.*\.value(\[x\])?(:[^\.]+)?$/.test(currentEl.id)) {
      // We don't need to change the id/path; we just need to change the alias
      if (/.*\.value\[x\](:[^\.]+)?$/.test(currentEl.id)) {
        // It's a choice.  Since we're narrowing it to one thing, we should unslice it.
        currentEl = currentEl.unSliceIt(shortName);
        currentEl.alias = [ shortName ];
        // If it's value[x] with a single type, normalize the choice
        currentEl.normalizeChoice(shortName);
      } else {
        // We don't need to change the id/path; we just need to add the alias
        if (currentEl.alias == null) {
          currentEl.alias = [];
        }
        if (currentEl.alias.indexOf(shortName) === -1) {
          currentEl.alias.push(shortName);
        }
      }
    } else {
      // We need to adjust the id in this and all subpaths (path is automatically adjusted based on id)
      const oldID = currentEl.id;
      const newID = currentEl.id.replace(/\.[^\.:]+(:[^\.]+)?$/, `.${shortName}$1`);
      currentEl.children().forEach(c => c.id.replace(oldID, newID));
      currentEl.id = newID;
    }

    const description = this.getDescription(newType, newType.name);
    currentEl.short = this.shortDescription(description);
    currentEl.definition = description;

    // Set the codes if this element has Concepts defined
    const codes = this.getConcepts(newType);
    if (codes && codes.length) {
      currentEl.code = codes;
    } else {
      currentEl.code = undefined;
    }
  }

  /**
   * Applies an "includes type" constraint to the given element or to a child of the element when the constraint
   * specifies a sub-path.  Note that this will result in some elements being converted to a "section header" (no type)
   * or "BackboneElement".  We can't constraint nested elements to subtypes the normal way because these logical models
   * don't support true inheritance.
   * @param {StructureDefinition} model - the StructureDefinition to which this constraint should be applied
   * @param {Object} value - the SHR Value object that defined this constraint
   * @param {ElementDefinition} el - the ElementDefinition corresponding to the SHR Value Object
   * @param {Object} constraint - the constraint to apply
   */
  applyIncludesTypeConstraint(model, value, el, constraint) {
    // For IncludesType constraints, we must make the value a "section header" (no type) instead.  This is
    // because we don't have true inheritance in the logical models, so we can't put sub-types as slices of a parent
    // type (like we do for profiles).  Instead, we must simplify and treat the element as a "section header" and
    // put each included type as an element in the section.  See Grahame's Structured Cancer Reporting models for an
    // example: http://fhir.hl7.org.au/fhir/rcpa/index.html
    // NOTE: Some of this code is very similar to applyTypeConstraint.  Consider refactoring.

    // If the includes type is zeroed out, then don't produce anything.  Act as if it never existed.
    if (constraint.card.isZeroedOut) {
      return;
    }

    if (el.type && el.type.length > 1) {
      // Here be dragons.  Reducing a choice to a "section header" or "BackboneElement" is probably precarious!
      // TODO: Log this
    }

    if (!constraint.onValue && (constraint.path == null || constraint.path.length == 0)) {
      // It is a direct constraint, make the type null (indicating it is a "section header")
      el.type = undefined;
      el.resetBase();
      // A "section header" can only be 0..1 or 1..1, so fix cardinality as appropriate.
      // Any includesType with a min card > 0 means the "section header" is required.
      if (el.min > 1 || constraint.card.min > 0) {
        el.min = 1;
      }
      el.max = '1';
    } else {
      // It is a nested constraint on the value, so we need to expand out the current element first (before wiping type)
      let currentEl = el;
      const elFhirPath = this.shrPathToFhirPath(value, constraint.path);
      const elPath = elFhirPath === '' ? [] : elFhirPath.split('.');
      if (constraint.onValue) {
        // We need to determine if it should be 'value' or 'value[x]'
        const parentID = constraint.path.length ? constraint.path[constraint.path.length-1] : value.effectiveIdentifier;
        const parent = this._specs.dataElements.findByIdentifier(parentID);
        if (parent && parent.value && parent.value instanceof mdls.ChoiceValue) {
          elPath.push('value[x]');
        } else {
          elPath.push('value');
        }
      }
      // Walk the path, making each part a backbone element until we get to the "section header"
      for (let i=0; i < elPath.length; i++) {
        // NOTE: this also unfolds all of the child elements
        const child = currentEl.findChild(elPath[i], this.resolve.bind(this));
        currentEl.type = [{ code: 'BackboneElement' }];
        // Since we're now inlining this element anonymously, we need to reset all the `base` properties
        currentEl.resetBase();
        currentEl.children().forEach(c => c.resetBase());
        if (i == elPath.length-1) {
          // We're at the tail of the path, so make the type null (indicating it is a "section header")
          child.type = undefined;
          // A "section header" can only be 0..1 or 1..1, so fix cardinality as appropriate.
          // Any includesType with a min card > 0 means the "section header" is required.
          if (child.min > 1 || constraint.card.min > 0) {
            child.min = 1;
          }
          child.max = '1';
        } else {
          currentEl = child;
        }
      }
    }

    // Now that we've built out the path, process the actual includesType constraint.
    // NOTE: A refactoring brought the code above and code below together.  There may be a more seamless way to
    // integrate them together.  A task for a rainy day.

    // For easier processing, normalize 'onValue' out and put it in the path
    if (constraint.onValue) {
      constraint = constraint.clone();
      constraint.onValue = false;
      constraint.path.push(new mdls.Identifier('', 'Value'));
    }
    if (constraint.path.length > 0) {
      const fhirPath = this.shrPathToFhirPath(value, constraint.path);
      const valueChildEl = el.findChild(fhirPath, this.resolve.bind(this));
      const valueConstraint = new mdls.IncludesTypeConstraint(constraint.isA.clone(), constraint.card.clone());
      let listValue;
      if (constraint.path.length == 0) {
        listValue = value;
      } else {
        const id = constraint.path.length == 1 ? value.effectiveIdentifier : constraint.path[constraint.path.length-2];
        const def = this._specs.dataElements.findByIdentifier(id);
        if (def) {
          const tailId = constraint.path[constraint.path.length-1];
          if (tailId.namespace === '' && tailId.name === 'Value') {
            listValue = def.value;
          } else {
            listValue = common.valueAndFields(def).find(f => constraint.path[constraint.path.length-1].equals(f.effectiveIdentifier));
          }
        }
      }

      if (listValue) {
        this.applyIncludesTypeConstraint(model, listValue, valueChildEl, valueConstraint);
      }
      return;
    }

    // TODO: This can probably be DRYer (much is similar to addElement method)
    const child = el.newChildElement(common.shortID(constraint.isA, true));
    model.addElement(child);
    child.min = constraint.card.min;
    child.max = constraint.card.isMaxUnbounded ? '*' : `${constraint.card.max}`;
    const description = this.getDescription(constraint.isA, constraint.isA.name);
    child.short = this.shortDescription(description);
    child.definition = description;
    // Set the type
    const newType = constraint.isA;
    const itcValue = value instanceof mdls.RefValue ? new mdls.RefValue(newType) : new mdls.IdentifiableValue(newType);
    child.type = this.toTypeArray(itcValue);
    // Set the codes if this element has Concepts defined
    const codes = this.getConcepts(newType);
    if (codes && codes.length) {
      child.code = codes;
    }
    // Set the things we keep the same for everything
    child.mustSupport = false;
    child.isModifier = false;
    child.isSummary = false;
  }

  /**
   * Applies an "includes code" constraint to the given element or to a child of the element when the constraint
   * specifies a sub-path.  Note that this does not use the usually approach (slicing) because FHIR forbids repeated
   * paths in logical models.
   * @param {StructureDefinition} model - the StructureDefinition to which this constraint should be applied
   * @param {Object} value - the SHR Value object that defined this constraint
   * @param {ElementDefinition} el - the ElementDefinition corresponding to the SHR Value Object
   * @param {Object} constraint - the constraint to apply
   */
  applyIncludesCodeConstraint(model, value, el, constraint) {
    // Unfortunately, we can't use the normal approach here since logical models don't allow paths to be repeated.
    // See: https://github.com/standardhealth/ballot/issues/21
    // el.fixCodeInList(constraint.code, this.shrPathToFhirPath(value, constraint.path), this.resolve.bind(this));

    // Instead, establish the fixed code via a constraint/invariant
    let elToConstrain = el;
    if (constraint.path && constraint.path.length > 0) {
      elToConstrain = el.findChild(this.shrPathToFhirPath(value, constraint.path), this.resolve.bind(this));
    }
    if (!elToConstrain) {
      // Invalid path.  Log this.
      return;
    }

    // Sometimes IncludesCode is used on a non-list element and the repetition actually occurs further up the path.
    // In this case, we need to put the constraint on the repeatable element, but refer to the nested code element
    // in the expression.  Find the repeatable element by walking up the path.
    let repeatableEL;
    for (repeatableEL = elToConstrain;
         repeatableEL && (repeatableEL.base.max === '1' || repeatableEL.base.max === '0');
         repeatableEL = repeatableEL.parent());
    if (!repeatableEL) {
      // Invalid path.  Log this.
      return;
    }
    let prefixPath = '';
    if (repeatableEL.path !== elToConstrain.path) {
      // The repeatable is a parent path, so find the relative path from parent to child and add the dot at the end
      prefixPath = elToConstrain.path.slice(repeatableEL.path.length+1) + '.';
    }


    if (repeatableEL.constraint == null) {
      repeatableEL.constraint = [];
    }

    const invariant = {
      key: `${repeatableEL.path.split('.').pop()}-${repeatableEL.constraint.length + 1}`,
      severity: 'error',
      human: '',
      expression: ''
    };
    const code = constraint.code;
    const display = code.display ? ` (${code.display})` : '';
    if (elToConstrain.type.some(t => t.code === 'CodeableConcept')) {
      if (code.system) {
        invariant.human = `There must exist a ${prefixPath}coding with system '${code.system}' and code '${code.code}'${display}.`;
        invariant.expression = `${prefixPath}coding.where(system = '${code.system}' and code = '${code.code}').exists()`;
      } else {
        invariant.human = `There must exist a ${prefixPath}coding with and code '${code.code}'${display}.`;
        invariant.expression = `${prefixPath}coding.where(code = '${code.code}').exists()`;
      }
    } else if (elToConstrain.type.some(t => t.code === 'Coding')) {
      if (code.system) {
        invariant.human = `There must exist a pairing of ${prefixPath}system '${code.system}' and ${prefixPath}code '${code.code}'${display}.`;
        invariant.expression = `${prefixPath}where(system = '${code.system}' and code = '${code.code}').exists()`;
      } else {
        invariant.human = `There must exist a ${prefixPath}code '${code.code}'.${display}`;
        invariant.expression = `${prefixPath}where(code = '${code.code}').exists()`;
      }
    } else if (elToConstrain.type.some(t => t.code === 'code')) {
      const suffix = prefixPath === '' ? '.' : ` at ${prefixPath}`;
      invariant.human = `There must exist a value of '${code.code}'${display}${suffix}`;
      invariant.expression = `${prefixPath}where($this = '${code.code}').exists()`;
    } else {
      // Not something we can fix a code on
      return;
    }

    repeatableEL.constraint.push(invariant);
  }

  /**
   * Returns a narrative object pertaining to the SHR DataElement that was passed in.
   * @param {Object} def - The SHR DataElement from which to derive the text narrative
   * @returns {{status: string, div: string}} the narrative object representing the text
   */
  getText(def) {
    return {
      status: 'generated',
      div:
`<div xmlns="http://www.w3.org/1999/xhtml">
  <p><b>${common.escapeHTML(def.identifier.name)} Logical Model</b></p>
  <p>${common.escapeHTML(this.getDescription(def.identifier))}</p>
</div>`
    };
  }

  /**
   * Returns a description for the given SHR Identifier, or the default text if no description is found.
   * @param {Object} identifier - the SHR Identifier to use to look up a description
   * @param {string} [defaultText] - default text if no description is found
   * @returns {string} the description
   */
  getDescription(identifier, defaultText) {
    const def = this._specs.dataElements.findByIdentifier(identifier);
    let description;
    if (def) {
      description = common.trim(def.description);
    }
    if (description == null || description == '') {
      description = common.trim(defaultText);
    }
    return description;
  }

  /**
   * Returns an array of code objects representing the concepts associated with an SHR DataElement definition
   * @param {Object} identifier - the SHR Identifier representinf the data element defining its concepts
   * @return {{system: string, code: string, display?: string}[]} the concepts as code objects
   */
  getConcepts(identifier) {
    const def = this._specs.dataElements.findByIdentifier(identifier);
    if (def && def.concepts) {
      return def.concepts.map(c => ({ system: c.system, code: c.code, display: common.trim(c.display) }));
    }
    return [];
  }

  /**
   * Returns a FHIR type object pertaining to the passed in SHR IdentifiableValue object.  Note that ChoiceValue
   * objects should not be passed into this function.
   * @param {Object} value - the SHR IdentifiableValue object to extract a type from
   * @returns {{code: string, targetProfile?: string}} the FHIR type object
   */
  toSingleType(value) {
    const id = value.effectiveIdentifier;
    if (id.equals(CODEABLE_CONCEPT_ID) || id.equals(CODING_ID)) {
      // In a logical model, there is no meaningful difference between CodeableConcept and Coding
      // so just make it a Coding for simplicity.
      return { code: 'Coding' };
    } else if (id.isPrimitive) {
      return { code: id.name };
    } else if (value instanceof mdls.RefValue) {
      return { code: 'Reference', targetProfile: common.fhirURL(id, this._config.fhirURL, 'model') };
    }
    return { code: common.fhirURL(id, this._config.fhirURL, 'model') };
  }

  /**
   * Returns an array of FHIR type objects pertaining to the passed in SHR Value object.
   * @param {Object} value - the SHR Value object to extract the types from
   * @returns {{code: string, targetProfile?: string}[]} a list of FHIR type objects
   */
  toTypeArray(value) {
    if (value instanceof mdls.TBD) {
      return [];
    } else if (value instanceof mdls.ChoiceValue) {
      const nonTBDs = value.aggregateOptions.filter(o => !(o instanceof mdls.TBD));
      // If the choice had CodeableConcept and Coding then it now has two Codings. This is bad, so uniq it.
      return uniqWith(nonTBDs.map(o => this.toSingleType(o)), isEqual);
    }
    return [this.toSingleType(value)];
  }

  /**
   * Resolves a FHIR type to a StructureDefinition representing the type
   * @param {{code: string, profile?: string, targetProfile?: string, aggregation?: string[], versioning?: string}} type - the FHIR type to resolve
   * @returns {StructureDefinition} the StructureDefinition representing the type
   */
  resolve(type) {
    const stringType = common.typeToString(type);

    const re = new RegExp(`${this._config.fhirURL}/StructureDefinition/(([a-z].*)-([A-Z].*)-model)`);
    const localMatches = re.exec(stringType);
    if (localMatches) {
      if (this._modelsMap.has(localMatches[1])) {
        return this._modelsMap.get(localMatches[1]);
      }
      const [ns, name] = [localMatches[2].replace(/-/g, '.'), localMatches[3]];
      // NOTE: possible recursion here!
      return this.exportModel(this._specs.dataElements.find(ns, name));
    }
    const def = this._fhir.find(stringType);
    if (def && def.resourceType === 'StructureDefinition') {
      return StructureDefinition.fromJSON(def);
    }
    return def;
  }

  /**
   * Clears all of the aliases from the structure definitions, as they're not needed post-processing.
   */
  clearAliases() {
    for (const model of this._modelsMap.values()) {
      for (const element of model.elements) {
        element.alias = undefined;
      }
    }
  }

  /**
   * Compacts the models to simpler representations. In order to reduce complexity while allowing for both compact and
   * non-compact representations (based on configuration), the model simplification is performed as a post-process,
   * allowing all other code to remain as-is.
   * @see #compactModel
   */
  compactModels() {
    // First build up a map containing the URLs of all single-value models.  These are the model references that will
    // be replaced by their values during the compaction process.
    const singleValueMap = new Map();
    for (const element of this._specs.dataElements.all) {
      if (element.value != null && element.fields.length === 0) {
        singleValueMap.set(common.fhirURL(element.identifier, this._config.fhirURL, 'model'), true);
      }
    }

    // Now iterate through all the models, compacting one at a time
    for (const model of this._modelsMap.values()) {
      this.compactModel(model, singleValueMap);
    }
  }

  /**
   * Compacts the model to a simpler representations.  This removes indirection introduced by single-value models.
   * For example, if a model has a field called `foo` that is a `FooModel`, but `FooModel` only has a single `value`
   * field of type `string`, the the `foo` field will be simplified to take on the type of `string` rather than
   * `FooModel`.
   * @param {StructureDefinition} model - the model to compact
   * @param {Map<string, boolean>} singleValueMap - a map with keys representing the URLs of single-value models
   */
  compactModel(model, singleValueMap) {
    for (let i=0; i < model.elements.length; i++) {
      const element = model.elements[i];
      if (!this.elementIsCompactable(element, singleValueMap)) {
        continue;
      }
      // It can be compacted.  Get the child element(s) and pop them up a level!
      let children = element.children();
      if (children.length === 0) {
        children = element.unfold(this.resolve.bind(this));
      }
      // If there are no children then there's nothing to replace the element with.  This may happen with elements
      // that are just marker base classes.
      if (children.length === 0) {
        continue;
      }
      const child = children[0];
      // Update the child short and definition to reflect the element's short and definition
      child.definition = element.definition;
      child.short = element.short;
      // Update the child min/max to reflect the aggregate min/max
      child.min = element.min * child.min;
      if (child.max !== '*') {
        child.max = element.max === '*' ? '*' : `${parseInt(element.max) * parseInt(child.max)}`;
      }
      // Update the child base as appropriate.  Don't update base if it came from another resource/datatype.
      const basePathRoot = child.base.path.split('.', 2)[0];
      if (basePathRoot.endsWith('-model') && (basePathRoot !== model.type || child.base.min !== child.min || child.base.max !== child.max)) {
        child.base = {
          path: child.path,
          min: child.min,
          max: child.max
        };
      }
      // Update the code as appropriate
      if (element.code && element.code.length > 0) {
        if (child.code == null) {
          child.code = element.code;
        } else {
          for (const c of element.code) {
            if (child.code.every(c2 => c.code != c2.code || c.system != c2.system)) {
              child.code.push(c);
            }
          }
        }
      }
      // Update child flags as appropriate
      if (element.mustSupport) {
        child.mustSupport = true;
      }
      if (element.isModifier) {
        child.isModifier = true;
      }
      if (element.isSummary) {
        child.isSummary = true;
      }
      // Update all the children w/ the new id root
      const originalId = child.id;
      children.forEach(el => {
        if (el.id.startsWith(originalId)) {
          // If the compacted element is now a choice, we need to add [x] at the end of its name
          const newId = originalId.endsWith('[x]') && !element.id.endsWith('[x]') ? `${element.id}[x]` : element.id;
          el.id = el.id.replace(originalId, newId);
        } else if (originalId.endsWith('[x]') && el.id.startsWith(originalId.slice(0, -3))) {
          // This element is based on a specific choice (e.g., value[x] -> valueCode) so we need special handling
          const re = new RegExp(`^${originalId.slice(0,-3)}[A-Z][^\.:]*$`);
          const pointBaseToOriginal = re.test(el.base.path);
          const newIdBase = element.id.endsWith('[x]') ? element.id.slice(0, -3) : element.id;
          el.id = el.id.replace(originalId.slice(0, -3), newIdBase);
          // Fix the base *after* assigning the id, since assigning the id may overwrite the existing base
          if (pointBaseToOriginal) {
            el.base = common.cloneJSON(child.base);
          }
        }
      });
      // Detach the old element
      element.detach(false);
      // Since it was compacted, it's possible it could be compacted more! Rewind i so we repeat this element again.
      i = i-1;
    }
  }

  /**
   * Checks if the given element is compactable -- meaning it can be replaced by its value.  Elements must meet the
   * following conditions to be compactable:
   * - they cannot be a choice type
   * - they cannot be a reference
   * - they cannot be sliced or a slice
   * - their type must be single-value (no fields) or they must be a backbone element with one direct value child
   * @param {ElementDefinition} element - the element to check if it is compactable
   * @param {Map<string, boolean>} singleValueMap - a map with keys representing the URLs of single-value models
   */
  elementIsCompactable(element, singleValueMap) {
    // Don't compact choice elements. This is partly to keep this simple to implement, but also to avoid the following
    // potential issues:
    // - Compacting a type in a choice may lose its context (i.e., there is nowhere to put the original definition)
    // - Compacting multiple types in a choice may introduce duplicate types w/ conflicting constraints
    if (element.type == null || element.type.length > 1) {
      return false;
    }
    // Don't compact references, as that would require references to standalone instances that would now be devoid of
    // the context that their wrapping type provided.
    if (element.type[0].code === 'Reference') {
      return false;
    }
    // Don't compact sliced elements or their slices since it's important for slice types to remain compatible
    if (element.slicing != null || element.sliceName != null) {
      return false;
    }
    // If it's a BackboneElement, then its compactable if it has one direct child element and that
    // child's name starts w/ value.
    if (element.type[0].code === 'BackboneElement') {
      const directChildren = element.children().filter(e => e.id.lastIndexOf('.') === element.id.length);
      const re = new RegExp(`^${escapeRegExp(element.id)}\.value([A-Z][^.]*)?$`);
      return directChildren.length === 1 && re.test(directChildren[0].id);
    }
    // It's compactable if it is a single-value element
    return singleValueMap.has(element.type[0].code);
  }
}

module.exports = {ModelsExporter, setLogger};
