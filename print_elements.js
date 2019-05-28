const { Identifier, IdentifiableValue, ChoiceValue, TypeConstraint, CardConstraint, IncludesTypeConstraint, ConstraintsFilter, RefValue, Cardinality } = require('shr-models');

const urlsToNames = {
  'https://sdt.cap.org': 'College of American Pathologists',
  'http://www.dsm5.org/': 'DSM-5',
  'https://evs.nci.nih.gov/ftp1/CDISC/SDTM/': 'CDISC SDTM Controlled Terminology',
  'http://www.genenames.org': 'Hugo Gene Nomenclature Committee',
  'http://hl7.org/fhir/quantity-comparator': 'FHIR Quantity Comparator',
  'http://hl7.org/fhir/sid/cvx': 'CVX',
  'http://hl7.org/fhir/allergy-verification-status': 'FHIR Allergy Intolerance Verification Status',
  'http://hl7.org/fhir/observation-status': 'FHIR Observation Status',
  'http://hl7.org/fhir/ValueSet/allergy-intolerance-category': 'FHIR Allergy Intolerance Category',
  'http://hl7.org/fhir/ValueSet/allergy-intolerance-type': 'FHIR Allergy Intolerance Category',
  'http://hl7.org/fhir/observation-category': 'FHIR Observation Category',
  'http://hl7.org/fhir/v3/ActReason': 'HL7 V3 ActReason',
  'http://hl7.org/fhir/v3/ObservationInterpretation': 'HL7 V3 Observation Interpretation',
  'http://hl7.org/fhir/v2/0487': 'HL7 V2 Specimen Type',
  'http://loinc.org': 'LOINC',
  'http://www.meddra.org': 'MedDRA',
  'http://www.nationsonline.org/oneworld/country_code_list': 'CC',
  'https://www.ncbi.nlm.nih.gov/refseq': 'NCBI Reference Sequence Database',
  'http://ncimeta.nci.nih.gov': 'NCI Metathesaurus',
  'http://uts.nlm.nih.gov/metathesaurus': 'NCI Metatheasurus',
  'https://ncit.nci.nih.gov': 'NCI Thesaurus',
  'https://ncit.nci.nih.gov/ncitbrowser/ConceptReport.jsp?dictionary=NCI_Thesaurus': 'NCI Thesaurus',
  'http://www.nlm.nih.gov/research/umls/rxnorm': 'RxNorm',
  'http://snomed.info/sct': 'SNOMED CT',
  'http://hl7.org/fhir/sid/icd-10-cm': 'ICD-10-CM',
  'http://unitsofmeasure.org': 'UCUM',
  'http://codes.iarc.fr/topography': 'ICD-O-3 Topology Codes',
  'urn:iso:std:iso:4217': 'CURRENCY',
  'urn:tbd:': 'TBD',
  'urn:tbd': 'TBD'
};

// These will insert a space in between:
// - not a capital letter -- a capital letter
// - a capital letter -- a capital letter follow by not a capital letter
// - not a number -- a number
function getHumanReadableProfileName(name) {
  return `${name.replace(/(([^A-Z])([A-Z]))|(([A-Z])([A-Z][^A-Z]))|(([^0-9])([0-9]))/g, humanReadableReplacer).trim()}`;
}
function getHumanReadablePathName(path) {
  return `${path.map(id => id.name).join('').replace(/(([^A-Z])([A-Z]))|(([A-Z])([A-Z][^A-Z]))|(([^0-9])([0-9]))/g, humanReadableReplacer).trim()}`;
}
function humanReadableReplacer(match, p1, p2, p3, p4, p5, p6, p7, p8, p9, offset, string) {
  if (p1) {
    return [p2, p3].join(' ');
  } else if (p4) {
    return [p5, p6].join(' ');
  } else if (p7) {
    return [p8, p9].join(' ');
  }
}

function getCardinalityInfo(card) {
  let requirement = '';
  let multiplicity = '';
  if (card) {
    requirement = (card.min && card.min > 0) ? 'required' : 'required if known';
    multiplicity = (card.max && card.max === 1) ? 'single' : 'multiple';
  }
  return { requirement, multiplicity };
}

