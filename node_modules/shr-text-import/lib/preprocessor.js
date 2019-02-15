const bunyan = require('bunyan');
const {FileStream, CommonTokenStream} = require('antlr4/index');
const {SHRDataElementLexer} = require('./parsers/SHRDataElementLexer');
const {SHRDataElementParser} = require('./parsers/SHRDataElementParser');
const {SHRDataElementParserVisitor} = require('./parsers/SHRDataElementParserVisitor');
const {Version} = require('shr-models');

const VERSION = new Version(5, 3, 0);
const GRAMMAR_VERSION = new Version(5, 1, 0);

var rootLogger = bunyan.createLogger({name: 'shr-text-import'});
var logger = rootLogger;

function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

class Preprocessor extends SHRDataElementParserVisitor {
  constructor(configuration=[]) {
    super();
    // The preprocessed data
    this._data = new PreprocessedData();
    this._config = configuration;
  }

  get data() { return this._data; }

  preprocessConfig(defaultsFile, file) {

    var defaults = JSON.parse(defaultsFile);
    var configFile = {};

    if (file != null) {
      try { configFile = JSON.parse(new FileStream(file)); }
      catch (e) {
        //11006 , 'Invalid config file. Should be valid JSON dictionary' , 'Make sure your 'config.json' file is using a valid format for JSON.', 'errorNumber'
        logger.error('11006');
        return defaults;
      }
    } else {
      logger.warn(`No project configuration file found, currently using default EXAMPLE identifiers. Auto-generating a proper 'config.json' in your specifications folder. ERROR_CODE:01001`);
      return defaults;
    }

    //Fill in config dictionary with default values, if necessary (with some special logic)
    for (var key in defaults) {
      if (configFile[key] == null) {
        if (key === 'fhirURL' && configFile['projectURL'] != null) { //special logic
          configFile['fhirURL'] = `${configFile['projectURL']}/fhir`;
          continue;
        }

        //handle old ig fields
        // TODO remove this handling once we fully deprecate the old ig fields
        if (key === 'implementationGuide') {
          let igObject = {};
          if (configFile['igIndexContent'] != null) {
            logger.warn(`Configuration file 'igIndexContent' field will be deprecated. Use 'implementationGuide.indexContent' instead.`);
            igObject.indexContent = configFile['igIndexContent'];
          } else { // since we use continue at end of old ig field conditional, we need to handle the case of implementationGuide.indexContent separately
            logger.warn('Configuration file missing key: implementationGuide.indexContent, using default key: %s instead. ERROR_CODE:01002', defaults['implementationGuide']['indexContent']);
            igObject.indexContent = defaults['implementationGuide']['indexContent'];
          }

          if (configFile['igLogicalModels'] != null) {
            logger.warn(`Configuration file 'igLogicalModels' field will be deprecated. Use 'implementationGuide.includeLogicalModels' instead.`);
            igObject.includeLogicalModels = configFile['igLogicalModels'];
          }

          if (configFile['igModelDoc'] != null) {
            logger.warn(`Configuration file 'igModelDoc' field will be deprecated. Use 'implementationGuide.includeModelDoc' instead.`);
            igObject.includeModelDoc = configFile['igModelDoc'];
          }

          if (configFile['igPrimarySelectionStrategy'] != null) {
            logger.warn(`Configuration file 'igPrimarySelectionStrategy' field will be deprecated. Use 'implementationGuide.primarySelectionStrategy' instead.`);
            igObject.primarySelectionStrategy = configFile['igPrimarySelectionStrategy'];
          }

          configFile['implementationGuide'] = igObject;
          continue;
        }

        configFile[key] = defaults[key];
        logger.warn('Configuration file missing key: %s, using default key: %s instead. ERROR_CODE:01002', key, JSON.stringify(defaults[key]));
      } else {
        //Additional compatibility logic
        if ( (key === 'projectURL' || key === 'fhirURL' ) && configFile[key].endsWith('/')) {
          configFile[key] = configFile[key].slice(0, -1);
        }
      }
    }

    this._config = configFile;

    return configFile;
  }

  preprocessFile(file) {
    // Setup a child logger to associate logs with the current file
    const lastLogger = logger;
    logger = rootLogger.child({ file: file });
    logger.debug('Start preprocessing data elements file');
    try {
      const chars = new FileStream(file);
      const lexer = new SHRDataElementLexer(chars);
      lexer.removeErrorListeners(); // Only log errors during the import
      const tokens  = new CommonTokenStream(lexer);
      const parser = new SHRDataElementParser(tokens);
      parser.removeErrorListeners(); // Only log errors during the import
      parser.buildParseTrees = true;
      const tree = parser.doc();
      this.visitDoc(tree);
    } finally {
      logger.debug('Done preprocessing data elements file');
      this.logger = lastLogger;
    }
  }

