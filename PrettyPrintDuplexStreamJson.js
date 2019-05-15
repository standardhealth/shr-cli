const Transform = require('stream').Transform;
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');   //library for colorizing Strings
// color palette for messages -- can also do rgb; e.g.  chalk.rgb(123, 45, 67)
const originalErrorColor = chalk.bold.greenBright;
const errorDetailColor = chalk.bold.cyan;
const errorCodeColor = chalk.bold.redBright;
const noErrorCode = '-1';

//https://stackoverflow.com/questions/48507828/pipe-issue-with-node-js-duplex-stream-example

// make a class that implements a Duplex stream; this means you can use it to pipe into and out of
class PrettyPrintDuplexStreamJson extends Transform {
  constructor(name, options) {
    super(options);
    this.name = name;
    this.solutionMap = {};
    this.ruleMap = {};
    this.templateStrings = {};
    const csvFilePath = path.join(__dirname, 'errorMessages.txt' );
    this.solutionMap[ noErrorCode ] = 'Error message has no error code; please add error code';  // -1 means noErrorCode
    // build the hashMap resources from the errorMessages csv file; each column has a part 
    this.buildMapFromFile( csvFilePath, this.solutionMap, 0, 2);
    this.buildMapFromFile( csvFilePath, this.ruleMap, 0, 3);
    this.buildMapFromFile( csvFilePath, this.templateStrings, 0, 1);
    // populate a set with the key as the ERROR_CODE number and the value is the suggested solution
    this.idSet = new Set();
    this.idSet.add( noErrorCode );
  }

  buildMapFromFile( filePath, map, keyColumnNumber, valueColumnNumber) {
    const recArray = fs.readFileSync(filePath).toString().split('\n'); 
    // populate a map with the key as the ERROR_CODE number and the value is the suggested solution
    for( const i in recArray) {   
      const line = recArray[i].toString();
      const parts= line.split(',');
      const key = parts[keyColumnNumber].trim();
      const value = parts[valueColumnNumber];
      map[key] = value;
    }
  }

  translateNames( inName ) {   // translate error Strings to friendlier informative alternatives.
    switch(inName) {
    case 'shr-expand': return ('Model Expansion');
    case 'shr-fhir-export' : return ('FHIR Export') ;
    default: return inName ;
    }
  }
  
  getUnqualifiedName ( inName ) {     // take a name with '.' delimiters and return the last part
    if (inName === '') {
      return inName ;
    }
    const nameParts = inName.split('.');
    if (nameParts.length > 0) {
      return nameParts[nameParts.length -1 ];
    }
    return inName;
  }

  parseErrorCode(myRegex, myMsg) {
    const result = myMsg.match(myRegex);
    let myECode = noErrorCode;       // supply default error code of -1 (noErrorCode) if msg doesn't have ERROR_CODE
    if ( result != null) {
      if ( result[1] == null) {
        return myECode ;
      }
      else {
        myECode = result[1].trim();   
      }
    }
    return myECode ;
  }

  getAttributeOrEmptyString( myPart) {   // guard against undefined or null attributes
    if (myPart == null) {
      return '' ;
    }
    else {
      return myPart;
    }
  }