function getDataType(de, path, specs, endOfPathElement) {
  const value = findValueByPath(specs, path, de);
  let typeConstraints = [];
  typeConstraints = value.constraintsFilter.type.constraints;
  if (typeConstraints.length === 0) {
    // It may be on the value...
    let valueId = choiceFriendlyEffectiveIdentifier(value);
    if (valueId == null && value instanceof ChoiceValue) {
      valueId = value.aggregateOptions.find(o => ['CodeableConcept', 'Coding', 'code'].indexOf(o.identifier.name) !== -1);
    }
    if (valueId) {
      const valueDE = specs.dataElements.findByIdentifier(valueId);
      if (valueDE.value) {
        const newValue = mergeConstraintsToChild(value.constraints, valueDE.value, true);
        const newTypeConstraints = newValue.constraintsFilter.type.constraints;
        typeConstraints = newTypeConstraints.filter(c => !c.onValue);
      }
    }
  }
  
  let type = '';
  if (typeConstraints.length > 0) {
    type = typeConstraints.map(c => c.isA.name).join(' or ');
  } else if (endOfPathElement.value instanceof IdentifiableValue) {
    type = endOfPathElement.value.effectiveIdentifier.name;
  } else if (endOfPathElement.value instanceof ChoiceValue) {
    type = endOfPathElement.value.aggregateOptions.filter(o => o.identifier).map(o => o.identifier.name).join(' or ');
  }
  return type;
}

function getVsInfo(de, path, specs, projectURL) {
  const value = findValueByPath(specs, path, de);
  let constraint;
  const vsConstraints = value.constraintsFilter.valueSet.constraints;
  if (vsConstraints && vsConstraints.length > 0) {
    constraint = vsConstraints.find(c => !c.onValue && c.path.length === 0);
  }
  if (!constraint) {
    // It may be on the value...
    let valueId = choiceFriendlyEffectiveIdentifier(value);
    if (valueId == null && value instanceof ChoiceValue) {
      valueId = value.aggregateOptions.find(o => ['CodeableConcept', 'Coding', 'code'].indexOf(o.identifier.name) !== -1);
    }
    if (valueId) {
      const valueDE = specs.dataElements.findByIdentifier(valueId);
      if (valueDE.value) {
        const newValue = mergeConstraintsToChild(value.constraints, valueDE.value, true);
        const newVsConstraints = newValue.constraintsFilter.valueSet.constraints;
        constraint = newVsConstraints.find(c => !c.onValue && c.path.length === 0);
      }
    }
  }
  if (constraint) {
    const url = constraint.valueSet.startsWith(projectURL) ? constraint.valueSet.split('/')[constraint.valueSet.split('/').length-1] : constraint.valueSet;
    const vs = specs.valueSets.findByURL(constraint.valueSet);
    return { url, strength: constraint.bindingStrength, vs };
  }
}

function getUnit(de, path, specs, projectURL) {
  const value = findValueByPath(specs, path, de);
  let constraint;
  const codeConstraints = value.constraintsFilter.constraints;
  if (codeConstraints && codeConstraints.length > 0) {
    constraint = codeConstraints.find(c => !c.onValue && c.path.some(e => e.equals(new Identifier('shr.core', 'Units'))));
  }
  if (!constraint) {
    // It may be on the value...
    let valueId = choiceFriendlyEffectiveIdentifier(value);
    if (valueId == null && value instanceof ChoiceValue) {
      valueId = value.aggregateOptions.find(o => ['CodeableConcept', 'Coding', 'code'].indexOf(o.identifier.name) !== -1);
    }
    if (valueId) {
      const valueDE = specs.dataElements.findByIdentifier(valueId);
      if (valueDE.value) {
        const newValue = mergeConstraintsToChild(value.constraints, valueDE.value, true);
        const newCodeConstraints = newValue.constraintsFilter.code.constraints;
        constraint = newCodeConstraints.find(c => !c.onValue && c.path.some(e => e.equals('shr.core', 'Units')));
      }
    }
  }
  if (constraint) {
    let units = '';
    if (constraint.code) {
      units = `${constraint.code.display}`;
    } else if (constraint.valueSet) {
      units = constraint.valueSet.startsWith(projectURL) ? constraint.valueSet.split('/')[constraint.valueSet.split('/').length-1] : constraint.valueSet;
    }
    return units;
  }
}

function choiceFriendlyEffectiveIdentifier(value) {
  if (value.effectiveIdentifier) {
    return value.effectiveIdentifier;
  }
  const ownTypeConstraints = value.constraintsFilter.own.type.constraints;
  if (value instanceof ChoiceValue && ownTypeConstraints.length === 1) {
    return ownTypeConstraints[0].isA;
  }
}

