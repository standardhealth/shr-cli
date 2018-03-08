const fs = require('fs-extra');

function gatherFiles(sourcePath, exportedPath) {
  const sourceFiles = fs.readdirSync(sourcePath);
  const exportedFiles = fs.readdirSync(exportedPath);

  const sourceSpec = {
    'DataElement': [],
    'ValueSet': [],
    'Map': []
  };
  const exportedSpec = Object.assign({}, sourceSpec);

  const getCimplFiles = (path, files, storeageDict) => {
    for (const file of files) {
      const filePath = `${path}/${file}`;
      if (!fs.lstatSync(filePath).isDirectory()) {
        const f = fs.readFileSync(filePath, 'utf8');
        if (file.match(/_vs.txt$/)) {
          exportedSpec.ValueSet.push(f);
        } else if (file.match(/_map.txt$/)) {
          exportedSpec.Map.push(f);
        } else if (file.match(/^[A-za-z]*_[A-za-z]*.txt$/)) {
          exportedSpec.DataElement.push(f);
        }
      }
    }
  };

  getCimplFiles(sourcePath, sourceFiles, sourceSpec);
  getCimplFiles(exportedPath, exportedFiles, exportedSpec);

  return {
    'source': sourceSpec,
    'exported': exportedSpec
  };
}

function compareFiles(sourceFiles, exportedFiles) {
  // // for (const de of exportedFiles.DataElement) {

  // // }

  // for (const vs of exportedFiles.ValueSet) {
  //   srcFile = sourceFiles.ValueSet.find(vs=>vs)
  //   compareVSFile()
  // }

  // for (const map of exportedFiles.Map) {

  // }

}

gatheredFiles = gatherFiles('../shr_spec/spec', '../shr_spec/cimplExport');
console.log(gatheredFiles.source.DataElement.count, gatheredFiles.source.ValueSet.count, gatheredFiles.source.Map.count);
console.log(gatheredFiles.exported.DataElement.count, gatheredFiles.exported.ValueSet.count, gatheredFiles.exported.Map.count);
