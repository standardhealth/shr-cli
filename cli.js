const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const {importFromFilePath} = require('shr-text-import');
const {expand} = require('shr-expand');
const {exportToJSON} = require('shr-json-export');
const {exportToMarkdown, exportToHTML} = require('shr-md-export');
const {exportToFHIR, exportIG} = require('shr-fhir-export');

if (process.argv.length < 3) {
  console.error('Missing path to SHR definition folder or file');
}

const {specifications, errors} = importFromFilePath(process.argv[2]);
for (const err of errors) {
  console.error(`Import Error: ${err}`);
}
const expanded = expand(specifications);
for (const err of expanded.errors) {
  console.error(`Expansion Error: ${err}`);
}
const outDir = process.argv.length == 4 ? process.argv[3] : './out';

const hierarchyJSON = exportToJSON(specifications);
const hierarchyPath = `${outDir}/json/shr.json`;
mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchyJSON, null, '  '));

const fhirResults = exportToFHIR(expanded.specifications);
for (const err of fhirResults.errors) {
  console.error(`FHIR Mapping Error: ${err}`);
}
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
exportIG(fhirResults, path.join(baseFHIRPath, 'guide'));

const exportDoc = function(specifications, format) {
  const basePath = path.join(outDir, format);
  mkdirp.sync(basePath);

  var result, ext;
  if (format == 'markdown') {
    result = exportToMarkdown(specifications);
    ext = 'md';
  } else if (format == 'html') {
    result = exportToHTML(specifications);
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

exportDoc(expanded.specifications, 'markdown');
exportDoc(expanded.specifications, 'html');

if (errors.length > 0) {
  console.error(`${errors.length} import errors`);
}
if (expanded.errors.length > 0) {
  console.error(`${expanded.errors.length} expansion errors`);
}
if (fhirResults.errors.length > 0) {
  console.error(`${fhirResults.errors.length} fhir mapping errors`);
}