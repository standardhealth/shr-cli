const {FileStream, CommonTokenStream} = require('antlr4/index');
const {ParseTreeWalker} = require('antlr4/tree');
const {SHRLexer} = require('./lib/parsers/SHRLexer');
const {SHRParser} = require('./lib/parsers/SHRParser');
const {SHR2JS} = require('./lib/shr2js');
const {namespaceToSchemas} = require('./lib/schemaExport.js')

if (process.argv.length < 3) {
    console.log("Missing path to SHR definition file")
}

const inputFile = process.argv[2];
const chars = new FileStream(inputFile);
const lexer = new SHRLexer(chars);
const tokens  = new CommonTokenStream(lexer);
const parser = new SHRParser(tokens);
parser.buildParseTrees = true;
const tree = parser.shr();

const walker = new ParseTreeWalker();
const shr2js = new SHR2JS();
walker.walk(shr2js, tree);

for (ns of shr2js.namespaces()) {
    console.log(JSON.stringify(namespaceToSchemas(ns), null, "  "))
}