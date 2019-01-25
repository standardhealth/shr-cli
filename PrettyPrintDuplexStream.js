const Transform = require('stream').Transform;
var fs = require('fs');

const chalk = require('chalk');   //library for colorizing Strings
// color palette for messages -- can also do rgb; e.g.  chalk.rgb(123, 45, 67)
const originalErrorColor = chalk.bold.redBright;
const errorDetailColor = chalk.bold.cyan;
const errorCodeColor = chalk.bold.greenBright;

//https://stackoverflow.com/questions/48507828/pipe-issue-with-node-js-duplex-stream-example

// make a class that implements a Duplex stream; this means you can use it to pipe into and out of
class PrettyPrintDuplexStream extends Transform {

  constructor(name, options) {
    super(options);
    this.name = name;
    this.solutionMap = {};
    let csvFilePath = 'errorMessages.txt';
    var array = fs.readFileSync(csvFilePath).toString().split('\n');
    let eCode = '-1';   // put in a value for error messages that don't have an ERROR_CODE
    this.solutionMap[eCode] = 'Error message has no error code';  

    // populate a map with the key as the ERROR_CODE number and the value is the suggested solution
    for( var i in array) {   
      let line = array[i].toString();
      let parts= line.split(',');
      let key = parts[0].trim();
      let value = parts[2];
      this.solutionMap[key] = value;
    }
    this.idSet = new Set();
    this.idSet.add(-1);
  }

  translateNames( inName ) {   // translate error Strings to friendlier informative alternatives.
    if (inName === 'shr-expand') {
      return('FHIR Mapping(expansion)');
    }
    if (inName === 'shr-fhir-export') {
      return('FHIR Export');
    }
    if (inName === 'shr-expand') {
      return('FHIR Mapping(expansion)');
    }
    return(inName);
  }
  
  getUnqualifiedName ( inName ) {     // take a name with '.' delimiters and return the last part
    let nameParts = inName.split('.');
    if (nameParts.length > 0) {
      return(nameParts[nameParts.length -1 ]);
    }
    return(inName);
  }
  
  getMatchWithRegexPos(myStr, myRegex, pos) { // apply regex to String; return match at pos if it matches; otherwise the original string
    let myMatch  = myStr.match(myRegex);
    let myMsg = '';
    if (myMatch != null) {
      myMsg = myMatch[pos];
    }
    return(myMsg);
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
    
    let myline = myinline.toString();
    let reg = /ERROR_CODE:([\d]+)\s/;   //match ERROR_CODE:ddddd  
    let result = myline.match(reg);
    let preErrCode = '';
    let postErrCode = '';
    if (printAllErrors) {
      console.log( originalErrorColor (myline.trim() ));   // print the input message in red (for now)
    }
    let formattedOutput = '\nERROR ';
  
    // split myline on ERROR_CODE; preErrCode is everything before ERROR_CODE; postErrCode is everything after
    if (result !== undefined && result != null) {
      let temp = myline.split('ERROR_CODE');
      preErrCode = temp[0];
      postErrCode = temp[1];
      this.eCode = result[1];   //gpg
    }
    let dateTimeRegex = /\[\d\d:\d\d:\d\d.\d\d\dZ\]\s+/;
    let outline  = myline.replace(dateTimeRegex,'').toString();  //remove timestamp; format is [hh.mm.ss.xxxZ]
    let errShrRegex = /(ERROR[\s]+[\w]+:[\s]+)/;
    // split into piece before "ERROR_CODE" and piece after "ERROR_CODE"
    preErrCode = preErrCode.replace(errShrRegex, '');    // remove the 'ERROR shr' part
    preErrCode = preErrCode.replace(dateTimeRegex, ''); // remove the timestamp
    let detailMsg = preErrCode;
    formattedOutput += this.eCode + ': ' + detailMsg;  // first part of new message is ERROR xxxxx: <<detail>>
  
    // parse the parts we need
    let modulePart = this.parseFromPrefixOrSuffix( /module=([\w.-]+)[,]*/, preErrCode, postErrCode );  //parse module
    let shrIdPart =  this.parseFromPrefixOrSuffix( /shrId=([\w.-]+)[,]*/, preErrCode, postErrCode ); //parse shrId
    let mappingRulePart = this.parseFromPrefixOrSuffix( /mappingRule[=:]+[\s]*(["]*([\w."[\]-]+[\s]*)+["]*)/ ,preErrCode, postErrCode);  //parse MappingRule
    let targetPart =  this.parseFromPrefixOrSuffix( /target=([\w.-]+)[,]*/, preErrCode, postErrCode );  //parse target part
    let targetSpecPart = this.parseFromPrefixOrSuffix(/targetSpec=([\w.-]+)[,]*/,preErrCode, postErrCode); //parse targetSpec
    let targetUrlPart = this.getMatchWithRegexPos(postErrCode, /target:[\s]+([\w./:-]+)[,]*/, 1);  //parse targetURL
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
    outline += errorDetailColor( '\n    Suggested Fix:  ' + this.solutionMap[this.eCode.trim()]).trim() + '\n'  ;
    let key = this.eCode; // if you want a less strict de-duplicator, you can add another element; e.g. let key = eCode + targetPart;   
     
    if (this.idSet.has(key)) {
      return('');
    }
    else {
      this.idSet.add(key);
      if (printAllErrors === false) {
        console.log( originalErrorColor (myline )); 
      }
      return (outline);
    }
  }

  
  _transform(chunk, encoding, callback) {
    //this.push(chunk);
    let ans = this.processLine(chunk, true);
    console.log( ans );
    callback();
  }
}

module.exports = PrettyPrintDuplexStream;