const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const {importFromFilePath} = require('shr-text-import');
const {expand} = require('shr-expand');
const {exportToJSON} = require('shr-json-export');
const {exportToMarkdown, exportToHTML} = require('shr-md-export');

if (process.argv.length < 3) {
  console.error('Missing path to SHR definition folder or file');
}

const {namespaces, errors} = importFromFilePath(process.argv[2]);
for (const err of errors) {
  console.error(`Import Error: ${err}`);
}
const expanded = expand(namespaces);
for (const err of expanded.errors) {
  console.error(`Expansion Error: ${err}`);
}
const outDir = process.argv.length == 4 ? process.argv[3] : './out';

const hierarchyJSON = exportToJSON(namespaces);
const hierarchyPath = `${outDir}/json/shr.json`;
mkdirp.sync(hierarchyPath.substring(0, hierarchyPath.lastIndexOf('/')));
fs.writeFileSync(hierarchyPath, JSON.stringify(hierarchyJSON, null, '  '));

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

exportDoc(expanded.namespaces, 'markdown');
exportDoc(expanded.namespaces, 'html');