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
const shrFE = require('shr-fhir-export');
const LogCounter = require('./logcounter');

/* eslint-disable no-console */

sanityCheckModules({shrTI, shrEx, shrJE, shrFE })

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
  .option('-s, --skip <feature>', 'skip an export feature <fhir,json,canjson,all> (default: <none>)', collect, [])
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
const doCanJSON = program.skip.every(a => a.toLowerCase() != 'canjson' && a.toLowerCase() != 'all');

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

// Go!
logger.info('Starting CLI Import/Export');
const configSpecifications = shrTI.importConfigFromFilePath(input);
const specifications = shrTI.importFromFilePath(input, configSpecifications);
const expSpecifications = shrEx.expand(specifications, shrFE);

//canonicaljson
if (doCanJSON) {
  //data elements 

  for (const de of expSpecifications.dataElements.all) {
    let namespace = de.identifier.namespace.replace(/\./, '-');
    let fqn = de.identifier.fqn.replace(/\./g, '-');

    const hierarchyPath = `${program.out}/canonicaljson/${namespace}/${fqn}.json`;
    mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
    fs.writeFileSync(hierarchyPath, JSON.stringify(de, null, '  '));
  }

  //valuesets

  for (const vs of expSpecifications.valueSets.all) {
    let namespace = vs.identifier.namespace.replace(/\./, '-');
    let name = vs.identifier.name.replace(/\./g, '-');;
  
    const hierarchyPath = `${program.out}/canonicaljson/${namespace}/valuesets/${name}.json`;
    mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
    fs.writeFileSync(hierarchyPath, JSON.stringify(vs, null, '  '));
  }

  //mappings

  for (const mapping of [...expSpecifications.maps._targetMap][0][1].all) {
    let namespace = mapping.identifier.namespace.replace(/\./, '-');
    let name = mapping.identifier.name;

    const hierarchyPath = `${program.out}/canonicaljson/${namespace}/mappings/${name}-mapping.json`;
    mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
    fs.writeFileSync(hierarchyPath, JSON.stringify(mapping, null, '  '));
  }

    //meta files
    let versionInfo = {
      "CAMEO_version": "5.2.1",
      "Canonical_JSON_version": "1.0"
    };
  
    let projectMetaOutput = Object.assign({}, configSpecifications, versionInfo); //project meta information
    const hierarchyPath = `${program.out}/canonicaljson/project.json`;
    mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
    fs.writeFileSync(hierarchyPath, JSON.stringify(projectMetaOutput, null, '  '));
  
    for (const ns of expSpecifications.namespaces.all) { //namespace files
      let namespace = ns.namespace.replace(/\./, '-');
  
      const hierarchyPath = `${program.out}/canonicaljson/${namespace}/${namespace}.json`;
      mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
      fs.writeFileSync(hierarchyPath, JSON.stringify(ns, null, '  '));
    }  
}
  
if (doJSON) {
  const jsonHierarchyResults = shrJE.exportToJSON(specifications, configSpecifications);
  const hierarchyPath = `${program.out}/json/definitions.json`;
  mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
  fs.writeFileSync(hierarchyPath, JSON.stringify(jsonHierarchyResults, null, '  '));
} else {
  logger.info('Skipping JSON export');
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
  fs.writeFileSync(path.join(baseFHIRPath, `shr_qa.html`), fhirResults.qaHTML);
  shrFE.exportIG(fhirResults, path.join(baseFHIRPath, 'guide'), configSpecifications, input);
} else {
  logger.info('Skipping FHIR export');
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