const fs = require('fs');
const url = require('url');
const mkdirp = require('mkdirp');
const {importFromFilePath} = require('./lib/text/import');
const {exportToSchemas} = require('./lib/schema/export');
const {exportToStructureDefinitions} = require('./lib/structdef/export');
const {exportToHierarchyJSON} = require('./lib/hierarchy/export');

if (process.argv.length < 3) {
  console.error('Missing path to SHR definition folder or file');
}

const {namespaces, errors} = importFromFilePath(process.argv[2]);
const outDir = process.argv.length == 4 ? process.argv[3] : './out';

for (const err of errors) {
  console.error(`Import Error: ${err}`);
}

const hierarchyJSON = exportToHierarchyJSON(namespaces);
const hierarchyPath = `${outDir}/hierarchy/hierarchy.json`;
mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchyJSON, null, '  '));

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