  visitDoc(ctx) {
    if (!this.checkVersion(ctx.docHeader().version())) {
      return;
    }
    const ns = ctx.docHeader().namespace().getText();
    logger.debug({shrId: ns}, 'Start preprocessing namespace');

    try {
      if (ctx.pathDefs()) {
        const removeTrailingSlash = function(url) {
          while (url.endsWith('/')) { url = url.substring(0, url.length - 1); }
          return url;
        };
        for (const def of ctx.pathDefs().pathDef()) {
          const name = def.ALL_CAPS().getText();
          let url = removeTrailingSlash(def.URL().getText());
          while (url.endsWith('/')) {
            url = url.substring(0, url.length - 1);
          }
          this._data.registerPath(ns, name, url);
        }
      }
      if (ctx.vocabularyDefs()) {
        for (const def of ctx.vocabularyDefs().vocabularyDef()) {
          const name = def.ALL_CAPS().getText();
          var url;
          if (def.URL()) {
            url = def.URL().getText();
          } else if (def.URN_OID()) {
            url = def.URN_OID().getText();
          } else if (def.URN()) {
            url = def.URN().getText();
          }
          this._data.registerVocabulary(ns, name, url);
        }
      }
      for (const def of ctx.dataDefs().dataDef()) {
        if (def.entryDef()) {
          const name = def.entryDef().entryHeader().simpleName().getText();
          this._data.registerDefinition(ns, name);
        } else if (def.elementDef()) {
          const name = def.elementDef().elementHeader().simpleName().getText();
          this._data.registerDefinition(ns, name);
        }
      }
    } finally {
      logger.debug({shrId: ns}, 'Done preprocessing namespace');
    }
  }

  checkVersion(version) {
    const major = parseInt(version.WHOLE_NUMBER()[0], 10);
    const minor = parseInt(version.WHOLE_NUMBER()[2], 10);
    if (GRAMMAR_VERSION.major != major || GRAMMAR_VERSION.minor < minor) {
      //11007 , 'Unsupported grammar version: ${versionMajor}.${versionMinor} ' , 'Grammar Version for file must be 5.0 (or above)', 'errorNumber'
      logger.error({versionMajor : major, versionMinor: minor}, '11007' );
      return false;
    }
    return true;
  }
}

class PreprocessedData {
  constructor() {
    this._paths = {}; //map[namespace]map[name]url
    this._vocabularies = {}; // map[namespace]map[name]url
    this._definitions = {}; // map[namespace]map[name]boolean
  }

  registerPath(namespace, name, url) {
    let ns = this._paths[namespace];
    if (typeof ns == 'undefined') {
      ns = {};
      this._paths[namespace] = ns;
    }
    ns[name] = url;
  }

  registerVocabulary(namespace, name, url) {
    let ns = this._vocabularies[namespace];
    if (typeof ns == 'undefined') {
      ns = {};
      this._vocabularies[namespace] = ns;
    }
    ns[name] = url;
  }

  registerDefinition(namespace, name) {
    let ns = this._definitions[namespace];
    if (typeof ns == 'undefined') {
      ns = {};
      this._definitions[namespace] = ns;
    }
    ns[name] = true;
  }

  resolvePath(name, ...namespace) {
    // First ensure namespaces were passed in
    if (namespace.length == 0) {
      return { error: `Cannot resolve path without namespaces. ERROR_CODE:11017` };
    }

    // Special handling for default paths
    if (name == 'default') {
      const ns = namespace[0];
      if (this._paths[ns] && this._paths[ns]['default']) {
        return { url: this._paths[ns]['default'] };
      }
      // Didn't find default, so infer default from namespace
      const parts = ns.split('.');
      return this._config.projectURL + '/' + parts.join('/') + '/vs';
    }

    // Attempt to resolve specific path
    const result = {};
    const foundNamespaces = [];
    let conflict = false;
    for (const ns of namespace) {
      if (this._paths[ns] && this._paths[ns][name]) {
        if (!result.hasOwnProperty('url')) {
          result['url'] = this._paths[ns][name];
        } else if (result.url != this._paths[ns][name]) {
          conflict = true;
        }
        foundNamespaces.push(ns);
      }
    }
    if (!result.hasOwnProperty('url')) {
      result['error'] = `Failed to resolve path for ${name}. ERROR_CODE:11018`;
    } else if (conflict) {
      result['error'] = `Found conflicting path for ${name} in multiple namespaces: ${foundNamespaces}. ERROR_CODE:11019`;
    }
    return result;
  }

  resolveVocabulary(name, ...namespace) {
    const result = {};
    const foundNamespaces = [];
    let conflict = false;
    for (const ns of namespace) {
      if (this._vocabularies[ns] && this._vocabularies[ns][name]) {
        if (!result.hasOwnProperty('url')) {
          result['url'] = this._vocabularies[ns][name];
        } else if (result.url != this._vocabularies[ns][name]) {
          conflict = true;
        }
        foundNamespaces.push(ns);
      }
    }
    if (!result.hasOwnProperty('url')) {
      result['error'] = `Failed to resolve vocabulary for ${name}. ERROR_CODE:11020`;
    } else if (conflict) {
      result['error'] = `Found conflicting vocabularies for ${name} in multiple namespaces: ${foundNamespaces}. ERROR_CODE:11021`;
    }
    return result;
  }

  resolveDefinition(name, ...namespace) {
    const result = {};
    const foundNamespaces = [];
    for (const ns of namespace) {
      if (this._definitions[ns] && this._definitions[ns][name]) {
        if (!result.hasOwnProperty('namespace')) {
          result['namespace'] = ns;
        }
        foundNamespaces.push(ns);
      }
    }
    if (!result.hasOwnProperty('namespace')) {
      result['error'] = `Failed to resolve definition for ${name}. ERROR_CODE:11013`;
    } else if (foundNamespaces.length > 1) {
      result['error'] = `Found conflicting definitions for ${name} in multiple namespaces: ${foundNamespaces}. ERROR_CODE:11022`;
    }
    return result;
  }
}

module.exports = { Preprocessor, PreprocessedData, VERSION, GRAMMAR_VERSION, setLogger };
