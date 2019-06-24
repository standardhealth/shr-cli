const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');
const bunyan = require('bunyan');
const program = require('commander');
const bps = require('@ojolabs/bunyan-prettystream');
const { sanityCheckModules } = require('shr-models');
const shrTI = require('shr-text-import');
const shrEx = require('shr-expand');
const shrJSE = require('shr-json-schema-export');
const shrEE = require('shr-es6-export');
const shrFE = require('shr-fhir-export');
const shrJDE = require('shr-json-javadoc');
const shrDD = require('shr-data-dict-export');
const LogCounter = require('./logcounter');
const SpecificationsFilter = require('./filter');

/* eslint-disable no-console */

sanityCheckModules({shrTI, shrEx, shrJSE, shrEE, shrFE });

// Record the time so we can print elapsed time
const hrstart = process.hrtime();

function collect(val, list) {
  list.push(val);
  return list;
}

let input;
program
  .usage('<path-to-shr-defs> [options]')
  .option('-l, --log-level <level>', 'the console log level <fatal,error,warn,info,debug,trace>', /^(fatal|error|warn|info|debug|trace)$/i, 'info')
  .option('-m, --log-mode <mode>', 'the console log mode <short,long,json,off>', /^(short|long|json|off)$/i, 'short')
  .option('-s, --skip <feature>', 'skip an export feature <fhir,cimcore,json-schema,model-doc,data-dict,all>', collect, [])
  .option('-o, --out <out>', `the path to the output folder`, path.join('.', 'out'))
  .option('-c, --config <config>', 'the name of the config file', 'config.json')
  .option('-d, --duplicate', 'show duplicate error messages (default: false)')
  .option('-j, --export-es6', 'export ES6 JavaScript classes (experimental, default: false)')
  .option('-i, --import-cimcore', 'import CIMCORE files instead of CIMPL (default: false)')
  .arguments('<path-to-shr-defs>')
  .action(function (pathToShrDefs) {
    input = pathToShrDefs;
  })
  .parse(process.argv);

// Check that input folder is specified
if (typeof input === 'undefined') {
  console.error('\x1b[31m','Missing path to SHR definition folder or file','\x1b[0m');
  program.help();
}
// Process the skip flags
const doFHIR = program.skip.every(a => a.toLowerCase() != 'fhir' && a.toLowerCase() != 'all');
const doJSONSchema = program.skip.every(a => a.toLowerCase() != 'json-schema' && a.toLowerCase() != 'all');
const doModelDoc = program.skip.every(a => a.toLowerCase() != 'model-doc' && a.toLowerCase() != 'all');
const doCIMCORE = program.skip.every(a => a.toLowerCase() != 'cimcore' && a.toLowerCase() != 'all');
const doDD = program.skip.every(a => a.toLowerCase() != 'data-dict' && a.toLowerCase() != 'all');

// Process the de-duplicate error flag

const showDuplicateErrors = program.duplicate;
const importCimcore = program.importCimcore;
const doES6 = program.exportEs6;

// Create the output folder if necessary
mkdirp.sync(program.out);

const PrettyPrintDuplexStreamJson = require('./PrettyPrintDuplexStreamJson');
const mdpStream = new PrettyPrintDuplexStreamJson();

//invoke the regex stream processor
const PrettyPrintDuplexStream = require('./PrettyPrintDuplexStream');
const mdpStreamTxt = new PrettyPrintDuplexStream();

