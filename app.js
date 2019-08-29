const fs = require('fs-extra');
const path = require('path');
const mkdirp = require('mkdirp');
const bunyan = require('bunyan');
const program = require('commander');
const chalk = require('chalk');
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
  .option('-m, --log-mode <mode>', 'the console log mode <normal,json,off>', /^(normal|json|off)$/i, 'normal')
  .option('-s, --skip <feature>', 'skip an export feature <fhir,cimcore,json-schema,model-doc,data-dict,all>', collect, [])
  .option('-o, --out <out>', `the path to the output folder`, path.join('.', 'out'))
  .option('-c, --config <config>', 'the name of the config file', 'config.json')
  .option('-d, --deduplicate', 'do not show duplicate error messages (default: false)')
  .option('-j, --export-es6', 'export ES6 JavaScript classes (experimental, default: false)')
  .option('-i, --import-cimcore', 'import CIMCORE files instead of CIMPL (default: false)')
  .option('-n, --clean', 'Save archive of old output directory and perform clean build (default: false)')
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

const showDuplicateErrors = !program.deduplicate;
const importCimcore = program.importCimcore;
const doES6 = program.exportEs6;
const clean = program.clean;

// Archive old output directory if it exists
if (clean && fs.existsSync(program.out)) {
  let archiveDir;
  let targetDir;
  let slashIndex = program.out.lastIndexOf('/') > 0 ? 
    program.out.lastIndexOf('/') : program.out.lastIndexOf('\\');
  // Figure out path to move directory into archive
  if (slashIndex > 0) {
    archiveDir = path.join(program.out.substring(0, slashIndex), 'archive');
    targetDir = path.join(archiveDir, program.out.substr(slashIndex));
  } else {
    archiveDir = 'archive';
    targetDir = path.join(archiveDir, program.out);
  }
  // If archive does not exist, create it
  if (!fs.existsSync(archiveDir)) {
    mkdirp.sync(archiveDir);
  }
  // Ensure no naming conflicts with previous archives
  let counter = 1;
  while(fs.existsSync(targetDir + '-' + counter)) { counter += 1; }
  fs.renameSync(program.out, targetDir + '-' + counter);
}

// Create the output folder if necessary
mkdirp.sync(program.out);

const errorFiles = [shrTI.errorFilePath(), shrEx.errorFilePath(), shrFE.errorFilePath(), shrJDE.errorFilePath(),
  shrEE.errorFilePath(), shrJSE.errorFilePath(), path.join(__dirname, "errorMessages.txt")]

const PrettyPrintDuplexStreamJson = require('./PrettyPrintDuplexStreamJson');
const mdpStream = new PrettyPrintDuplexStreamJson(null, errorFiles, showDuplicateErrors, path.join(program.out, 'out.log'));

// Set up the logger streams
const [ll, lm] = [program.logLevel.toLowerCase(), program.logMode.toLowerCase()];
const streams = [];
if (lm == 'normal') {
  streams.push({ level: ll, stream: mdpStream });
  mdpStream.pipe(process.stdout);
} else if (lm == 'json') {
  streams.push({ level: ll, stream: process.stdout });
}
// Setup a ringbuffer for counting the number of errors at the end
const logCounter = new LogCounter();
streams.push({ level: 'warn', type: 'raw', stream: logCounter});
// Always do a full JSON log
const logger = bunyan.createLogger({
  name: 'shr',
  module: 'shr-cli',
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
// 05001, 'Starting CLI Import/Export',,
logger.info('05001');

let configSpecifications = shrTI.importConfigFromFilePath(input, program.config);
if (!configSpecifications) {
  process.exit(1);
}
let specifications;
let expSpecifications;
if (!importCimcore) {
  specifications = shrTI.importFromFilePath(input, configSpecifications);
  expSpecifications = shrEx.expand(specifications, shrFE);
} else {
  [configSpecifications, expSpecifications] = shrTI.importCIMCOREFromFilePath(input);
}


let filter = false;
if (configSpecifications.filterStrategy != null) {
  filter = configSpecifications.filterStrategy.filter;
  // 05009, 'Using filterStrategy in the configuration file is deprecated and should be done in content profile instead',,
  logger.warn('05009')
}
if (configSpecifications.implementationGuide && configSpecifications.implementationGuide.primarySelectionStrategy) {
  // 05010, 'Using primarySelectionStrategy in the configuration file is deprecated and should be done in content profile instead',,
  logger.warn('05010');
}
if (expSpecifications.contentProfiles.all.length > 0) {
  filter = true;
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
        // 15004, 'Unable to successfully serialize ${nameSpace} meta information into CIMCORE, failing with error ${errorText}', 'Unknown, 'errorNumber'
        logger.error({nameSpace: namespace, errorText: error.stack }, '15004' );
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
        // 15001, 'Unable to successfully serialize element ${identifierName} into CIMCORE, failing with error ${errorText}',  'Unknown, 'errorNumber'
        logger.error({identifierName: de.identifier.fqn, errorText: error.stack }, '15001');
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
        // 15002, 'Unable to successfully serialize value set ${valueSet} into CIMCORE, failing with error ${errorText}',  'Unknown, 'errorNumber'
        logger.error({valueSet:vs.identifier.fqn, errorText: error.stack}, '15002');
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
          // 15003, 'Unable to successfully serialize mapping ${mappingIdentifier} into CIMCORE, failing with error ${errorText}',   'Unknown, 'errorNumber'
          logger.error({mappingIdentifier:mapping.identifier.fqn, errorText:error.stack },'15003');
        }
      }
    }
  } catch (error) {
    // 15005, 'Failure in CIMCORE export. Aborting with error message: ${errorText}',  'Unknown, 'errorNumber'
    logger.fatal({errorText: error.stack},'15005');
    failedExports.push('CIMCORE');
  }
} else {
  // 05003, 'Skipping CIMCORE export',,
  logger.info('05003');
}

