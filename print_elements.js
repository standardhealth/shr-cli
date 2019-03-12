const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const { Identifier } = require('shr-models');

const chalk = require('chalk');   //library for colorizing Strings
const redColor = chalk.bold.redBright;
const greenColor = chalk.bold.greenBright;

module.exports = function printElements(specs, config, out) {
  mkdirp.sync(out);
  let lines = ['Namespace,Parent Element,Data Element,Cardinality,Data Type,Value Set,Description'];
  for (const ns of specs.dataElements.namespaces) {
    printElementsInNamespace(specs, ns, out, lines );
  }
  fs.writeFileSync(path.join(out, 'elements.csv'), lines.join('\n'));
};

function printElementsInNamespace(specs, namespace, out, lines) {
  //const lines = ['Data Element,Cardinality,Data Type,Value Set'];
  const dataElements = specs.dataElements.byNamespace(namespace).sort((a, b) => a.identifier.name < b.identifier.name ? -1 : 1);
  console.log('**** dataElements=' + JSON.stringify(dataElements) + '\n\n\n\n');
  for (const de of dataElements) {
    //console.log(greenColor('\n\t\t de=' + JSON.stringify(de)));
    //console.log('\n\t\t description=' + greenColor(JSON.stringify(description)));
    //lines.push(de.identifier.name);
    let parent_element = de.identifier.name;
    lines.push(`"${namespace}","${parent_element}","${de.identifier.name}",,"","","${de.description}"`);
    
    const deFieldLines = [];
    const valueAndFields = [de.value, ...de.fields];
    //console.log('valueAndFields=' + redColor(valueAndFields));
    //console.log('### de=' + JSON.stringify(de));
    for (let i=0; i < valueAndFields.length; i++) {
      const f = valueAndFields[i];
      //console.log('field1=' + JSON.stringify(f));

      let name = i>0 ? f.identifier.name : 'Value';
      if (name === undefined || name === null) {
        name = ' ';
      }
      let card = ' ';
      if ( f !== undefined && f !== null && f.effectiveCard !== undefined && f.effectiveCard !== null
        && f.effectiveCard.toString() !== undefined && f.effectiveCard.toString() !== null) {
        card = f.effectiveCard.toString();
      }
      const fValueAndPath = dive(specs, f);
      //console.log('fValueAndPath=' + JSON.stringify(fValueAndPath));
      const dataType = getDataType(fValueAndPath);
      const valueSet = getValueSet(f, fValueAndPath);
      //deFieldLines.push(`${de.identifier.name}.${name},${card},${dataType},${valueSet},${description}`);
      
      
      let descrip = '';
      if (f !== undefined && f !== null) {
        descrip = f.description;
        descrip = getDescription( specs, f );
        
        if (descrip === undefined || descrip === null) {
          descrip = de.description;
        }
        else {
          descrip = descrip.replace(/["]+/g,'');
          //console.log('descrip=:' + descrip + ':');
        }
      }
      
      //descrip = JSON.stringify(dive(de, 'description'));
      //console.log('!!! descrip=' + descrip);
      //deFieldLines.push(`"${namespace}","${de.identifier.name}.${name}",${card},"${dataType}","${valueSet}","${de.description}"`);
      deFieldLines.push(`"${namespace}","${parent_element}","${de.identifier.name}.${name}",${card},"${dataType}","${valueSet}","${descrip}"`);
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
  if (field !== undefined && field !== null ) {	
    if (field.identifier) {
      const fDef = specs.dataElements.findByIdentifier(field.effectiveIdentifier);
      
      if (fDef !== undefined ) {
        if (fDef.description !== undefined) {
          //let desc = fDef.description;
          //console.log('fDef.description=' + JSON.stringify(fDef.description));
        }
      }
      if (fDef && fDef.value && fDef.fields.length == 0) {
        path.push(fDef.value.identifier ? fDef.value.identifier : new Identifier('', 'Value'));
        return dive(specs, fDef.value, path);
      }
    }
  }
  else {
    return { value: '' , path};
  }
  return { value: field, path };
}


function getDescription(specs, field ) {
  if (field !== undefined && field !== null ) {	
    if (field.identifier) {
      const fDef = specs.dataElements.findByIdentifier(field.effectiveIdentifier);
      if (fDef !== undefined ) {
        if (fDef.description !== undefined) {
          return( JSON.stringify(fDef.description));
        }
      }
      else {
        return('');
      }
    }
  }
  else {
    return { value: '' , path};
  }
}



function getDataType(valueAndPath) {
  let type = '';
  if (valueAndPath !== undefined && valueAndPath !== null && valueAndPath.value !== undefined && valueAndPath.value !== null) {
    
    if (valueAndPath.value.identifier) {
      type = valueAndPath.value.effectiveIdentifier.name;
    } else if (valueAndPath.value.options) {
      type = valueAndPath.value.aggregateOptions.filter(o => o.identifier).map(o => o.identifier.name).join(' or ');
    }
    return valueAndPath.path.length > 0 ? `Value: ${type}` : type;
  }
  return( {Value: type });
}

function getValueSet(field, valueAndPath) {
  if (field !== undefined && field !== null ) {

    if (field.constraintsFilter.withPath(valueAndPath.path).valueSet.hasConstraints) {
      return field.constraintsFilter.withPath(valueAndPath.path).valueSet.constraints[0].valueSet;
    } else if (valueAndPath.value.constraintsFilter.own.valueSet.hasConstraints) {
      return valueAndPath.value.constraintsFilter.own.valueSet.constraints[0].valueSet;
    }
    return '';
  }
} 
