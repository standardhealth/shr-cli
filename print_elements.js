const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const { Identifier, IdentifiableValue, ChoiceValue } = require('shr-models');

const ENTRY_ID = new Identifier('shr.base', 'Entry');
const CONCEPT_ID = new Identifier('shr.core', 'CodeableConcept');

function getCard(f) {
  let card = ' ';
  if (f != null && f.effectiveCard != null && f.effectiveCard.toString() != null) {
    card = f.effectiveCard.toString();
  }
  return card;
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

function getBinding(de, path, dataElements, projectURL) {
  let constraint;

  if (typeof de.value !== 'undefined') {
    constraint = de.value.constraintsFilter.valueSet.constraints[0];
  } else if (typeof de.value === 'undefined' && path[0].isConceptKeyWord) {
    constraint = de.value.constraintsFilter.valueSet.constraints[0];
  }

  if (constraint) {
    const url = constraint.valueSet.startsWith(projectURL) ? constraint.valueSet.split('/')[constraint.valueSet.split('/').length-1] : constraint.valueSet;
    return `${url} (${constraint.bindingStrength})`;
  }

  // We're not at the end of the path, so we must dig deeper
  if (de && de.value) {
    if (path.length > 0) {
      de = dataElements.findByIdentifier(path[0]);
      if (typeof def === 'undefined') {
        return; // invalid path
      }
      path = path.slice(1);
      return getBinding(de, path, dataElements, projectURL);
    }
  }
}

module.exports = function printElements(specs, config, out) {
  const lines = ['Parent Element,Data Element Path,Data Element Name,Description,Cardinality,Data Type,Terminology Binding'];
  mkdirp.sync(out);
  for (const de of specs.dataElements.all) {
    const valueAndFields = [de.value, ...de.fields];
    for (const f of valueAndFields) {
      if (!f) continue; // no field
      const cpRules = (specs.contentProfiles.findRulesByIdentifierAndField(de.identifier, f.identifier));      
      for (const rule of cpRules) {
        const parentName = de.identifier.name;
        const path = `${parentName}.${rule.path.map(id => id.name).join('.')}`;
        const pathName = `"${path.replace('.', '').split(/(?=[A-Z])/).join(' ')}"`;
        const endOfPathElement = specs.dataElements.findByIdentifier(rule.path[rule.path.length-1]);
        const description = `"${endOfPathElement.description}"`;
        const cardinality = getCard(f);
        const dataType = getDataType(endOfPathElement);
        const binding = getBinding(de, rule.path, specs.dataElements, config.projectURL);
        lines.push([parentName, path, pathName, description, cardinality, dataType, binding].join(','));
      }
    }
  }
  fs.writeFileSync(path.join(out, 'elements.csv'), lines.join('\n'));
};