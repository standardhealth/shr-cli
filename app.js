const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const bunyan = require('bunyan');
const program = require('commander');
const bps = require('@ojolabs/bunyan-prettystream');
const { sanityCheckModules } = require('shr-models');
const shrTI = require('shr-text-import');
const shrEx = require('shr-expand');
const shrJE = require('shr-json-export');
const shrJSE = require('shr-json-schema-export');
const shrEE = require('shr-es6-export');
const shrFE = require('shr-fhir-export');
const shrJDE = require('shr-json-javadoc');
const LogCounter = require('./logcounter');

/* eslint-disable no-console */

sanityCheckModules({shrTI, shrEx, shrJE, shrJSE, shrEE, shrFE });

// Record the time so we can print elapsed time
const hrstart = process.hrtime();

function collect(val, list) {
  list.push(val);
  return list;
}

let input;
program
  .usage('<path-to-shr-defs> [options]')
  .option('-l, --log-level <level>', 'the console log level <fatal,error,warn,info,debug,trace> (default: info)', /^(fatal|error|warn|info|debug|trace)$/i, 'info')
  .option('-m, --log-mode <mode>', 'the console log mode <short,long,json,off> (default: short)', /^(short|long|json|off)$/i, 'short')
  .option('-s, --skip <feature>', 'skip an export feature <fhir,json,cimcore,json-schema,es6,model-doc,all> (default: <none>)', collect, [])
  .option('-o, --out <out>', 'the path to the output folder (default: ./out)', './out')
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
const doJSON = program.skip.every(a => a.toLowerCase() != 'json' && a.toLowerCase() != 'all');
const doCIMCORE = program.skip.every(a => a.toLowerCase() != 'cimcore' && a.toLowerCase() != 'all');
const doJSONSchema = program.skip.every(a => a.toLowerCase() != 'json-schema' && a.toLowerCase() != 'all');
const doES6 = program.skip.every(a => a.toLowerCase() != 'es6' && a.toLowerCase() != 'all');
const doModelDoc = program.skip.every(a => a.toLowerCase() != 'model-doc' && a.toLowerCase() != 'all');

// Create the output folder if necessary
mkdirp.sync(program.out);