// Set up the logger streams
const [ll, lm] = [program.logLevel.toLowerCase(), program.logMode.toLowerCase()];
const streams = [];
if (lm == 'short' || lm == 'long') {
  const prettyStdOut = new bps({mode: lm});
  // use the regex stream processor on the text stream
  prettyStdOut.pipe(mdpStreamTxt);
  mdpStreamTxt.pipe(process.stdout);
  streams.push({ level: ll, type: 'raw', stream: prettyStdOut});
} else if (lm == 'json') {
  const printRawJson = false;
  if (printRawJson) {
    streams.push({ level: ll, stream: process.stdout });
  }
  streams.push({ level: ll, stream: mdpStream });
  mdpStream.pipe(process.stdout);
}
// Setup a ringbuffer for counting the number of errors at the end
const logCounter = new LogCounter();
streams.push({ level: 'warn', type: 'raw', stream: logCounter});
// Always do a full JSON log
streams.push({ level: 'trace', path: path.join(program.out, 'out.log') });
const logger = bunyan.createLogger({
  name: 'shr',
  streams: streams
});

shrTI.setLogger(logger.child({module: 'shr-text-input'}));
shrEx.setLogger(logger.child({module: 'shr-expand'}));
if (doFHIR) {
  shrFE.setLogger(logger.child({module: 'shr-fhir-export'}));
}
if (doJSONSchema) {
  shrJSE.setLogger(logger.child({module: 'shr-json-schema-export'}));
}
if (doModelDoc) {
  shrJDE.setLogger(logger.child({ module: 'shr-json-javadoc' }));
}
if (doES6) {
  shrEE.setLogger(logger.child({ module: 'shr-es6-export'}));
}
if (doDD) {
  shrDD.setLogger(logger.child({ module: 'shr-data-dict-export'}));
}

// Go!
logger.info('Starting CLI Import/Export');
let configSpecifications = shrTI.importConfigFromFilePath(input, program.config);
if (!configSpecifications) {
  process.exit(1);
}
configSpecifications.showDuplicateErrors = showDuplicateErrors;
let specifications;
let expSpecifications;
if (!importCimcore) {
  specifications = shrTI.importFromFilePath(input, configSpecifications);
  expSpecifications = shrEx.expand(specifications, shrFE);
} else {
  [configSpecifications, expSpecifications] = shrTI.importCIMCOREFromFilePath(input);
  configSpecifications.showDuplicateErrors = showDuplicateErrors;
}


let filter = false;
if (configSpecifications.filterStrategy != null) {
  filter = configSpecifications.filterStrategy.filter;
}

if (filter) {
  const specificationsFilter = new SpecificationsFilter(specifications, expSpecifications, configSpecifications);
  [specifications, expSpecifications] = specificationsFilter.filter();
}

const failedExports = [];