// Given a path (identifier array) and a SHR data element definition, it will return the matching value at the tail
// of the path with all constraints aggregrated onto it
function findValueByPath(specs, path, def, valueOnly=false, parentConstraints=[]) {
  if (path.length == 0) {
    return;
  }

  const fieldsToSearch = [];
  if (def.value !== undefined) {
    fieldsToSearch.push(mergeConstraintsToChild(parentConstraints, def.value, true));
  }
  if (!valueOnly) {
    fieldsToSearch.push(...(def.fields.map(f => mergeConstraintsToChild(parentConstraints, f, false))));
  }
  // Find the value at the root of the path
  let value = findValueByIdentifier(path[0], fieldsToSearch);

  // If we didn't find the value, it could be one of those cases where we replaced the original identifier with
  // an includesType identifier, so we should check the constraints to look for a match on the includesType.
  if (value === undefined && parentConstraints.length > 0) {
    const cf = new ConstraintsFilter(parentConstraints);
    for (const itc of cf.includesType.constraints) {
      if (itc.path.length == 1 && itc.isA.equals(path[0])) {

        value = findValueByIdentifier(itc.path[0], fieldsToSearch);
        if (value !== undefined) {
          if (value instanceof RefValue) {
            value = new RefValue(itc.isA).withCard(itc.card).withConstraints(value.constraints);
          } else {
            value = new IdentifiableValue(itc.isA).withCard(itc.card).withConstraints(value.constraints);
          }
        }
      }
    }
  }

  if (value === undefined) {
    return; // invalid path
  }

  if (path.length == 1) {
    return value; // this was the tail of the path
  }

  // We're not at the end of the path, so we must dig deeper
  def = specs.dataElements.findByIdentifier(choiceFriendlyEffectiveIdentifier(value));
  if (def === undefined) {
    return; // invalid path
  }

  // First see if we can continue the path by traversing the value
  if (def.value !== undefined) {
    const subValue = findValueByPath(specs, path.slice(1), def, true, value.constraints);
    if (subValue !== undefined) {
      return mergeConstraintsToChild(value.constraints, subValue, true);
    }
  }

  // Still haven't found it, so traverse the rest
  const subValue = findValueByPath(specs, path.slice(1), def, false, value.constraints);
  if (subValue !== undefined) {
    return subValue;
  }
}

// Given an identifier and a list of values, it will return the matching value, with all constraints aggregrated onto it
function findValueByIdentifier(identifier, values) {
  for (let value of values) {
    if (value instanceof IdentifiableValue && value.possibleIdentifiers.some(pid => pid.equals(identifier))) {
      // If the identifier isn't the value's direct identifier or effective identifier, it's
      // probably from an includes type.  Check for that case.
      if (!identifier.equals(value.identifier) && !identifier.equals(value.effectiveIdentifier)) {
        for (const itc of value.constraintsFilter.includesType.constraints) {
          if (itc.path.length == 0 && itc.isA.equals(identifier)) {
            // It did resolve from an includes type, so return a value referencing the includes type instead!
            // Remove any of the direct type-ish constraints and card constraints since we're setting type & card
            const constraintsToCopy = value.constraints.filter(c => {
              return c.path.length === 0
                && !(c instanceof IncludesTypeConstraint)
                && !(c instanceof TypeConstraint)
                && !(c instanceof CardConstraint);
            });
            if (value instanceof RefValue) {
              value = new RefValue(itc.isA).withCard(itc.card).withConstraints(constraintsToCopy);
            } else {
              value = new IdentifiableValue(itc.isA).withCard(itc.card).withConstraints(constraintsToCopy);
            }
            // Apply special marker used only in FHIR Exporter.  There is probably a more elegant way, but the
            // alternative right now seems to require a ton of code
            value._derivedFromIncludesTypeConstraint = true;
            break;
          }
        }
      }
      return value;
    } else if (value instanceof ChoiceValue) {
      // First check to see if there is a type constraint to make this a single value type
      const typeConstrained = value.constraintsFilter.own.type.constraints.some(c => c.isA.equals(identifier));

      let opt = findValueByIdentifier(identifier, value.options);
      if (opt !== undefined) {
        // We need to modify cardinality to:
        // (a) use the choice's cardinality, because choice options are now ALWAYS 1..1
        // (b) set min to 0 if there are multiple options (since it will have 0 instances if not selected)
        opt = opt.clone().withCard(value.effectiveCard.clone());
        if (value.options.length > 1 && !typeConstrained) {
          opt.card.min = 0;
        }
        return mergeConstraintsToChild(value.constraints, opt);
      }
    }
  }
}

