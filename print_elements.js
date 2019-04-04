const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const { Identifier } = require('shr-models');

function camelCaseToHumanReadable( instring ) {
// Whenever you have a Capital letter, insert a space
// Whenever you have a period, replace with ' '
  let res = '';
  for (let letter of instring) {
    if (letter === '.') {
      res = res + ' ';
    }
    else if (letter !== letter.toUpperCase() ) {
      res = res + letter;
    }
    else {
      res = res + ' ' + letter;
    }
  }
  return(res);
}


function removeValuePrefix(instring) {
  return( instring.replace(/Value: /,''));
}

function  getDescrip(f, specs, de) {
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
  return(descrip);
}

function getCard(f) {
  let card = ' ';
  if ( f !== undefined && f !== null && f.effectiveCard !== undefined && f.effectiveCard !== null
    && f.effectiveCard.toString() !== undefined && f.effectiveCard.toString() !== null) {
    card = f.effectiveCard.toString();
  }
  return(card);
}

module.exports = function printElements(specs, config, out) {
  mkdirp.sync(out);
  let lines = [`"Namespace","Parent Element","Data Element Logical Path","Human Readable","Description","Cardinality","Data Type","Terminology Binding","Must Support"`];
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

  for (const de of dataElements) {
    let parent_element = de.identifier.name;
    let ms = ' ';
    let humanRead1 = camelCaseToHumanReadable(`${de.identifier.name}`);
    lines.push(`"${namespace}","${parent_element}","${de.identifier.name}","${humanRead1}","${de.description}","","","","${ms}"`);
    const deFieldLines = [];

    const valueAndFields = [de.value, ...de.fields];
    for (let i=0; i < valueAndFields.length; i++) {
      let f = valueAndFields[i];
      //console.log('\n ###f=' + JSON.stringify(f));
      if (f !== undefined) {
        let nestedDE = specs._dataElements.findByIdentifier( f.identifier );
        let depth = 1;
        //console.log('\n ***element=' +  `"${namespace}","${parent_element}","${de.identifier.name}"` );
        if( nestedDE !== undefined && nestedDE !== null) {
          expandLevel( specs, namespace, nestedDE, deFieldLines, depth, parent_element ) ;
        }
      }
    }

    let f = de.value;
    let name = '';
    let card = getCard(f);
    const fValueAndPath = dive(specs, f);
    let dataType = getDataType(fValueAndPath);
    dataType = removeValuePrefix(dataType);
    let valueSet = getValueSet(f, fValueAndPath);

    //if ( f !== undefined && f !== null && f.effectiveCard !== undefined && f.effectiveCard !== null
    //  && f.effectiveCard.toString() !== undefined && f.effectiveCard.toString() !== null) {
    //  card = f.effectiveCard.toString();
    // }

    let descrip = getDescrip(f, specs, de);
    const humanRead = camelCaseToHumanReadable(`${de.identifier.name}.${name}`); 
    //deFieldLines.push(`"${namespace}","${parent_element}","${de.identifier.name}.${name}","${humanRead}","${descrip}",${card},"${dataType}","${valueSet}","${ms}"`);

    deFieldLines.sort((a, b) => {
      if (a.startsWith(`${de.identifier.name}.Value,`)) return -1;
      else if (b.startsWith(`${de.identifier.name}.Value,`)) return 1;
      else if (a < b) return -1;
      else return 1;
    });
    lines.push( ...deFieldLines );
  }
  fs.writeFileSync(path.join(out, `elements_${namespace.replace(/\./g, '_')}.csv`), lines.join('\n'));
}

function expandLevel( specs, namespace, de, deFieldLines, depth, parentElementName ) {
  if (depth >= 10) {
    return;
  }
  let newDepth = depth + 1;
  let parent_element = de.identifier.name;
  //const humanRead = camelCaseToHumanReadable(`${de.identifier.name}.${name}`); 
  //const deFieldLines = [];
  let ms = ' ';
  const valueAndFields = [de.value, ...de.fields];
  for (let i=0; i < valueAndFields.length; i++) {
    const f = valueAndFields[i];
    //console.log(' newDepth=' + newDepth + ' cf=' + JSON.stringify(f));
    if (f !== undefined) {
      let nestedDE = specs._dataElements.findByIdentifier( f.identifier );
      //console.log('\n ***element=' +  `"${namespace}","${parent_element}","${de.identifier.name}"` );
      if( nestedDE !== undefined && nestedDE !== null ) {
        if ( nestedDE._isEntry === true ) {
          //console.log('\n newName=' + de.identifier.name + '\n');
          //expandLevel( specs, namespace, nestedDE, deFieldLines, newDepth, parent_element + '.' + de.identifier.name ) ;
          expandLevel( specs, namespace, nestedDE, deFieldLines, newDepth, de.identifier.name ) ;
        }
      }
    }


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
    let dataType = getDataType(fValueAndPath);
    dataType = removeValuePrefix(dataType);
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
    const humanRead = camelCaseToHumanReadable(`${de.identifier.name}.${name}`);
    //deFieldLines.push(`"${namespace}","${parent_element}","${de.identifier.name}.${name}","${humanRead}","${descrip}",${card},"${dataType}","${valueSet}","${ms}"`);
    deFieldLines.push(`"${namespace}","${parent_element}","${parentElementName}.${de.identifier.name}.${name}","${humanRead}","${descrip}",${card},"${dataType}","${valueSet}","${ms}"`);
  }
}




function getSubElement(specs, field, path ) {
  if (field !== undefined && field !== null ) {	
    if (field.identifier) {
      const fDef = specs.dataElements.findByIdentifier(field.effectiveIdentifier);
      if (fDef && fDef.value && fDef.fields.length == 0) {
        path.push(fDef.value.identifier ? fDef.value.identifier : new Identifier('', 'Value'));
        return getSubElement(specs, fDef.value, path);
      }
    }
    return { value: field, path };
  }
  return { value: '', path };
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
    return { value: field, path };
  }
  return { value: '', path };
  /*
  else {
    return { value: '' , path};
  }
  return { value: field, path };
  */
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
