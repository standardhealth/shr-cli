const fs = require('fs');
const path = require('path');
//const url = require('url');
const mkdirp = require('mkdirp');
const {importFromFilePath} = require('./lib/text/import');
//const {exportToSchemas} = require('./lib/schema/export');
const {exportToMarkdown, exportToHTML} = require('./lib/markdown/export');
//const {exportToStructureDefinitions} = require('./lib/structdef/export');
//const {exportToHierarchyJSON} = require('./lib/hierarchy/export');

if (process.argv.length < 3) {
  console.error('Missing path to SHR definition folder or file');
}

const {namespaces, errors} = importFromFilePath(process.argv[2]);
const outDir = process.argv.length == 4 ? process.argv[3] : './out';

for (const err of errors) {
  console.error(`Import Error: ${err}`);
}
/* COMMENTING OUT SINCE HIERARCHY HASN'T BEEN UPDATED TO NEW MODELS
const hierarchyJSON = exportToHierarchyJSON(namespaces);
const hierarchyPath = `${outDir}/hierarchy/hierarchy.json`;
mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchyJSON, null, '  '));
*/
const exportDoc = function(namespaces, format) {
  const basePath = path.join(outDir, format);
  mkdirp.sync(basePath);

  var result, ext;
  if (format == 'markdown') {
    result = exportToMarkdown(namespaces);
    ext = 'md';
  } else if (format == 'html') {
    result = exportToHTML(namespaces);
    ext = 'html';
    // Copy over the CSS
    fs.createReadStream('./lib/markdown/shr-github-markdown.css').pipe(fs.createWriteStream(path.join(basePath, 'shr-github-markdown.css')));
  } else {
    console.error(`Unsupported doc format: ${format}`);
    return;
  }
  fs.writeFileSync(path.join(basePath, `index.${ext}`), result.index);
  fs.writeFileSync(path.join(basePath, `index_entries.${ext}`), result.indexEntries);
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

exportDoc(namespaces, 'markdown');
exportDoc(namespaces, 'html');

/* COMMENTING OUT SINCE SCHEMA AND STRUCTURE DEFINTIONS HAVEN'T BEEN UPDATED TO NEW MODELS
for (const schema of exportToSchemas(namespaces)) {
  const filePath = outDir + url.parse(schema.id).pathname;
  mkdirp.sync(filePath.substring(0, filePath.lastIndexOf('/')));
  fs.writeFileSync(filePath, JSON.stringify(schema, null, '  '));
}

for (const structdef of exportToStructureDefinitions(namespaces)) {
  const filePath = `${outDir}/structdefs/${url.parse(structdef.url).pathname}.json`;
  mkdirp.sync(filePath.substring(0, filePath.lastIndexOf('/')));
  fs.writeFileSync(filePath, JSON.stringify(structdef, null, '  '));
}
*/