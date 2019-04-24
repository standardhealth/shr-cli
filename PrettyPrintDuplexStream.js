const Transform = require('stream').Transform;
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');   //library for colorizing Strings
// color palette for messages -- can also do rgb; e.g.  chalk.rgb(123, 45, 67)
const originalErrorColor = chalk.bold.redBright;
const errorDetailColor = chalk.bold.cyan;
const errorCodeColor = chalk.bold.greenBright;
const noErrorCode = '-1';

//https://stackoverflow.com/questions/48507828/pipe-issue-with-node-js-duplex-stream-example

// make a class that implements a Duplex stream; this means you can use it to pipe into and out of
class PrettyPrintDuplexStream extends Transform {

  constructor(name, options) {
    super(options);
    this.name = name;
    this.solutionMap = {};
    const csvFilePath = path.join(__dirname, 'errorMessages.txt' );
    const allLines = fs.readFileSync(csvFilePath).toString().split('\n'); 
    this.solutionMap[ noErrorCode ] = 'Error message has no error code';  // put in a value for error messages that don't have an ERROR_CODE

    // populate a map with the key as the ERROR_CODE number and the value is the suggested solution
    for( var i in allLines) {   
      const line = allLines[i].toString();
      const parts= line.split(',');
      const key = parts[0].trim();
      const value = parts[2];
      this.solutionMap[key] = value;
    }
    this.idSet = new Set();
    this.idSet.add( noErrorCode );
  }

  translateNames( inName ) {   // translate error Strings to friendlier informative alternatives.
    switch(inName) {
    case 'shr-expand': return ('Model Expansion');
    case 'shr-fhir-export' : return ('FHIR Export') ;
    default: return(inName);
    }
  }
  
  getUnqualifiedName ( inName ) {     // take a name with '.' delimiters and return the last part
    const nameParts = inName.split('.');
    if (nameParts.length > 0) {
      return(nameParts[nameParts.length -1 ]);
    }
    return(inName);
  }
  
  getMatchWithRegexPos(myStr, myRegex, pos) { // apply regex to String; return match at pos if it matches; otherwise the original string
    const myMatch  = myStr.match(myRegex);  
    return( myStr.match(myRegex) != null ? myMatch[pos] : '');
  }
  
  parseFromPrefixOrSuffix( myRegex, myPrefix, mySuffix ) {
    let myPart = this.getMatchWithRegexPos(mySuffix, myRegex, 1);  //parse field from suffix
    if (myPart === '') {                                      // if missing, try prefix
      myPart = this.getMatchWithRegexPos(myPrefix, myRegex, 1); 
    }
    return(myPart);
  }
  
  // this function processes a single error message and returns a colorized, formatted string
  // for the moment, it writes the original input message in red to console.log
  processLine(myinline, printAllErrors) {
    const myline = myinline.toString();
    const result = myline.match(/ERROR_CODE:([\d]+)\s/);
    let preErrCode = '';
    let postErrCode = '';
    let eCode = noErrorCode;
    if (printAllErrors) {
      console.log( originalErrorColor (myline.trim() ));   // print the input message in red (for now)
    }
    let formattedOutput = '\nERROR ';
  
    // split myline on ERROR_CODE; preErrCode is everything before ERROR_CODE; postErrCode is everything after
    if ( result != null) {
      const temp = myline.split('ERROR_CODE');
      preErrCode = temp[0];
      postErrCode = temp[1];
      if ( result[1] == null) {
        eCode = noErrorCode;
      }
      else {
        eCode = result[1].trim(); 
      }
    }

    const dateTimeRegex = /\[\d\d:\d\d:\d\d.\d\d\dZ\]\s+/;
    let outline  = myline.replace(dateTimeRegex,'').toString();  //remove timestamp; format is [hh.mm.ss.xxxZ]
    const errShrRegex = /(ERROR[\s]+[\w]+:[\s]+)/;
    // split into piece before "ERROR_CODE" and piece after "ERROR_CODE"
    preErrCode = preErrCode.replace(errShrRegex, '');    // remove the 'ERROR shr' part
    preErrCode = preErrCode.replace(dateTimeRegex, ''); // remove the timestamp
    formattedOutput += `${eCode}: ${preErrCode}`;  // first part of new message is ERROR xxxxx: <<detail>>
  
    // parse the parts we need
    const modulePart = this.parseFromPrefixOrSuffix( /module=([\w.-]+)[,]*/, preErrCode, postErrCode );  //parse module
    const shrIdPart =  this.parseFromPrefixOrSuffix( /shrId=([\w.-]+)[,]*/, preErrCode, postErrCode ); //parse shrId
    //parse MappingRule
    const mappingRulePart = this.parseFromPrefixOrSuffix( /mappingRule[=:]+[\s]*(["]*([\w."[\]-]+[\s]*)+["]*)/ ,preErrCode, postErrCode).replace(/[\n]+/g,' ');  
    let targetPart =  this.parseFromPrefixOrSuffix( /target=([\w.-]+)[,]*/, preErrCode, postErrCode );  //parse target part
    const targetSpecPart = this.parseFromPrefixOrSuffix(/targetSpec=([\w.-]+)[,]*/,preErrCode, postErrCode); //parse targetSpec
    const targetUrlPart = this.getMatchWithRegexPos(postErrCode, /target:[\s]+([\w./:-]+)[,]*/, 1);  //parse targetURL
    if (targetPart === '') {
      targetPart = targetUrlPart;   // use targetURL if target is unavailable
    }
    
    // now we have pieces; assemble the pieces into a formatted, colorized, multi-line message
    outline = errorCodeColor(formattedOutput)   
    +   errorDetailColor ( '\n    During:         ' + this.translateNames(modulePart))
    +   errorDetailColor( '\n    Class:          ' + this.getUnqualifiedName(this.translateNames(shrIdPart)));
  
    // if parts are optional/missing, then only print them if they are found
    if (targetSpecPart != '') {
      outline += errorDetailColor( '\n    Target Spec:    ' + this.translateNames(targetSpecPart));
    }
    if (targetPart != '') {
      outline += errorDetailColor( '\n    Target Class:   ' + this.translateNames(targetPart));
    }
    if (mappingRulePart != '') {
      outline += errorDetailColor( '\n    Mapping Rule:   ' + this.translateNames(mappingRulePart)) ;
    }
  
    // lookup the suggested fix using eCode as the key
    const suggestedFixPart = this.solutionMap[eCode].toString().trim().replace(/['"']+/g,''); 
    if (suggestedFixPart !== '' && suggestedFixPart !== 'Unknown') {
      outline += errorDetailColor( '\n    Suggested Fix:  ' + suggestedFixPart  ) ;
    }
    const key = eCode; // if you want a less strict de-duplicator, you can add another element; e.g. let key = eCode + targetPart;   
     
    if (this.idSet.has(key)) {
      return('');
    }
    else {
      this.idSet.add(key);
      if (printAllErrors === true) {
        console.log( originalErrorColor (myline )); 
      }
      return (outline);
    }
  }

  
  _transform(chunk, encoding, callback) {
    const ans = this.processLine(chunk, false);
    console.log( ans );
    callback();
  }
}

module.exports = PrettyPrintDuplexStream;