let cimcoreSpecifications;
if (doCIMCORE) {
  try {
    cimcoreSpecifications = {
      'dataElements': [],
      'valueSets': [],
      'mappings': [],
      'namespaces': {},
    //also includes 'projectInfo'
    };
    const baseCIMCOREPath = path.join(program.out, 'cimcore');

    //meta project file
    let versionInfo = {
      'CIMPL_version': '5.6.0',
      'CIMCORE_version': '1.1'
    };

    let projectMetaOutput = Object.assign({ 'fileType': 'ProjectInfo' }, configSpecifications, versionInfo); //project meta information
    cimcoreSpecifications['projectInfo'] = projectMetaOutput;

    const hierarchyPath = path.join(program.out, 'cimcore', 'project.json');
    mkdirp.sync(path.dirname(hierarchyPath));
    fs.writeFileSync(hierarchyPath, JSON.stringify(projectMetaOutput, null, '  '));

    if (configSpecifications.implementationGuide && configSpecifications.implementationGuide.indexContent) {
      // Need to copy over the index file(s) to the cimcore output as well
      const indexPath = path.join(input, configSpecifications.implementationGuide.indexContent);
      if (fs.existsSync(indexPath)) {
        fs.copySync(indexPath, path.join(program.out, 'cimcore', path.basename(indexPath)));
      }
    }

    //meta namespace files
    for (const ns of expSpecifications.namespaces.all) { //namespace files
      let namespace = ns.namespace.replace(/\./, '-');
      let out = Object.assign({ 'fileType': 'Namespace' }, ns.toJSON());
      cimcoreSpecifications.namespaces[ns.namespace] = out;

      const hierarchyPath = path.join(baseCIMCOREPath, namespace, `${namespace}.json`);
      try {
        mkdirp.sync(path.dirname(hierarchyPath));
        fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
      } catch (error) {
        //logger.error('Unable to successfully serialize namespace meta information %s into CIMCORE, failing with error "%s". ERROR_CODE:15004', namespace, error); \
        logger.error({nameSpace: namespace, errorText: error }, '15004' );
      }
    }

    //data elements
    for (const de of expSpecifications.dataElements.all) {
      let namespace = de.identifier.namespace.replace(/\./, '-');
      let fqn = de.identifier.fqn.replace(/\./g, '-');
      let out = Object.assign({ 'fileType': 'DataElement' }, de.toJSON());
      cimcoreSpecifications.dataElements.push(out);

      const hierarchyPath = path.join(baseCIMCOREPath, namespace, `${fqn}.json`);
      try {
        mkdirp.sync(path.dirname(hierarchyPath));
        fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
      } catch (error) {
        //logger.error('Unable to successfully serialize element %s into CIMCORE, failing with error "%s". ERROR_CODE:15001', de.identifier.fqn, error);
        logger.error({identifierName: de.identifier.fqn, errorText: error }, '15001');
      }
    }

    //valuesets
    for (const vs of expSpecifications.valueSets.all) {
      let namespace = vs.identifier.namespace.replace(/\./, '-');
      let name = vs.identifier.name.replace(/\./g, '-');
      let out = Object.assign({ 'fileType': 'ValueSet' }, vs.toJSON());
      cimcoreSpecifications.valueSets.push(out);

      const hierarchyPath = path.join(baseCIMCOREPath, namespace, 'valuesets', `${name}.json`);
      try {
        mkdirp.sync(path.dirname(hierarchyPath));
        fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
      } catch (error) {
        //logger.error('Unable to successfully serialize value set %s into CIMCORE, failing with error "%s". ERROR_CODE:15002', vs.identifier.fqn, error);
        logger.error({valueSet:vs.identifier.fqn, errorText: error}, '15002');
      }
    }

    //mappings
    for (const target of expSpecifications.maps.targets) {
      for (const mapping of expSpecifications.maps.getTargetMapSpecifications(target).all) {
        let namespace = mapping.identifier.namespace.replace(/\./, '-');
        let name = mapping.identifier.name;
        let out = Object.assign({ 'fileType': 'Mapping' }, mapping.toJSON());
        cimcoreSpecifications.mappings.push(out);

        const hierarchyPath = path.join(baseCIMCOREPath, namespace, 'mappings', target, `${name}-mapping.json`);
        try {
          mkdirp.sync(path.dirname(hierarchyPath));
          fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
        } catch (error) {
          //logger.error('Unable to successfully serialize mapping %s into CIMCORE, failing with error "%s". ERROR_CODE:15003', mapping.identifier.fqn, error);
          logger.error({mappingIdentifier:mapping.identifier.fqn, errorText:error },'15003');
        }
      }
    }
  } catch (error) {
    //logger.fatal('Failure in CIMCORE export. Aborting with error message: %s', error);
    logger.fatal({errorText: JSON.stringify(error) },'15100');
    failedExports.push('CIMCORE');
  }
} else {
  logger.info('Skipping CIMCORE export');
}

if (doDD) {
  try {
    const hierarchyPath = path.join(program.out, 'data-dictionary');
    shrDD.generateDDtoPath(expSpecifications, configSpecifications, hierarchyPath);
  } catch (error) {
    logger.fatal('Failure in Data Dictionary export. Aborting with error message: %s', error);
    failedExports.push('shr-data-dict-export');
  }
} else {
  logger.info('Skipping Data Dictionary export');
}

let fhirResults = null;
if (doES6 || doFHIR){
  fhirResults = shrFE.exportToFHIR(expSpecifications, configSpecifications);
}

