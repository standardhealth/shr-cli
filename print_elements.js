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

  let myContentProfiles = specs.contentProfiles;
  
  
  console.log(require('util').inspect(myContentProfiles, {depth: null}));

  for ( const cps of myContentProfiles._nsMap  ) {
    //console.log('***\n' + require('util').inspect(cps, {depth: null}) );
  }


};

function printElementsInNamespace(specs, namespace, out, lines) {
  const dataElements = specs.dataElements.byNamespace(namespace).sort((a, b) => a.identifier.name < b.identifier.name ? -1 : 1);
  //console.log('**** dataElements=' + JSON.stringify(dataElements) + '\n\n\n\n');
  let myContentProfiles = specs.contentProfiles;

  for (const de of dataElements) {
    let parent_element = de.identifier.name;
    lines.push(`"${namespace}","${parent_element}","${de.identifier.name}",,"","","${de.description}"`);
    const deFieldLines = [];
    const valueAndFields = [de.value, ...de.fields];
    for (let i=0; i < valueAndFields.length; i++) {
      const f = valueAndFields[i];
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
      const dataType = getDataType(fValueAndPath);
      const valueSet = getValueSet(f, fValueAndPath);
      let descrip = '';
      if (f !== undefined && f !== null) {
        descrip = f.description;
        descrip = getDescription( specs, f );
        
        if (descrip === undefined || descrip === null) {
          descrip = de.description;
        }
        else {
          descrip = descrip.replace(/["]+/g,'');
        }
      }
      //console.log(`'iden=' "${de.identifier.name}.${name}"`);
      //const myRule = specs._contentProfiles.findRuleByIdentifierAndPath(name, de.identifier.name);
      if (de.identifier.name === 'MophologyBehavior') {
        console.log('****** found MophologyBehavior');
      }
      const myRule = specs._contentProfiles.findRulesByIdentifierAndField(de.identifier.name, name) ;
      if (myRule !== undefined && myRule.length > 0 ) {
        console.log('rule=' + JSON.stringify(myRule));
      }
      const myRule2 = specs._contentProfiles.findByIdentifier(de.identifier) ;
      if (myRule2 !== undefined  ) {
        console.log('identifier='  + de.identifier +  ' rule=' + JSON.stringify(myRule2));
      }

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
          //
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
