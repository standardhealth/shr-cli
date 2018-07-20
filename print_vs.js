const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

module.exports = function printValueSets(specs, config, out) {
  mkdirp.sync(out);
  const intVSMap = new Map();
  const extVSMap = new Map();
  for (const de of specs.dataElements.all) {
    const valueAndFields = [de.value, ...de.fields];
    for (let i=0; i < valueAndFields.length; i++) {
      const f = valueAndFields[i];
      if (!f) continue;
      if (f.constraintsFilter.valueSet.hasConstraints) {
        for (const vs of f.constraintsFilter.valueSet.constraints) {
          const vsMap = vs.valueSet.startsWith(config.projectURL) ? intVSMap : extVSMap;
          if (!vsMap.has(vs.valueSet)) {
            vsMap.set(vs.valueSet, new Map());
          }
          const usedBy = `${de.identifier.fqn} (${i == 0 ? 'Value' : f.identifier.name})`;
          vsMap.get(vs.valueSet).set(usedBy, true);
        }
      }
    }
  }

  const lines = ['Value Set,Used By Element,Used By Field'];
  for (const vs of extVSMap.keys()) {
    for (const usedBy of extVSMap.get(vs).keys()) {
      const match = /([^\s]+)\s\((.+)\)/.exec(usedBy);
      lines.push([vs, match[1], match[2]].join(','));
    }
  }
  fs.writeFileSync(path.join(out, 'vs_external.csv'), lines.join('\n'));

  lines.splice(1);
  for (const vs of intVSMap.keys()) {
    for (const usedBy of intVSMap.get(vs).keys()) {
      const match = /([^\s]+)\s\((.+)\)/.exec(usedBy);
      lines.push([vs, match[1], match[2]].join(','));
    }
  }
  fs.writeFileSync(path.join(out, 'vs_internal.csv'), lines.join('\n'));
};