if (doES6) {
  try {
    const es6Results = shrEE.exportToES6(expSpecifications, fhirResults);
    const es6Path = path.join(program.out, 'es6');
    const handleNS = (obj, fpath) => {
      mkdirp.sync(fpath);
      for (const key of Object.keys(obj)) {
        if (key.endsWith('.js')) {
          fs.writeFileSync(path.join(fpath, key), obj[key]);
        } else {
          handleNS(obj[key], path.join(fpath, key));
        }
      }
    };
    handleNS(es6Results, es6Path);
  } catch (error) {
    logger.fatal('Failure in ES6 export. Aborting with error message: %s', error);
    failedExports.push('shr-es6-export');
  }
} else {
  logger.info('Skipping ES6 export');
}


if (doFHIR) {
  try {
    const baseFHIRPath = path.join(program.out, 'fhir');
    const baseFHIRProfilesPath = path.join(baseFHIRPath, 'profiles');
    mkdirp.sync(baseFHIRProfilesPath);
    for (const profile of fhirResults.profiles) {
      fs.writeFileSync(path.join(baseFHIRProfilesPath, `${profile.id}.json`), JSON.stringify(profile, null, 2));
    }
    const baseFHIRExtensionsPath = path.join(baseFHIRPath, 'extensions');
    mkdirp.sync(baseFHIRExtensionsPath);
    for (const extension of fhirResults.extensions) {
      fs.writeFileSync(path.join(baseFHIRExtensionsPath, `${extension.id}.json`), JSON.stringify(extension, null, 2));
    }
    const baseFHIRCodeSystemsPath = path.join(baseFHIRPath, 'codeSystems');
    mkdirp.sync(baseFHIRCodeSystemsPath);
    for (const codeSystem of fhirResults.codeSystems) {
      fs.writeFileSync(path.join(baseFHIRCodeSystemsPath, `${codeSystem.id}.json`), JSON.stringify(codeSystem, null, 2));
    }
    const baseFHIRValueSetsPath = path.join(baseFHIRPath, 'valueSets');
    mkdirp.sync(baseFHIRValueSetsPath);
    for (const valueSet of fhirResults.valueSets) {
      fs.writeFileSync(path.join(baseFHIRValueSetsPath, `${valueSet.id}.json`), JSON.stringify(valueSet, null, 2));
    }
    const baseFHIRModelsPath = path.join(baseFHIRPath, 'logical');
    mkdirp.sync(baseFHIRModelsPath);
    for (const model of fhirResults.models) {
      fs.writeFileSync(path.join(baseFHIRModelsPath, `${model.id}.json`), JSON.stringify(model, null, 2));
    }
    fs.writeFileSync(path.join(baseFHIRPath, `shr_qa.html`), fhirResults.qaHTML);
    shrFE.exportIG(expSpecifications, fhirResults, path.join(baseFHIRPath, 'guide'), configSpecifications, input);
  } catch (error) {
    logger.fatal('Failure in FHIR export. Aborting with error message: %s', error);
    failedExports.push('shr-fhir-export');
  }
} else {
  logger.info('Skipping FHIR export');
}