if (doDD) {
  try {
    const hierarchyPath = path.join(program.out, 'data-dictionary');
    shrDD.generateDDtoPath(expSpecifications, configSpecifications, hierarchyPath);
  } catch (error) {
    // 15006, 'Failure in data dictionary export. Aborting with error message: ${errorText}',  'Unknown, 'errorNumber'
    logger.fatal({ errorText: error.stack }, '15006');
    failedExports.push('shr-data-dict-export');
  }
} else {
  // 05004, 'Skipping Data Dictionary export',,
  logger.info('05004');
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
    // 15007, 'Failure in ES6 export. Aborting with error message: ${errorText}',  'Unknown, 'errorNumber'
    logger.fatal({ errorText: error.stack }, '15007');
    failedExports.push('shr-es6-export');
  }
} else {
  // 05005, 'Skipping ES6 export',,
  logger.info('05005');
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
    // 15008, 'Failure in FHIR export. Aborting with error message: ${errorText}',  'Unknown, 'errorNumber'
    logger.fatal({ errorText: error.stack }, '15008');
    failedExports.push('shr-fhir-export');
  }
} else {
  // 05006, 'Skipping FHIR export',,
  logger.info('05006');
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
    // 15009, 'Failure in JSON Schema export. Aborting with error message: ${errorText}',  'Unknown, 'errorNumber'
    logger.fatal({ errorText: error.stack }, '15009');
    failedExports.push('shr-json-schema-export');
  }
} else {
  // 05007, 'Skipping JSON Schema export',,
  logger.info('05007');
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
      // 15010, 'Failure in Model Doc export. Aborting with error message: ${errorText}',  'Unknown, 'errorNumber'
      logger.fatal({ errorText: error.stack }, '15010');
      failedExports.push('shr-model-doc');
    }
  } else {
    // 15011, 'CIMCORE is required for generating Model Doc. Skipping Model Docs export.', 'Do not skip CIMCORE if Model Doc should be generated', 'errorNumber'
    logger.fatal('15011');
    failedExports.push('shr-model-doc');
  }
} else {
  // 05008, 'Skipping Model Docs export',,
  logger.info('05008');
}
// 05002, 'Finished CLI Import/Export',,
logger.info('05002');

const ftlCounter = logCounter.fatal;
const errCounter = logCounter.error;
const wrnCounter = logCounter.warn;
let [errLabel, wrnLabel, ftlLabel] = ['errors', 'warnings', 'fatal errors'];
if (ftlCounter.count > 0) {
  ftlLabel = `fatal errors (${failedExports.join(', ')})`;
}
if (errCounter.count > 0) {
  errLabel = `errors (${errCounter.modules.join(', ')})`;
}
if (wrnCounter.count > 0) {
  wrnLabel = `warnings (${wrnCounter.modules.join(', ')})`;
}

// Get the elapsed time
const hrend = process.hrtime(hrstart);
console.log('------------------------------------------------------------');
console.log('Elapsed time: %d.%ds', hrend[0], Math.floor(hrend[1]/1000000));
if (ftlCounter.count > 0) console.log(chalk.redBright('%d %s'), ftlCounter.count, ftlLabel);
console.log(chalk.bold.redBright('%d %s'), errCounter.count, errLabel);
console.log(chalk.bold.yellowBright('%d %s'), wrnCounter.count, wrnLabel);
console.log('------------------------------------------------------------');
