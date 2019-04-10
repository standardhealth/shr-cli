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
  printAllRules(specs);
  mkdirp.sync(out);
  let lines = [`"Namespace","Parent Element","Data Element Logical Path","Human Readable","Description","Cardinality","Data Type","Terminology Binding","Must Support"`];
  for (const ns of specs.dataElements.namespaces) {
    let suffixes = checkTheRules(specs,ns);
    printElementsInNamespace(specs, ns, out, lines, suffixes );
  }
  fs.writeFileSync(path.join(out, 'elements.csv'), lines.join('\n'));
  let myContentProfiles = specs.contentProfiles;
  console.log(require('util').inspect(myContentProfiles, {depth: null}));

  for ( const cps of myContentProfiles._nsMap  ) {
    //console.log('***\n' + require('util').inspect(cps, {depth: null}) );
  }
};

function printElementsInNamespace(specs, namespace, out, lines, suffixes ) {
  const dataElements = specs.dataElements.byNamespace(namespace).sort((a, b) => a.identifier.name < b.identifier.name ? -1 : 1);

  console.log('suffix=' + JSON.stringify(suffixes));

  for (const de of dataElements) {
    //console.log( '\nin printElements de=' + JSON.stringify(de) + '\n');
    let parent_element = de.identifier.name;
    let ms = 'false';
    let humanRead1 = camelCaseToHumanReadable(`${de.identifier.name}`);
    lines.push(`"${namespace}","${parent_element}","${de.identifier.name}","${humanRead1}","${de.description}","","","","${ms}"`);
    const deFieldLines = [];

    const valueAndFields = [de.value, ...de.fields];
    for (let i=0; i < valueAndFields.length; i++) {
      let f = valueAndFields[i];
      if (f !== undefined) {
        let nestedDE = specs._dataElements.findByIdentifier( f.identifier );
        let depth = 1;
        if( nestedDE !== undefined && nestedDE !== null) {
          expandLevel( specs, namespace, nestedDE, deFieldLines, depth, parent_element, suffixes ) ;
        }
      }
    }

    //let f = de.value;
    //let name = '';
    //let card = getCard(f);
    //const fValueAndPath = dive(specs, f);
    //let dataType = getDataType(fValueAndPath);
    //dataType = removeValuePrefix(dataType);
    //let valueSet = getValueSet(f, fValueAndPath);
    //let descrip = getDescrip(f, specs, de);
    //const humanRead = camelCaseToHumanReadable(`${de.identifier.name}.${name}`); 
 
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

function expandLevel( specs, namespace, de, deFieldLines, depth, parentElementName, suffixes ) {
  if (depth >= 10) {
    return;
  }

  let newDepth = depth + 1;
  let parent_element = de.identifier.name;
  const valueAndFields = [de.value, ...de.fields];
  for (let i=0; i < valueAndFields.length; i++) {
    const f = valueAndFields[i];
    if (f !== undefined) {
      let nestedDE = specs._dataElements.findByIdentifier( f.identifier );
      if( nestedDE !== undefined && nestedDE !== null ) {
        if ( nestedDE._isEntry === true || nestedDE._isEntry === false ) {
          let newParent = parentElementName + '.' + parent_element;
          expandLevel( specs, namespace, nestedDE, deFieldLines, newDepth, newParent, suffixes ) ;
        }
      }
    }

    let name = i>0 ? f.identifier.name : 'Value';
    if (name === undefined || name === null) {
      name = ' ';
    }
    let card = getCard(f);
    const fValueAndPath = dive(specs, f);
    let dataType = getDataType(fValueAndPath);
    dataType = removeValuePrefix(dataType);
    const valueSet = getValueSet(f, fValueAndPath);

    let descrip = getDescrip(f, specs, de);    
    let mustSupport = checkMustSupportSuffix(`"${parentElementName}.${de.identifier.name}.${name}"`, suffixes);
    const humanRead = camelCaseToHumanReadable(`${de.identifier.name}.${name}`);
    deFieldLines.push(`"${namespace}","${parent_element}","${parentElementName}.${de.identifier.name}.${name}","${humanRead}","${descrip}",${card},"${dataType}","${valueSet}","${mustSupport}"`);
  }
}
function endsWith(s1, w1) {
  let pos = s1.indexOf(w1 , s1.length + - (w1.length+1));
  if (pos === -1) {
    return(false);
  }
  else {
    return(true);
  }
}

function checkMustSupportSuffix( parent_element_name, suffixes) {
  let mustSupport = false;
  if (suffixes === undefined || suffixes.length === 0) {
    return(mustSupport);
  }

  for ( let s of suffixes)  {
    if ( endsWith( parent_element_name, s)) {
      console.log('@@@@@ MUST_SUPPORT=' + parent_element_name);
      return('MUST_SUPPORT');
    }
  }
  return(mustSupport);
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

function printAllRules(specs) {
  let rules = specs._contentProfiles.all;

  console.log(' allrules =' + JSON.stringify(rules));

}

function checkTheRules( specs, namespace, myName ) {
  let suffixes= [];
  console.log('\nnamespace=' + namespace);
  let myContentProfiles = specs.contentProfiles;
  let myArr = myContentProfiles.byNamespace(namespace);   //.get('oncocore').values();
  for ( let ent of myArr ) {
    for ( let p of ent.rules) {
      let newName = ent.identifier.name ;
      for ( let n of p.path) {
        newName = newName + '.' + n.name;
      }
      
      suffixes.push(newName);
    }
  }
  return(suffixes);
}

function printRule(specs, de) {
  const myRule2 = specs._contentProfiles.findByIdentifier(de.identifier) ;
  if (myRule2 !== undefined  ) {
    console.log('\n identifier='  + de.identifier + ' de.identifier.name=' +  de.identifier.name + ' rule=' + JSON.stringify(myRule2) );
    let mustSupportStr = JSON.stringify(myRule2.identifier.fqn);
    let mustSupportRulesStr = JSON.stringify(myRule2.rules);
    console.log('mustSupportStr=' + mustSupportStr  + ' mustSupportRulesStr=' + mustSupportRulesStr );

    for (const ruleInst of myRule2.rules) {
      let fqn  = '';
      console.log('ruleInst= '  + JSON.stringify(ruleInst) );
      console.log('ruleInst.mustSupport= '  + JSON.stringify(ruleInst.mustSupport) );
      console.log('ruleInst._path= '  + JSON.stringify(ruleInst._path) );
      for (const pathInst of ruleInst._path) {
        fqn = fqn + '.' + pathInst._name;
        console.log(' pathInst._name=' +  pathInst._name);
      }
      console.log( 'fqn=' + fqn);

      console.log( 'deRule=' + JSON.stringify(de) + '\n');
    }
  }
}

function checkRule(specs, de) {
  const myRule2 = specs._contentProfiles.findByIdentifier(de.identifier) ;
  if (myRule2 !== undefined  ) {
    return( true);
  }
  else {
    return(false);
  }

}
