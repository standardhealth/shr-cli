const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const { Identifier } = require('shr-models');

module.exports = function printElements(specs, config, out) {
  mkdirp.sync(out);
  const lines = ['Data Element,Cardinality,Data Type,Value Set'];
  for (const ns of specs.dataElements.namespaces) {
    printElementsInNamespace(specs, ns, out);
  }
  fs.writeFileSync(path.join(out, 'elements.csv'), lines.join('\n'));
};

function printElementsInNamespace(specs, namespace, out) {
  const lines = ['Data Element,Cardinality,Data Type,Value Set'];
  const dataElements = specs.dataElements.byNamespace(namespace).sort((a, b) => a.identifier.name < b.identifier.name ? -1 : 1);
  for (const de of dataElements) {
    lines.push(de.identifier.name);
    const deFieldLines = [];
    const valueAndFields = [de.value, ...de.fields];
    for (let i=0; i < valueAndFields.length; i++) {
      const f = valueAndFields[i];
      if (!f || (i>0 && !f.identifier)) continue;
      const name = i>0 ? f.identifier.name : 'Value';
      const card = f.effectiveCard.toString();
      const fValueAndPath = dive(specs, f);
      const dataType = getDataType(fValueAndPath);
      const valueSet = getValueSet(f, fValueAndPath);
      deFieldLines.push(`${de.identifier.name}.${name},${card},${dataType},${valueSet}`);
    }
    deFieldLines.sort((a, b) => {
      if (a.startsWith(`${de.identifier.name}.Value,`)) return -1;
      else if (b.startsWith(`${de.identifier.name}.Value,`)) return 1;
      else if (a < b) return -1;
      else return 1;
    });
    lines.push(...deFieldLines, '');
  }
  fs.writeFileSync(path.join(out, `elements_${namespace.replace(/\./g, '_')}.csv`), lines.join('\n'));
}

function dive(specs, field, path=[]) {
  if (field.identifier) {
    const fDef = specs.dataElements.findByIdentifier(field.effectiveIdentifier);
    if (fDef && fDef.value && fDef.fields.length == 0) {
      path.push(fDef.value.identifier ? fDef.value.identifier : new Identifier('', 'Value'));
      return dive(specs, fDef.value, path);
    }
  }
  return { value: field, path };
}

function getDataType(valueAndPath) {
  let type = '';
  if (valueAndPath.value.identifier) {
    type = valueAndPath.value.effectiveIdentifier.name;
  } else if (valueAndPath.value.options) {
    type = valueAndPath.value.aggregateOptions.filter(o => o.identifier).map(o => o.identifier.name).join(' or ');
  }
  return valueAndPath.path.lenght > 0 ? `Value: ${type}` : type;
}

function getValueSet(field, valueAndPath) {
  if (field.constraintsFilter.withPath(valueAndPath.path).valueSet.hasConstraints) {
    return field.constraintsFilter.withPath(valueAndPath.path).valueSet.constraints[0].valueSet;
  } else if (valueAndPath.value.constraintsFilter.own.valueSet.hasConstraints) {
    return valueAndPath.value.constraintsFilter.own.valueSet.constraints[0].valueSet;
  }
  return '';
}