  buildHashKey( errorCode, ruleMap,  jsonObj ) {  // construct a key by concatenating fields; this key defines 'uniqueness' for deduplication
    let hashValue = '';
    let semicolonDelimitedKeyList = ruleMap[errorCode];

    if ( semicolonDelimitedKeyList != null ) {
      semicolonDelimitedKeyList = semicolonDelimitedKeyList.toString().replace(/'/g, '').trim() ;
      if ( semicolonDelimitedKeyList === '' ) {   // if you have no keys for deduplication in errorMessages.txt for this error, print everything
        return hashValue ;
      }
      const parts = semicolonDelimitedKeyList.split(';');
    
      for (let i=0; i < parts.length; i++) {
        let curKey = parts[i].trim();   // since errorCode not in json attributes we have to special case this
        if (curKey === 'errorNumber' ) {
          hashValue += errorCode + '$'; 
        }
        else {
          curKey = jsonObj[ parts[i].trim() ];
          if (curKey === undefined) {
            console.log('undefined JSON atttribute ' + parts[i].trim());
          }
          hashValue += curKey + '$';    
        }
      } 
    }
    return hashValue;
  }

  processTemplate(jsonKeys, myTemplate, myJson  ) {  // get the elements from the template and fill them in; return the detail message
    let template = myTemplate;
    const templateRegex=/\$\{([\w\d]+)\}/g;
    if (myTemplate != null) {
      const myMatches  = myTemplate.match(templateRegex);
      if (myMatches != null) {
      
        for (let i=0; i < myMatches.length; i++) {
          const strToReplace = myMatches[i].toString();
          const myKey = strToReplace.replace(/\{/g, '').replace(/\}/g, '').replace(/\$/g, '');
          const myValue = myJson[myKey];
          if (myValue != null) {
            template = template.replace(strToReplace, myValue);
          }
          else {
            template = template.replace(strToReplace, errorDetailColor('undefined parameter'));
          }
        }
      }
    } 
    return template ;
  }
  
  // this function processes a single error message and returns a colorized, formatted string
  // for the moment, it writes the original input message in red to console.log
  processLine(myinline, printAllErrors) {
    
    if (printAllErrors !== false) {
      console.log( originalErrorColor (myinline )); 
    }
    const myJson = JSON.parse(myinline);          // convert String to object, then grab attributes
    const jsonKeys = Object.keys( myJson);
    const jMsg = this.getAttributeOrEmptyString( myJson.msg ); 
    const modulePart = this.getAttributeOrEmptyString( myJson.module);  //grab module
    const eCode = this.parseErrorCode( /([\d]{5})\s*/, jMsg); //extract ERROR_CODE:ddddd from msg attribute;eCode = noErrorCode if not found;
    let detailMsg = '';
    let myTemplate = this.templateStrings[ eCode ];

    if (myTemplate != null) {
      detailMsg = this.processTemplate(jsonKeys, myTemplate, myJson  ) ;
    }
    else {
      console.log( errorCodeColor(' Message is missing errorCode; no template found.  Default error code '+ eCode + ':'));
      return '';
    } 
    
    const shrIdPart = this.getAttributeOrEmptyString( myJson.shrId );             //grab shrId
    const mappingRulePart = this.getAttributeOrEmptyString( myJson.mappingRule ); //grab mappingRule
    const targetPart = this.getAttributeOrEmptyString( myJson.target );          //grab targetPart
    const targetSpecPart = this.getAttributeOrEmptyString( myJson.targetSpec );  //grab targetSpec
    // now we have pieces; assemble the pieces into a formatted, colorized, multi-line message
    let outline =  errorCodeColor('\nERROR ' + eCode + ': ' + detailMsg );  // first part of new message is ERROR xxxxx: <<detail>> 
    outline +=   errorDetailColor ( '\n    During:         ' + this.translateNames( modulePart))
                   +   errorDetailColor( '\n    Class:          ' + this.getUnqualifiedName(this.translateNames( shrIdPart)));
    // if parts are optional/missing, then only print them if they are found
    if ( targetSpecPart != '') {
      outline += errorDetailColor( '\n    Target Spec:    ' + this.translateNames(this.targetSpecPart));
    }
    if ( targetPart != '') {
      outline += errorDetailColor( '\n    Target Class:   ' + this.translateNames(this.targetPart));
    }
    if ( mappingRulePart != '') {
      outline += errorDetailColor( '\n    Mapping Rule:   ' + this.translateNames( mappingRulePart)) ;
    }
    // lookup the suggested fix using eCode as the key
    let suggestedFix = this.solutionMap[ eCode ];
    if ( suggestedFix != null ) {
      suggestedFix = suggestedFix.replace(/'/g, '').trim() ;
      // only print suggested fix if it's available from the resource file (i.e. in the solutionMap)
      if (suggestedFix !== 'Unknown' && suggestedFix !== '') { 
        outline += errorDetailColor(   '\n    Suggested Fix:  ' + suggestedFix.trim() + '\n'  );
      }
    }
    const myDedupHashKey = this.buildHashKey( eCode, this.ruleMap,  myJson ) ;
    
    if (myDedupHashKey === '') { // if you have no keys for deduplication in errorMessages.txt for thisd, print everything
      return outline ;
    }
    else if (this.idSet.has(myDedupHashKey)) {
      return '';
    }
    else {
      this.idSet.add(myDedupHashKey);

      return outline ;
    }
  }

  _transform(chunk, encoding, callback) {
    const ans = this.processLine(chunk, false);
    console.log( ans );
    callback();
  }
}
module.exports = PrettyPrintDuplexStreamJson;