const {importFromFilePath} = require('./lib/text/import')
const {exportToSchemas} = require('./lib/schema/export')

if (process.argv.length < 3) {
    console.log("Missing path to SHR definition file")
}

const namespaces = importFromFilePath(process.argv[2])
for (ns of namespaces) {
    console.log(JSON.stringify(exportToSchemas(ns), null, "  "))
}