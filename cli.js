const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const bunyan = require('bunyan');
const bps = require('@ojolabs/bunyan-prettystream');
const shrTI = require('shr-text-import');
const shrEx = require('shr-expand');
const shrJE = require('shr-json-export');
const shrME = require('shr-md-export');
const shrFE = require('shr-fhir-export');

// Check args
if (process.argv.length < 3) {
  console.error('Missing path to SHR definition folder or file');
  process.exit(1);
}

// Create the output folder if necessary
const outDir = process.argv.length == 4 ? process.argv[3] : './out';
mkdirp.sync(outDir);

// Set up the logger
var prettyStdOut = new bps({mode: 'short'});
prettyStdOut.pipe(process.stdout);
const logger = bunyan.createLogger({
  name: 'shr',
  streams: [
    { level: 'info', type: 'raw', stream: prettyStdOut },
    { level: 'trace', path: path.join(outDir, 'out.log') }
  ]
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
const hierarchyPath = `${outDir}/json/shr.json`;
mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
fs.writeFileSync(hierarchyPath, JSON.stringify(jsonHierarchyResults, null, '  '));

const fhirResults = shrFE.exportToFHIR(expSpecifications);
const baseFHIRPath = path.join(outDir, 'fhir');
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
  const basePath = path.join(outDir, format);
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