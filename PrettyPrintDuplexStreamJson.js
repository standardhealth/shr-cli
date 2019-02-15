const Transform = require('stream').Transform;
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');   //library for colorizing Strings
// color palette for messages -- can also do rgb; e.g.  chalk.rgb(123, 45, 67)
const originalErrorColor = chalk.bold.greenBright;
const errorDetailColor = chalk.bold.cyan;
const otherColor = chalk.bold.yellowBright;
const errorCodeColor = chalk.bold.redBright;

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
    this.eCode = '-1';   // put in a value for error messages that don't have an ERROR_CODE
    this.solutionMap[this.eCode] = 'Error message has no error code; please add error code';  
    // build the hashMap resources from the errorMessages csv file; each column has a part 
    this.buildMapFromFile( csvFilePath, this.solutionMap, 0, 2);
    this.buildMapFromFile( csvFilePath, this.ruleMap, 0, 3);
    this.buildMapFromFile( csvFilePath, this.templateStrings, 0, 1);
    // populate a map with the key as the ERROR_CODE number and the value is the suggested solution
    this.idSet = new Set();
    this.idSet.add('-1');
  }

  buildMapFromFile( filePath, map, keyColumnNumber, valueColumnNumber) {
    let recArray = fs.readFileSync(filePath).toString().split('\n'); 
    // populate a map with the key as the ERROR_CODE number and the value is the suggested solution
    for( let i in recArray) {   
      let line = recArray[i].toString();
      let parts= line.split(',');
      let key = parts[keyColumnNumber].trim();
      let value = parts[valueColumnNumber];
      map[key] = value;
    }
  }

  translateNames( inName ) {   // translate error Strings to friendlier informative alternatives.
    if (inName === 'shr-expand') {
      return('FHIR Mapping(expansion)');
    }
    if (inName === 'shr-fhir-export') {
      return('FHIR Export');
    }
    return(inName);
  }
  
  getUnqualifiedName ( inName ) {     // take a name with '.' delimiters and return the last part
    if (inName === '') {
      return(inName);
    }
    let nameParts = inName.split('.');
    if (nameParts.length > 0) {
      return(nameParts[nameParts.length -1 ]);
    }
    return(inName);
  }

  parseErrorCode(myRegex, myMsg) {
    let result = myMsg.match(myRegex);
    let myECode = '-1';                    // supply default error code of -1 if msg doesn't have ERROR_CODE
    if (result !== undefined && result != null) {
      if ( result[1] === undefined || result[1] === null) {
        return(myECode);
      }
      else {
        myECode = result[1].trim();   
      }
    }
    return(myECode);
  }

  getAttributeOrEmptyString( myPart) {   // guard against undefined or null attributes
    if (myPart === undefined || myPart === null) {
      return('');
    }
    else {
      return(myPart);
    }
  }

  buildHashKey( errorCode, ruleMap,  jsonObj ) {  // construct a key by concatenating fields; this key defines 'uniqueness' for deduplication
    let hashValue = '';
    let semicolonDelimitedKeyList = ruleMap[errorCode];

    if (semicolonDelimitedKeyList !== undefined && semicolonDelimitedKeyList !== null ) {
      semicolonDelimitedKeyList = semicolonDelimitedKeyList.toString().replace(/'/g, '').trim() ;
      if ( semicolonDelimitedKeyList === '' ) {   // if you have no keys for deduplication in errorMessages.txt for this error, print everything
        return(hashValue);
      }
      let parts = semicolonDelimitedKeyList.split(';');
    
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
          hashValue += curKey + '$';    //check if 
        }
      } 
    }
    return(hashValue);
  }

  processTemplate_new(jsonKeys, myTemplate  ) {  // get the elements from the template and fill them in; return the detail message
    let template = myTemplate;
    let templateRegex=/\$\{([\w\d]+)\}/g;
    if (myTemplate !== undefined) {
      let myMatches  = myTemplate.match(templateRegex);
      if (myMatches !== undefined && myMatches !== null) {
      
        for (let i=0; i < myMatches.length; i++) {
          let strToReplace = myMatches[i].toString();
          let myKey = strToReplace.replace(/\{/g, '').replace(/\}/g, '').replace(/\$/g, '');
          let myValue = this.myJson[myKey];
          if (myValue !== undefined) {
            template = template.replace(strToReplace, myValue);
          }
          else {
            template = template.replace(strToReplace, errorDetailColor('undefined parameter'));
          }
        }
      }
    } 
    return(template);
  }
  
  // this function processes a single error message and returns a colorized, formatted string
  // for the moment, it writes the original input message in red to console.log
  processLine(myinline, printAllErrors) {
    let myline = myinline.toString();
    this.oldErrCodeRegex = /ERROR_CODE:([\d]+)\s*/; //match ERROR_CODE:ddddd  
    this.myJson = JSON.parse(myinline);          // convert String to object, then grab attributes
    let jsonKeys = Object.keys(this.myJson);
    this.jMsg = this.getAttributeOrEmptyString(this.myJson.msg ); 
    this.modulePart = this.getAttributeOrEmptyString(this.myJson.module);  //grab module
    this.errCodeRegex = /([\d]{5})\s*/; //match ERROR_CODE:ddddd  exactly 5 digits!!!!
    this.eCode = this.parseErrorCode(this.errCodeRegex, this.jMsg);   //extract ERROR_CODE:ddddd from msg attribute
    this.detailMsg = this.jMsg.replace(this.oldErrCodeRegex,'').replace(this.errCodeRegex, '');        // remove ERROR_CODE:ddddd from msg to get message detail
    this.myJsonErrorCode = this.getAttributeOrEmptyString(this.myJson.$ERROR_CODE ).toString(); 
    this.myTemplate = this.templateStrings[this.eCode];

    if (this.myTemplate !== undefined) {
      this.myTemplate = this.processTemplate_new(jsonKeys, this.myTemplate  ) ;
      this.detailMsg = this.myTemplate;
    }
    else {
      console.log( otherColor(' no template for errorCOde=:'+ this.eCode + ':'));
      return('');
    }

    if (this.myTemplate !== undefined ) {
      this.detailMsg = this.myTemplate;
    }  
    
    this.shrIdPart = this.getAttributeOrEmptyString( this.myJson.shrId );             //grab shrId
    this.mappingRulePart = this.getAttributeOrEmptyString( this.myJson.mappingRule ); //grab mappingRule
    this.targetPart = this.getAttributeOrEmptyString( this.myJson.target );          //grab targetPart
    this.targetSpecPart = this.getAttributeOrEmptyString( this.myJson.targetSpec );  //grab targetSpec
    // now we have pieces; assemble the pieces into a formatted, colorized, multi-line message
    this.outline =  errorCodeColor('\nERROR ' + this.eCode + ': ' + this.detailMsg );  // first part of new message is ERROR xxxxx: <<detail>> 
    this.outline +=   errorDetailColor ( '\n    During:         ' + this.translateNames(this.modulePart))
                   +   errorDetailColor( '\n    Class:          ' + this.getUnqualifiedName(this.translateNames(this.shrIdPart)));
    // if parts are optional/missing, then only print them if they are found
    if (this.targetSpecPart != '') {
      this.outline += errorDetailColor( '\n    Target Spec:    ' + this.translateNames(this.targetSpecPart));
    }
    if (this.targetPart != '') {
      this.outline += errorDetailColor( '\n    Target Class:   ' + this.translateNames(this.targetPart));
    }
    if (this.mappingRulePart != '') {
      this.outline += errorDetailColor( '\n    Mapping Rule:   ' + this.translateNames(this.mappingRulePart)) ;
    }
    // lookup the suggested fix using eCode as the key
    let suggestedFix = this.solutionMap[this.eCode];
    if ( suggestedFix !== undefined && suggestedFix !== null ) {
      suggestedFix = suggestedFix.replace(/'/g, '').trim() ;
       
      if (suggestedFix !== 'Unknown' && suggestedFix !== '') { 
        this.outline += errorDetailColor(   '\n    Suggested Fix:  ' + suggestedFix.trim() + '\n'  );
      }
    }

    let myDedupHashKey = this.buildHashKey( this.eCode, this.ruleMap,  this.myJson ) ;
    
    if (myDedupHashKey === '') { // if you have no keys for deduplication in errorMessages.txt for thisd, print everything
      return(this.outline);
    }
    else if (this.idSet.has(myDedupHashKey)) {
      return('');
    }
    else {
      this.idSet.add(myDedupHashKey);
      if (printAllErrors !== false) {
        console.log( originalErrorColor (myline )); 
      }
      return (this.outline);
    }
  }

  _transform(chunk, encoding, callback) {
    let ans = this.processLine(chunk, false);
    console.log( ans );
    callback();
  }
}
module.exports = PrettyPrintDuplexStreamJson;