function mergeConstraintsToChild(parentConstraints, childValue, childIsElementValue=false) {
  let constraints = [];
  for (const cst of parentConstraints) {
    if (childIsElementValue && cst.path.length == 0 && cst.onValue) {
      const transferredCst = cst.clone();
      transferredCst.onValue = false;
      constraints.push(transferredCst);
    } else if (cst.path.length > 0) {
      if (cst.path[0].equals(childValue.effectiveIdentifier) || (childValue.options && childValue.aggregateOptions.some(o => cst.path[0].equals(o.effectiveIdentifier)))) {
        const transferredCst = cst.clone();
        transferredCst.path.shift(); // Remove the first element of the path since we're transferring this to the child
        constraints.push(transferredCst);
      }
    }
  }
  // Remove any type constraints that are no-ops
  constraints = constraints.filter(c => !(c instanceof TypeConstraint && c.isA.equals(choiceFriendlyEffectiveIdentifier(childValue))));
  if (constraints.length == 0) {
    return childValue;
  }
  const mergedChild = childValue.clone();
  // Preserve special marker used only in FHIR Exporter.  There is probably a more elegant way, but the
  // alternative right now seems to require a ton of code
  if (childValue._derivedFromIncludesTypeConstraint) {
    mergedChild._derivedFromIncludesTypeConstraint = true;
  }
  for (const cst of mergedChild.constraints) {
    const siblings = new ConstraintsFilter(constraints).withPath(cst.path).constraints;
    if (siblings.some(c => c.constructor.name == cst.constructor.name)) {
      continue; // Don't add this constraint since the parent has the same type
    }
    constraints.push(cst);
  }
  mergedChild.constraints = constraints;
  return mergedChild;
}

function getAggregateEffectiveCardinality(elementIdentifier, path, specs) {
  const cards = [];
  
  const def = specs.dataElements.findByIdentifier(elementIdentifier);
  for (let i=0; i < path.length; i++) {
    const sourceValue = findValueByPath(specs, path.slice(0, i+1), def);
    cards.push(sourceValue.effectiveCard);
  }
  return aggregateCardinality(...cards);
}

function aggregateCardinality(...card) {
  if (card.length == 0) {
    return;
  }
  const min = card.reduce((val, current) => val * current.min, 1);
  const max = card.reduce((val, current) => {
    if (val == 0 || current.max == 0) {
      return 0;
    } else if (val === undefined || current.max == undefined) {
      return; // keep it undefined (e.g. unbounded)
    } else {
      return val * current.max;
    }
  }, 1);
  return new Cardinality(min, max);
}

function fillElementLines(dataElementLines, profileLines, vsMap, de, specs, config) {
  let isInProfileList = false;
  const valueAndFields = [de.value, ...de.fields];
  const profileName = getHumanReadableProfileName(de.identifier.name);
  for (const f of valueAndFields) {
    if (!(f && f.identifier)) continue; // no field or no identifier

    let includesTypeConstraints = f.constraintsFilter.includesType.constraints;

    const cpRules = (specs.contentProfiles.findRulesByIdentifierAndField(de.identifier, f.identifier));

    for (const rule of cpRules) {
      if (!rule.mustSupport) continue; // not a must-support rule
      isInProfileList = true; // some rule of element is must-support, so include in profile list
      if (includesTypeConstraints.length > 0) {
        for (const itc of includesTypeConstraints) {
          const itcName = getHumanReadableProfileName(itc.isA.name);
          const itcElement = specs.dataElements.findByIdentifier(itc.isA);
          const description = `${itcElement.description}`;
          const cardInfo = getCardinalityInfo(itc.card);
          dataElementLines.push([profileName, itcName, description, cardInfo.requirement, cardInfo.multiplicity, '', '', '', '']);
        }
      } else {
        const pathName = getHumanReadablePathName(rule.path);
        const endOfPathElement = specs.dataElements.findByIdentifier(rule.path[rule.path.length-1]);
        const description = `${endOfPathElement.description}`;
        const card = getAggregateEffectiveCardinality(de.identifier, rule.path, specs);
        const cardInfo = getCardinalityInfo(card);
        const dataType = getDataType(de, rule.path, specs, endOfPathElement);
        const vsInfo = getVsInfo(de, rule.path, specs, config.projectURL);
        const url = vsInfo ? vsInfo.url : '';
        const strength = vsInfo ? vsInfo.strength.toLowerCase() : '';
        const unit = getUnit(de, rule.path, specs, config.projectURL);
        dataElementLines.push([profileName, pathName, description, cardInfo.requirement, cardInfo.multiplicity, dataType, url, strength, unit]);
        if (vsInfo) {
          vsMap.set(vsInfo.url, vsInfo.vs);
        }
      }
    }
  }

  if (isInProfileList) {
    profileLines.push([profileName, de.description]);
  }
}

