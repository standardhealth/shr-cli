/*
//  /$$$$$$                                               /$$
// |_  $$_/                                              | $$
//   | $$   /$$$$$$/$$$$   /$$$$$$   /$$$$$$   /$$$$$$  /$$$$$$    /$$$$$$   /$$$$$$
//   | $$  | $$_  $$_  $$ /$$__  $$ /$$__  $$ /$$__  $$|_  $$_/   /$$__  $$ /$$__  $$
//   | $$  | $$ \ $$ \ $$| $$  \ $$| $$  \ $$| $$  \__/  | $$    | $$$$$$$$| $$  \__/
//   | $$  | $$ | $$ | $$| $$  | $$| $$  | $$| $$        | $$ /$$| $$_____/| $$
//  /$$$$$$| $$ | $$ | $$| $$$$$$$/|  $$$$$$/| $$        |  $$$$/|  $$$$$$$| $$
// |______/|__/ |__/ |__/| $$____/  \______/ |__/         \___/   \_______/|__/
//                       | $$
//                       | $$
//                       |__/
*/

const bunyan = require('bunyan');
const path = require('path');
const fs = require('fs');

const { DataElementConstructor } = require('./constructors/dataElementConstructor');
const { ValueSetConstructor } = require('./constructors/valueSetConstructor');
const { MappingConstructor } = require('./constructors/mappingConstructor');
const { NamespaceConstructor } = require('./constructors/namespaceConstructor');
const { Specifications } = require('shr-models');

// const CIMCORE_VERSION = 1.1; //TODO enforce versioning
var rootLogger = bunyan.createLogger({name: 'shr-text-import'});
var logger = rootLogger;

function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
  require('./constructors/dataElementConstructor').setLogger(logger);
  require('./constructors/valueSetConstructor').setLogger(logger);
  require('./constructors/mappingConstructor').setLogger(logger);
  require('./constructors/namespaceConstructor').setLogger(logger);
}

class CimcoreImporter {

  constructor() {
    this._deConstructor = new DataElementConstructor();
    this._vsConstructor = new ValueSetConstructor();
    this._mpConstructor = new MappingConstructor();
    this._nsConstructor = new NamespaceConstructor();
  }

  get deConstructor() { return this._deConstructor; }
  get vsConstructor() { return this._vsConstructor; }
  get mpConstructor() { return this._mpConstructor; }
  get nsConstructor() { return this._nsConstructor; }
  get configSpecs() { return this._configSpecs; }
  set configSpecs(configSpecs) { this._configSpecs = configSpecs; }

  readFiles(src) {
    if (!this.configSpecs && fs.readdirSync(src).some(file => file == 'project.json')) {
      const config = JSON.parse(fs.readFileSync(path.join(src, 'project.json'), 'utf-8'));
      this.configSpecs = config;
      this.vsConstructor.config = config;
      //TODO: Enforce versioning
    }

    fs.readdirSync(src).forEach((subpath) => {
      const filePath = path.join(src, subpath);
      if (!fs.lstatSync(filePath).isDirectory()) {
        if (!filePath.endsWith('json')) return;

        const fileData = fs.readFileSync(filePath, 'utf-8');
        let content = JSON.parse(fileData);

        this.processFileByType(content);
      } else {
        //Process directories
        this.readFiles(filePath);
      }
    });
  }

  processFileByType(file) {
    if ('fileType' in file) {
      switch (file.fileType) {
      case 'DataElement':
        this.deConstructor.add(file);
        break;
      case 'ValueSet':
        this.vsConstructor.add(file);
        break;
      case 'Mapping':
        this.mpConstructor.add(file);
        break;
      case 'ProjectInfo':
        // ProjectInfo has already been processed, so we skip it here.
        break;
      case 'Namespace':
        this.nsConstructor.add(file);
        break;
      default:
        logger.warn('Unknown Filetype: ', file.fileType);
        break;
      }
    } else {
      //13077, 'Invalid file ${fileName1} ' ,  'Unknown' , 'errorNumber'
      logger.error({fileName1 : file}, '13077' );
    }
  }

  convertToSpecifications() {
    const specs = new Specifications();

    for (const ns of this.nsConstructor.namespaces) {
      specs.namespaces.add(ns);
    }

    for (const de of this.deConstructor.elements) {
      specs.dataElements.add(de);
    }

    for (const vs of this.vsConstructor.valuesets) {
      specs.valueSets.add(vs);
    }

    for (const cs of this.vsConstructor.codesystems) {
      specs.codeSystems.add(cs);
    }

    for (const map of this.mpConstructor.mappings) {
      specs.maps.add(map);
    }

    return specs;
  }
}

module.exports = { CimcoreImporter, setLogger };