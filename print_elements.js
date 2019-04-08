const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const { Identifier, IdentifiableValue, ChoiceValue } = require('shr-models');

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
  let binding = '';
  let currentElement = de;
  for (const id of path) {
    let field = currentElement.value;
    if (!field) {
      field = currentElement.fields.find(f => {
        return f.identifier.equals(new Identifier('shr.core', 'CodeableConcept'))
          || f.identifier.equals(new Identifier('shr.core', 'Coding'))
          || f.identifier.equals(new Identifier('shr.core', 'Code'));
      });
    }
    if (field) {
      if (field.constraintsFilter.valueSet.hasConstraints) {
        const constraint = field.constraintsFilter.valueSet.constraints[0];
        const url = constraint.valueSet.startsWith(projectURL) ? constraint.valueSet.split('/')[constraint.valueSet.split('/').length-1] : constraint.valueSet;
        binding = `${url} (${constraint.bindingStrength})`;
      }
    }
    if (binding) {
      break;
    } else {
      currentElement = dataElements.findByIdentifier(id);
    }
  }
  return binding;
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