function fillValueSetLines(vs, valueSetLines, valueSetDetailsLines) {
  for (const rule of vs.rulesFilter.includesCode.rules) {
    valueSetDetailsLines.push([
      vs.identifier.name,
      urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
      `${rule.code.code}`,
      `${rule.code.display}`
    ]);
  }
  for (const rule of vs.rulesFilter.includesDescendents.rules) {
    valueSetDetailsLines.push([
      vs.identifier.name,
      urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
      `includes codes descending from ${rule.code.code}`,
      `${rule.code.display}`
    ]);
  }
  for (const rule of vs.rulesFilter.includesFromCode.rules) {
    valueSetDetailsLines.push([
      vs.identifier.name,
      urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
      `includes codes from code ${rule.code.code}`,
      `${rule.code.display}`
    ]);
  }
  for (const rule of vs.rulesFilter.includesFromCodeSystem.rules) {
    valueSetDetailsLines.push([
      vs.identifier.name,
      urlsToNames[rule.system] ? urlsToNames[rule.system] : rule.system,
      `includes codes from code system ${urlsToNames[rule.system] ? urlsToNames[rule.system] : rule.system}`,
      ''
    ]);
  }
  for (const rule of vs.rulesFilter.excludesDescendents.rules) {
    valueSetDetailsLines.push([
      vs.identifier.name,
      urlsToNames[rule.code.system] ? urlsToNames[rule.code.system] : rule.code.system,
      `excludes codes descending from ${rule.code.code}`,
      `${rule.code.display}`
    ]);
  }

  let codeSystems = new Set();
  for (const rule of vs.rulesFilter.includesCode.rules) {
    codeSystems.add(urlsToNames[rule.code.system]);
  }
  for (const rule of vs.rulesFilter.includesDescendents.rules) {
    codeSystems.add(urlsToNames[rule.code.system]);
  }
  for (const rule of vs.rulesFilter.includesFromCode.rules) {
    codeSystems.add(urlsToNames[rule.code.system]);
  }
  for (const rule of vs.rulesFilter.includesFromCodeSystem.rules) {
    codeSystems.add(urlsToNames[rule.system]);
  }
  for (const rule of vs.rulesFilter.excludesDescendents.rules) {
    codeSystems.add(urlsToNames[rule.code.system]);
  }
  codeSystems.delete(null);
  codeSystems.delete(undefined);
  valueSetLines.push([
    vs.identifier.name,
    `${vs.description ? vs.description : ''}`,
    `${Array.from(codeSystems).join(', ')}`
  ]);
}

module.exports = function printElements(specs, config) {
  const vsMap = new Map();
  const dataElementLines = [['Profile Name', 'Data Element Name', 'Description', 'Required in Profile?', 'Occurrences Allowed', 'Data Type', 'Value Set', 'Value Set Binding', 'Units']];
  const profileLines = [['Profile Name', 'Profile Description']];
  const valueSetLines = [['Value Set', 'Description', 'Code Systems']];
  const valueSetDetailsLines = [['Value Set', 'Code System', 'Code', 'Code Description']];
  for (const de of specs.dataElements.all) {
    fillElementLines(dataElementLines, profileLines, vsMap, de, specs, config);
  }

  for (const vs of vsMap.values()) {
    if (vs) fillValueSetLines(vs, valueSetLines, valueSetDetailsLines);
  }

  return { profileLines, dataElementLines, valueSetLines, valueSetDetailsLines };
};