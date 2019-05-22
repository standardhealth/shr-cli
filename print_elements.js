const { Identifier, IdentifiableValue, ChoiceValue, TypeConstraint, CardConstraint, IncludesTypeConstraint, ConstraintsFilter, RefValue } = require('shr-models');

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
    requirement = (card.min && card.min > 0) ? 'required' : 'optional';
    multiplicity = (card.max && card.max === 1) ? 'single' : 'multiple';
  }
  return { requirement, multiplicity };
}

function getDataType(de) {
  let type = '';
  if (de != null) {
    if (de.value instanceof IdentifiableValue) {
      type = de.value.effectiveIdentifier.name;
    } else if (de.value instanceof ChoiceValue) {
      type = de.value.aggregateOptions.filter(o => o.identifier).map(o => o.identifier.name).join(' or ');
    }
  }
  return type;
}

function getBinding(de, path, specs, projectURL) {
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
    return { url, strength: constraint.bindingStrength };
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
  if (typeof def.value !== 'undefined') {
    fieldsToSearch.push(mergeConstraintsToChild(parentConstraints, def.value, true));
  }
  if (!valueOnly) {
    fieldsToSearch.push(...(def.fields.map(f => mergeConstraintsToChild(parentConstraints, f, false))));
  }
  // Find the value at the root of the path
  let value = findValueByIdentifier(path[0], fieldsToSearch);

  // If we didn't find the value, it could be one of those cases where we replaced the original identifier with
  // an includesType identifier, so we should check the constraints to look for a match on the includesType.
  if (typeof value === 'undefined' && parentConstraints.length > 0) {
    const cf = new ConstraintsFilter(parentConstraints);
    for (const itc of cf.includesType.constraints) {
      if (itc.path.length == 1 && itc.isA.equals(path[0])) {

        value = findValueByIdentifier(itc.path[0], fieldsToSearch);
        if (typeof value !== 'undefined') {
          if (value instanceof RefValue) {
            value = new RefValue(itc.isA).withCard(itc.card).withConstraints(value.constraints);
          } else {
            value = new IdentifiableValue(itc.isA).withCard(itc.card).withConstraints(value.constraints);
          }
        }
      }
    }
  }

  if (typeof value === 'undefined') {
    return; // invalid path
  }

  if (path.length == 1) {
    return value; // this was the tail of the path
  }

  // We're not at the end of the path, so we must dig deeper
  def = specs.dataElements.findByIdentifier(choiceFriendlyEffectiveIdentifier(value));
  if (typeof def === 'undefined') {
    return; // invalid path
  }

  // First see if we can continue the path by traversing the value
  if (typeof def.value !== 'undefined') {
    const subValue = findValueByPath(specs, path.slice(1), def, true, value.constraints);
    if (typeof subValue !== 'undefined') {
      return mergeConstraintsToChild(value.constraints, subValue, true);
    }
  }

  // Still haven't found it, so traverse the rest
  const subValue = findValueByPath(specs, path.slice(1), def, false, value.constraints);
  if (typeof subValue !== 'undefined') {
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
      if (typeof opt !== 'undefined') {
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

function fillLines(dataElementLines, profileLines, de, specs, config) {
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
          const cardinalityInfo = getCardinalityInfo(itc.card);
          dataElementLines.push([profileName, itcName, description, cardinalityInfo.requirement, cardinalityInfo.multiplicity, '', '', '', '']);
        }
      } else {
        const pathName = getHumanReadablePathName(rule.path);
        const endOfPathElement = specs.dataElements.findByIdentifier(rule.path[rule.path.length-1]);
        const description = `${endOfPathElement.description}`;
        const cardinalityInfo = getCardinalityInfo(f.effectiveCard);
        const dataType = getDataType(endOfPathElement);
        const binding = getBinding(de, rule.path, specs, config.projectURL);
        const url = binding ? binding.url : '';
        const strength = binding ? binding.strength.toLowerCase() : '';
        const unit = getUnit(de, rule.path, specs, config.projectURL);
        dataElementLines.push([profileName, pathName, description, cardinalityInfo.requirement, cardinalityInfo.multiplicity, dataType, url, strength, unit]);
      }
    }
  }

  if (isInProfileList) {
    profileLines.push([profileName, de.description]);
  }
}

module.exports = function printElements(specs, config) {
  const dataElementLines = [['Profile Name', 'Data Element Name', 'Description', 'Required in Profile?', 'Occurrences Allowed', 'Data Type', 'Value Set', 'Value Set Binding', 'Units']];
  const profileLines = [['Profile Name', 'Profile Description']];
  for (const de of specs.dataElements.all) {
    fillLines(dataElementLines, profileLines, de, specs, config);
  }

  return { profileLines, dataElementLines };
};