// Set up the logger streams
const [ll, lm] = [program.logLevel.toLowerCase(), program.logMode.toLowerCase()];
const streams = [];
if (lm == 'short' || lm == 'long') {
  const prettyStdOut = new bps({mode: lm});
  prettyStdOut.pipe(process.stdout);
  streams.push({ level: ll, type: 'raw', stream: prettyStdOut});
} else if (lm == 'json') {
  streams.push({ level: ll, stream: process.stdout });
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
if (doJSON) {
  shrJE.setLogger(logger.child({module: 'shr-json-export'}));
}
if (doFHIR) {
  shrFE.setLogger(logger.child({module: 'shr-fhir-export'}));
}
if (doJSONSchema) {
  shrJSE.setLogger(logger.child({module: 'shr-json-schema-export'}));
}
if (doModelDoc) {
  shrJDE.setLogger(logger.child({module: 'shr-json-javadoc'}));
}
// NOTE: shr-es6-export does not currently support a Bunyan logger

// Go!
logger.info('Starting CLI Import/Export');
const configSpecifications = shrTI.importConfigFromFilePath(input);
const specifications = shrTI.importFromFilePath(input, configSpecifications);
const expSpecifications = shrEx.expand(specifications, shrFE);

if (doCIMCORE) {
  var cimcoreSpecifications = {
    'dataElements': [],
    'valueSets': [],
    'mappings': [],
    'namespaces': {},
    //also includes 'projectInfo'
  };
  const baseCIMCOREPath = `${program.out}/cimcore/`;

  //meta project file
  let versionInfo = {
    'CIMPL_version': '5.6.0',
    'CIMCORE_version': '1.1'
  };

  let projectMetaOutput = Object.assign({ 'fileType': 'ProjectInfo' }, configSpecifications, versionInfo); //project meta information
  cimcoreSpecifications['projectInfo'] = projectMetaOutput;

  const hierarchyPath = `${program.out}/cimcore/project.json`;
  mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
  fs.writeFileSync(hierarchyPath, JSON.stringify(projectMetaOutput, null, '  '));

  //meta namespace files
  for (const ns of expSpecifications.namespaces.all) { //namespace files
    let namespace = ns.namespace.replace(/\./, '-');
    let out = Object.assign({ 'fileType': 'Namespace' }, ns.toJSON());
    cimcoreSpecifications.namespaces[ns.namespace] = out;

    const hierarchyPath = `${baseCIMCOREPath}/${namespace}/${namespace}.json`;
    try {
      mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
      fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
    } catch (error) {
      logger.error('Unable to successfully serialize namespace meta information %s into CIMCORE, failing with error "%s". ERROR_CODE:15004', namespace, error);
    }
  }

  //data elements
  for (const de of expSpecifications.dataElements.all) {
    let namespace = de.identifier.namespace.replace(/\./, '-');
    let fqn = de.identifier.fqn.replace(/\./g, '-');
    let out = Object.assign({ 'fileType': 'DataElement' }, de.toJSON());
    cimcoreSpecifications.dataElements.push(out);

    const hierarchyPath = `${baseCIMCOREPath}/${namespace}/${fqn}.json`;
    try {
      mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
      fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
    } catch (error) {
      logger.error('Unable to successfully serialize element %s into CIMCORE, failing with error "%s". ERROR_CODE:15001', de.identifier.fqn, error);
    }
  }

  //valuesets
  for (const vs of expSpecifications.valueSets.all) {
    let namespace = vs.identifier.namespace.replace(/\./, '-');
    let name = vs.identifier.name.replace(/\./g, '-');
    let out = Object.assign({ 'fileType': 'ValueSet' }, vs.toJSON());
    cimcoreSpecifications.valueSets.push(out);

    const hierarchyPath = `${baseCIMCOREPath}/${namespace}/valuesets/${name}.json`;
    try {
      mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
      fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
    } catch (error) {
      logger.error('Unable to successfully serialize value set %s into CIMCORE, failing with error "%s". ERROR_CODE:15002', vs.identifier.fqn, error);
    }
  }

  //mappings
  for (const mapping of [...expSpecifications.maps._targetMap][0][1].all) {
    let namespace = mapping.identifier.namespace.replace(/\./, '-');
    let name = mapping.identifier.name;
    let out = Object.assign({ 'fileType': 'Mapping' }, mapping.toJSON());
    cimcoreSpecifications.mappings.push(out);

    const hierarchyPath = `${baseCIMCOREPath}/${namespace}/mappings/${name}-mapping.json`;
    try {
      mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
      fs.writeFileSync(hierarchyPath, JSON.stringify(out, null, '  '));
    } catch (error) {
      logger.error('Unable to successfully serialize mapping %s into CIMCORE, failing with error "%s". ERROR_CODE:15003', mapping.identifier.fqn, error);
    }
  }
} else {
  logger.info('Skipping CIMORE export');
}

if (doJSON) {
  const jsonHierarchyResults = shrJE.exportToJSON(specifications, configSpecifications);
  const hierarchyPath = `${program.out}/json/definitions.json`;
  mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
  fs.writeFileSync(hierarchyPath, JSON.stringify(jsonHierarchyResults, null, '  '));
} else {
  logger.info('Skipping JSON export');
}

if (doES6) {
  const es6Results = shrEE.exportToES6(expSpecifications, configSpecifications);
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
} else {
  logger.info('Skipping ES6 export');
}


if (doFHIR) {
  const fhirResults = shrFE.exportToFHIR(expSpecifications, configSpecifications);
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
} else {
  logger.info('Skipping FHIR export');
}

if (doJSONSchema) {
  let typeURL = configSpecifications.entryTypeURL;
  if (!typeURL) {
    typeURL = 'http://nowhere.invalid/';
  }
  const baseSchemaNamespace = 'https://standardhealthrecord.org/schema';
  const baseSchemaNamespaceWithSlash = baseSchemaNamespace + '/';
  const jsonSchemaResults = shrJSE.exportToJSONSchema(expSpecifications, baseSchemaNamespace, typeURL);
  const jsonSchemaPath = `${program.out}/json-schema/`;
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
//   const jsonSchemaExpandedPath = `${program.out}/json-schema-expanded/`;
//   mkdirp.sync(jsonSchemaExpandedPath);
//   for (const schemaId in jsonSchemaExpandedResults) {
//     const filename = `${schemaId.substring(baseSchemaExpandedNamespaceWithSlash.length).replace(/\//g, '.')}.schema.json`;
//     fs.writeFileSync(path.join(jsonSchemaExpandedPath, filename), JSON.stringify(jsonSchemaExpandedResults[schemaId], null, '  '));
//   }
} else {
  logger.info('Skipping JSON Schema export');
}

if (doModelDoc && cimcoreSpecifications.dataElements.length > 0) {
  const hierarchyPath = `${program.out}/modeldoc`;
  const fhirPath = `${program.out}/fhir/guide/pages/modeldoc`;
  const javadocResults = shrJDE.compileJavadoc(cimcoreSpecifications, hierarchyPath);
  shrJDE.exportToPath(javadocResults, hierarchyPath);
  if (doFHIR && configSpecifications.igModelDoc == true) {
    const igJavadocResults = shrJDE.compileJavadoc(cimcoreSpecifications, hierarchyPath, true);
    shrJDE.exportToPath(igJavadocResults, fhirPath);
  }
} else {
  logger.info('Skipping Model Docs export');
}


logger.info('Finished CLI Import/Export');

const errCounter = logCounter.error;
const wrnCounter = logCounter.warn;
let [errColor, errLabel, wrnColor, wrnLabel, resetColor] = ['\x1b[32m', 'errors', '\x1b[32m', 'warnings', '\x1b[0m'];
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
console.log('%s%d %s%s', errColor, errCounter.count, errLabel, resetColor);
console.log('%s%d %s%s', wrnColor, wrnCounter.count, wrnLabel, resetColor);
console.log('------------------------------------------------------------');