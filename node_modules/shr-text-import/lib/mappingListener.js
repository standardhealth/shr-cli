const bunyan = require('bunyan');
const {FileStream, CommonTokenStream} = require('antlr4/index');
const {ParseTreeWalker} = require('antlr4/tree');
const {SHRMapLexer} = require('./parsers/SHRMapLexer');
const {SHRMapParser} = require('./parsers/SHRMapParser');
const {SHRMapParserListener} = require('./parsers/SHRMapParserListener');
const {SHRErrorListener} = require('./errorListener.js');
const {Specifications, Version, ElementMapping, Cardinality, Identifier, PrimitiveIdentifier, PRIMITIVES, TBD} = require('shr-models');

var rootLogger = bunyan.createLogger({name: 'shr-text-import'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

class MappingImporter extends SHRMapParserListener {
  constructor(specifications = new Specifications) {
    super();
    // The specifications container to put the mappings into
    this._specs = specifications;
    // The currently active target spec
    this._currentTargetSpec = '';
    // The currently active namespace
    this._currentNs = '';
    // The currently active grammar version
    this._currentGrammarVersion = '';
    // The currently active definition (ElementMapping)
    this._currentDef = null;
  }

  importFile(file) {
    // Setup a child logger to associate logs with the current file
    const lastLogger = logger;
    logger = rootLogger.child({ file: file });
    logger.debug('Start importing mapping file');
    try {
      const errListener = new SHRErrorListener(logger);
      const chars = new FileStream(file);
      const lexer = new SHRMapLexer(chars);
      lexer.removeErrorListeners();
      lexer.addErrorListener(errListener);
      const tokens  = new CommonTokenStream(lexer);
      const parser = new SHRMapParser(tokens);
      parser.removeErrorListeners();
      parser.addErrorListener(errListener);
      parser.buildParseTrees = true;
      const tree = parser.doc();
      const walker = new ParseTreeWalker();
      walker.walk(this, tree);
    } finally {
      logger.debug('Done importing mapping file');
      this.logger = lastLogger;
    }
  }

  enterDoc(ctx) {
    // Process the namespace
    this._currentNs = ctx.docHeader().namespace().getText();

    // Process the target
    this._currentTargetSpec = ctx.targetStatement().simpleName().getText();

    // Process the version
    const version = ctx.docHeader().version();
    const major = parseInt(version.WHOLE_NUMBER()[0], 10);
    const minor = parseInt(version.WHOLE_NUMBER()[1], 10);
    this._currentGrammarVersion = new Version(major, minor);

    const info = {
      shrId: this._currentNs,
      targetSpec: this._currentTargetSpec,
      version: this._currentGrammarVersion.toString()
    };
    logger.debug(info, 'Start importing namespace mapping');
  }

  exitDoc(ctx) {
    // clear current namespace, target spec, and grammar version
    const info = {
      shrId: this._currentNs,
      targetSpec: this._currentTargetSpec,
      version: this._currentGrammarVersion.toString()
    };
    logger.debug(info, 'Done importing namespace mapping');
    this._currentNs = '';
    this._currentTargetSpec = '';
    this._currentGrammarVersion = null;
  }

  enterMappingDef(ctx) {
    // NOTE: All validation happens outside of the listener (in the expander)
    const source = new Identifier(this._currentNs, ctx.mappingDefHeader().simpleName().getText());
    let target;
    if (ctx.mappingDefHeader().TARGET_PHRASE()) {
      target = ctx.mappingDefHeader().TARGET_PHRASE().getText().trim();
    }
    this._currentDef = new ElementMapping(source, this._currentTargetSpec, target);
    this._currentDef.grammarVersion = this._currentGrammarVersion;

    // Setup a child logger to associate logs with the current element mapping
    const lastLogger = logger;
    logger = logger.child({ shrId: source.fqn, target: target });
    logger.parent = lastLogger;
    logger.debug('Start importing element mapping');
  }

  exitMappingDef(ctx) {
    try {
      this.pushCurrentDefinition();
    } finally {
      logger.debug('Done importing element mapping');
      logger = logger.parent;
    }
  }

  enterFieldMapping(ctx) {
    const sourcePath = this.buildSourcePath(ctx);
    const target = ctx.TARGET_PHRASE().getText().trim();
    this._currentDef.addFieldMappingRule(sourcePath, target);
  }

  enterCardMapping(ctx) {
    const target = ctx.TARGET_WORD().getText().trim();
    const cardinality = this.processCardinality(ctx.count());
    this._currentDef.addCardinalityMappingRule(target, cardinality);
  }

  enterFixedMapping(ctx) {
    const target = ctx.TARGET_WORD_2().getText().trim();
    const value = ctx.TARGET_PHRASE_2().getText().substr(3); // substr to remove leading "to "
    this._currentDef.addFixedValueMappingRule(target, value);
  }

  buildSourcePath(fmCtx) {
    const sourcePath = [];
    let c = fmCtx;
    for (const part of c.source().sourcePart()) {
      for (const word of part.sourceWord()) {
        if (word.simpleOrFQName() || word.specialWord()) {
          const idText = word.simpleOrFQName() ? word.simpleOrFQName().getText() : word.specialWord().getText();
          sourcePath.push(this.resolveToIdentifier(idText));
        } else if (word.primitive()) {
          sourcePath.push(new PrimitiveIdentifier(word.primitive().getText()));
        } else if (word.tbd()){
          if (word.tbd().STRING()) {
            sourcePath.push(new TBD(stripDelimitersFromToken(word.tbd().STRING())));
          } else {
            sourcePath.push(new TBD());
          }
        } else {
          //11005 , 'Error parsing source path: ${path1}' , 'Invalid path to definitions. Double check path.', 'errorNumber'
          logger.error({path1 : c.source().getText() }, '11005' );
        }
      }
    }
    return sourcePath;
  }

  processCardinality(ctx) {
    const cards = ctx.WHOLE_NUMBER();
    const min = parseInt(cards[0].getText(), 10);
    var max;
    if (cards.length == 2) {
      max = parseInt(cards[1].getText(), 10);
    }
    return new Cardinality(min, max);
  }

  resolveToIdentifier(ref) {
    const lastDot = ref.lastIndexOf('.');
    if (lastDot != -1) {
      const ns = ref.substr(0, lastDot);
      const name = ref.substr(lastDot+1);
      return new Identifier(ns, name);
    }

    // No specified namespace -- if it's a special word (e.g. _Value), or primitive, make it so.
    if (ref.startsWith('_')) {
      return new Identifier('', ref);
    } else if (ref === 'Entry' || ref === 'Value') {
      // "Fix" the legacy keyword to the new _-based keyword
      return new Identifier('', `_${ref}`);
    } else if (PRIMITIVES.includes(ref)) {
      return new PrimitiveIdentifier(ref);
    }

    // We'll resolve the namespace later
    return new Identifier(null, ref);
  }

  pushCurrentDefinition() {
    this._specs.maps.add(this._currentDef);
    this._currentDef = null;
  }

  specifications() {
    return this._specs;
  }
}

function stripDelimitersFromToken(tkn) {
  const str = tkn.getText();
  // TODO: Also fix escaped double-quotes, but right now, the parser seems to be screwing those up.
  return str.substr(1,str.length -2);
}

module.exports = {MappingImporter, setLogger};