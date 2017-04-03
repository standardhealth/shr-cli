const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const bunyan = require('bunyan');
const program = require('commander');
const bps = require('@ojolabs/bunyan-prettystream');
const shrTI = require('shr-text-import');
const shrEx = require('shr-expand');
const shrJE = require('shr-json-export');
const shrME = require('shr-md-export');
const shrFE = require('shr-fhir-export');

let input;
program
  .usage('<path-to-shr-defs> [options]')
  .option('-l, --log-level <level>', 'the console log level <fatal,error,warn,info,debug,trace> (default: info)', /^(fatal|error|warn|info|debug|trace)$/i, 'info')
  .option('-m, --log-mode <mode>', 'the console log mode <short,long,json,off> (default: short)', /^(short|long|json|off)$/i, 'short')
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
const ringBuffer = new bunyan.RingBuffer({ limit: 500 });
streams.push({ level: 'warn', type: 'raw', stream: ringBuffer});
// Always do a full JSON log
streams.push({ level: 'trace', path: path.join(program.out, 'out.log') });
const logger = bunyan.createLogger({
  name: 'shr',
  streams: streams
});

shrTI.setLogger(logger.child({module: 'shr-text-input'}));
shrEx.setLogger(logger.child({module: 'shr-expand'}));
shrJE.setLogger(logger.child({module: 'shr-json-export'}));
// shrME.setLogger(logger.child({module: 'shr-md-export'}));
shrFE.setLogger(logger.child({module: 'shr-fhir-export'}));

// Go!
logger.info('Starting CLI Import/Export');
const specifications = shrTI.importFromFilePath(process.argv[2]);
const expSpecifications = shrEx.expand(specifications);

const jsonHierarchyResults = shrJE.exportToJSON(specifications);
const hierarchyPath = `${program.out}/json/shr.json`;
mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
fs.writeFileSync(hierarchyPath, JSON.stringify(jsonHierarchyResults, null, '  '));

const fhirResults = shrFE.exportToFHIR(expSpecifications);
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
shrFE.exportIG(fhirResults, path.join(baseFHIRPath, 'guide'));

const exportDoc = function(specifications, format) {
  const basePath = path.join(program.out, format);
  mkdirp.sync(basePath);

  var result, ext;
  if (format == 'markdown') {
    result = shrME.exportToMarkdown(specifications);
    ext = 'md';
  } else if (format == 'html') {
    result = shrME.exportToHTML(specifications);
    ext = 'html';
    // Copy over the CSS
    // fs.createReadStream('./lib/markdown/shr-github-markdown.css').pipe(fs.createWriteStream(path.join(basePath, 'shr-github-markdown.css')));
  } else {
    console.error(`Unsupported doc format: ${format}`);
    return;
  }
  fs.writeFileSync(path.join(basePath, `index.${ext}`), result.index);
  fs.writeFileSync(path.join(basePath, `index_entries.${ext}`), result.entryIndex);
  for (const ns of Object.keys(result.namespaces)) {
    const nsPath = path.join(basePath, ...ns.split('.'));
    const nsFilePath = path.join(nsPath, `index.${ext}`);
    mkdirp.sync(nsFilePath.substring(0, nsFilePath.lastIndexOf(path.sep)));
    fs.writeFileSync(nsFilePath, result.namespaces[ns].index);
    for (const def of Object.keys(result.namespaces[ns].definitions)) {
      const name = `${def}.${ext}`;
      fs.writeFileSync(path.join(nsPath, name), result.namespaces[ns].definitions[def]);
    }
  }
};

exportDoc(expSpecifications, 'markdown');
exportDoc(expSpecifications, 'html');

let [numErrors, numWarnings] = [0, 0];
let [errModules, wrnModules] = [{}, {}];
for (const r of ringBuffer.records) {
  if (r.level >= 50) {
    numErrors++;
    if (r.module) errModules[r.module] = true;
  } else if (r.level >= 40) {
    numWarnings++;
    if (r.module) wrnModules[r.module] = true;
  }
}
let [errColor, errLabel, wrnColor, wrnLabel, resetColor] = ['\x1b[32m', 'errors', '\x1b[32m', 'warnings', '\x1b[0m'];
if (numErrors > 0) {
  errColor = '\x1b[31m'; // red
  errLabel = `errors (${Object.keys(errModules).join(', ')})`;
}
if (numWarnings > 0) {
  wrnColor = '\x1b[35m'; // magenta
  wrnLabel = `warnings (${Object.keys(wrnModules).join(', ')})`;
}
// eslint-disable-next-line no-console
console.log(errColor, numErrors, errLabel, resetColor);
// eslint-disable-next-line no-console
console.log(wrnColor, numWarnings, wrnLabel, resetColor);