if (doJSONSchema) {
  try {
    let typeURL = configSpecifications.entryTypeURL;
    if (!typeURL) {
      typeURL = 'http://nowhere.invalid/';
    }
    const baseSchemaNamespace = 'https://standardhealthrecord.org/schema';
    const baseSchemaNamespaceWithSlash = baseSchemaNamespace + '/';
    const jsonSchemaResults = shrJSE.exportToJSONSchema(expSpecifications, baseSchemaNamespace, typeURL);
    const jsonSchemaPath = path.join(program.out, 'json-schema');
    mkdirp.sync(jsonSchemaPath);
    for (const schemaId in jsonSchemaResults) {
      const filename = `${schemaId.substring(baseSchemaNamespaceWithSlash.length).replace(/\//g, '.')}.schema.json`;
      fs.writeFileSync(path.join(jsonSchemaPath, filename), JSON.stringify(jsonSchemaResults[schemaId], null, '  '));
    }

  // Uncomment the following to get expanded schemas
  //   shrJSE.setLogger(logger.child({module: 'shr-json-schema-export-expanded'}));
  //   const baseSchemaExpandedNamespace = 'https://standardhealthrecord.org/schema-expanded';
  //   const baseSchemaExpandedNamespaceWithSlash = baseSchemaExpandedNamespace + '/';
  //   const jsonSchemaExpandedResults = shrJSE.exportToJSONSchema(expSpecifications, baseSchemaExpandedNamespace, typeURL, true);
  //   const jsonSchemaExpandedPath = path.join(program.out, 'json-schema-expanded');
  //   mkdirp.sync(jsonSchemaExpandedPath);
  //   for (const schemaId in jsonSchemaExpandedResults) {
  //     const filename = `${schemaId.substring(baseSchemaExpandedNamespaceWithSlash.length).replace(/\//g, '.')}.schema.json`;
  //     fs.writeFileSync(path.join(jsonSchemaExpandedPath, filename), JSON.stringify(jsonSchemaExpandedResults[schemaId], null, '  '));
  //   }

  } catch (error) {
    logger.fatal('Failure in JSON Schema export. Aborting with error message: %s', error);
    failedExports.push('shr-json-schema-export');
  }
} else {
  logger.info('Skipping JSON Schema export');
}

if (doModelDoc) {
  if (doCIMCORE) {
    try {
      const hierarchyPath = path.join(program.out, 'modeldoc');
      const fhirPath = path.join(program.out, 'fhir', 'guide', 'pages', 'modeldoc');
      const javadocResults = shrJDE.compileJavadoc(cimcoreSpecifications, hierarchyPath);
      shrJDE.exportToPath(javadocResults, hierarchyPath);
      if (doFHIR && configSpecifications.implementationGuide.includeModelDoc == true) {
        const igJavadocResults = shrJDE.compileJavadoc(cimcoreSpecifications, hierarchyPath, true);
        shrJDE.exportToPath(igJavadocResults, fhirPath);
      }
    } catch (error) {
      logger.fatal('Failure in Model Doc export. Aborting with error message: %s', error);
      failedExports.push('shr-model-doc');
    }
  } else {
    logger.fatal('CIMCORE is required for generating Model Doc. Skipping Model Docs export.');
    failedExports.push('shr-model-doc');
  }
} else {
  logger.info('Skipping Model Docs export');
}

logger.info('Finished CLI Import/Export');

const ftlCounter = logCounter.fatal;
const errCounter = logCounter.error;
const wrnCounter = logCounter.warn;
let [errColor, errLabel, wrnColor, wrnLabel, resetColor, ftlColor, ftlLabel] = ['\x1b[32m', 'errors', '\x1b[32m', 'warnings', '\x1b[0m', '\x1b[31m', 'fatal errors'];
if (ftlCounter.count > 0) {
  // logger.fatal('');
  ftlLabel = `fatal errors (${failedExports.join(', ')})`;
}
if (errCounter.count > 0) {
  errColor = '\x1b[31m'; // red
  errLabel = `errors (${errCounter.modules.join(', ')})`;
}
if (wrnCounter.count > 0) {
  wrnColor = '\x1b[35m'; // magenta
  wrnLabel = `warnings (${wrnCounter.modules.join(', ')})`;
}

// Get the elapsed time
const hrend = process.hrtime(hrstart);
console.log('------------------------------------------------------------');
console.log('Elapsed time: %d.%ds', hrend[0], Math.floor(hrend[1]/1000000));
if (ftlCounter.count > 0) console.log('%s%d %s%s', ftlColor, ftlCounter.count, ftlLabel, resetColor);
console.log('%s%d %s%s', errColor, errCounter.count, errLabel, resetColor);
console.log('%s%d %s%s', wrnColor, wrnCounter.count, wrnLabel, resetColor);
console.log('------------------------------------------------------------');
