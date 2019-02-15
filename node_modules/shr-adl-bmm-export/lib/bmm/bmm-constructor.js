/*
//   /$$$$$$                                  /$$                                     /$$
//  /$$__  $$                                | $$                                    | $$
// | $$  \__/  /$$$$$$  /$$$$$$$   /$$$$$$$ /$$$$$$    /$$$$$$  /$$   /$$  /$$$$$$$ /$$$$$$    /$$$$$$   /$$$$$$
// | $$       /$$__  $$| $$__  $$ /$$_____/|_  $$_/   /$$__  $$| $$  | $$ /$$_____/|_  $$_/   /$$__  $$ /$$__  $$
// | $$      | $$  \ $$| $$  \ $$|  $$$$$$   | $$    | $$  \__/| $$  | $$| $$        | $$    | $$  \ $$| $$  \__/
// | $$    $$| $$  | $$| $$  | $$ \____  $$  | $$ /$$| $$      | $$  | $$| $$        | $$ /$$| $$  | $$| $$
// |  $$$$$$/|  $$$$$$/| $$  | $$ /$$$$$$$/  |  $$$$/| $$      |  $$$$$$/|  $$$$$$$  |  $$$$/|  $$$$$$/| $$
//  \______/  \______/ |__/  |__/|_______/    \___/  |__/       \______/  \_______/   \___/   \______/ |__/
//
// Formatter - BMM
// Abhijay Bhatnagar
// 05/01/18
*/
const bunyan = require('bunyan');

var rootLogger = bunyan.createLogger({name: 'shr-adl-export'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

const formatId = (idArray, type) => {
  return `[${type}${idArray.join('.')}]`;
};

const makeCamlCased = (string) => {
  return string.charAt(0).toLowerCase() + string.slice(1);
};

function reformatNamespace(ns) {
  return ns.split('.').map(partial=>partial.charAt(0).toUpperCase() + partial.slice(1)).join('');
}


class BmmSpecs {
  constructor(specs, config) {
    this._specs = specs;
    this._config = config;
    this.bmmSpecs = {
      packages: this.constructPackages(),
      definitions: this.constructDefinitions()
    };
  }

  get specs() { return this._specs; }
  get config() { return this._config; }

  constructBmmSpecs() {
    this.constructPackages();
  }

  constructPackages() {
    const packages = {};
    for (const ns of this.specs.namespaces.all) {
      const namespace = reformatNamespace(ns.namespace);
      const elements = this.specs.dataElements.byNamespace(ns.namespace);
      packages[namespace] = elements;
    }
    return packages;
  }

  constructDefinitions() {
    const definitions = {};
    for (const de of this.specs.dataElements.all) {
      const name = de.identifier.name;
      const properties = this.constructProperties(de);
      definitions[name] = {
        name: name,
        documentation: de.description,
        ancestors: de.basedOn,
      };
      if (Object.keys(properties).length > 0) {
        definitions[name].properties = properties;
      }
    }
    return definitions;
  }

  constructProperties(de) {
    const properties = {};
    for (const f of de.fields.filter(v=>v.inheritance == null)) {
      if (f.identifier !== null) {

        //TBD: currently skipping includes constraint...
        if (f.constraintsFilter.includesType.hasConstraints || f.constraintsFilter.includesCode.hasConstraints) {
          continue;
        }

        const fDef = this.specs.dataElements.findByIdentifier(f.identifier);

        const documentation = fDef.description;
        const name = makeCamlCased(f.identifier.name);
        const type = f.identifier.name;
        const p_bmm_type = 'P_BMM_SINGLE_PROPERTY';

        if (f.identifier.namespace == 'primitive') {
          const a = 'b';
        }
        properties[name] = {
          p_bmm_type: p_bmm_type,
          name: name,
          type: type,
          documentation: documentation
        };

        if (f.effectiveCard.toString().charAt(0) == 1) {
          const is_mandatory = 'True';
          properties[name].is_mandatory = is_mandatory;
        }

        if (f.effectiveCard.toString() !== '0..1') {
          const cardinality = f.effectiveCard;
          properties[name].cardinality = cardinality;
        }
      } else if (f.constructor.name == 'ChoiceValue') {
        //13076, 'Unsupported choices in fields' ,  'Unknown' , 'errorNumber'
        logger.error('13076');
      }
    }

    if (de.value && de.value.inheritance == null) {
      if (de.value.identifier) {
        const v = de.value;

        const name = 'value';
        const p_bmm_type = 'P_BMM_SINGLE_PROPERTY';

        properties[name] = {
          p_bmm_type: p_bmm_type,
          name: name,
        };

        if (v.identifier.namespace == 'primitive') {
          let documentation = `PrimitiveValue (original type: ${v.identifier.name})`;
          let type = 'Any';

          type = v.identifier.name.toUpperCase();
          // const conversionTable = {
          //   code: 'CodedText',
          //   string: 'String',
          //   dateTime: 'DateTime',
          //   decimal: 'Quantity',
          //   uri: 'URI',
          //   boolean: 'Boolean',
          //   time: 'Time'
          // };
          // if (v.identifier.name in conversionTable) {
          //   type = conversionTable[v.identifier.name];
          // } else {
          //   console.log('unhandled prmitive %s', v.identifier.name);
          //   documentation = `Unsupported Primitive ${v.identifier.name}`;
          //   type = 'CodedText';
          // }
          properties[name].documentation = documentation;
          properties[name].type = type;
        } else {
          const vDef = this.specs.dataElements.findByIdentifier(v.identifier);
          const documentation = vDef.description;
          const type = v.identifier.name;

          properties[name].documentation = documentation;
          properties[name].type = type;
        }

        if (v.effectiveCard.toString().charAt(0) == 1) {
          const is_mandatory = 'True';
          properties[name].is_mandatory = is_mandatory;
        }

        if (v.effectiveCard.toString() !== '0..1') {
          const cardinality = v.effectiveCard;
          properties[name].cardinality = cardinality;
        }
      } else if (de.value.constructor.name == 'ChoiceValue') {
        for (const opt of de.value.options) {
          const name = `valueChoice${opt.identifier.name}`;
          const p_bmm_type = 'P_BMM_SINGLE_PROPERTY';

          properties[name] = {
            p_bmm_type: p_bmm_type,
            name: name,
          };

          if (opt.identifier.namespace == 'primitive') {
            let documentation = `PrimitiveValue (original type: ${opt.identifier.name})`;
            let type = 'Any';

            type = opt.identifier.name.toUpperCase();
            // const conversionTable = {
            //   code: 'CodedText',
            //   string: 'String',
            //   dateTime: 'DateTime',
            //   decimal: 'Quantity',
            //   uri: 'URI',
            //   boolean: 'Boolean',
            //   time: 'Time'
            // };
            // if (opt.identifier.name in conversionTable) {
            //   type = conversionTable[opt.identifier.name];
            // } else {
            //   console.log('unhandled prmitive %s', opt.identifier.name);
            //   documentation = `Unsupported Primitive ${opt.identifier.name}`;
            //   type = 'CodedText';
            // }

            properties[name].documentation = documentation;
            properties[name].type = type;

          } else {
            const vDef = this.specs.dataElements.findByIdentifier(opt.identifier);
            const documentation = vDef.description;
            const type = opt.identifier.name;

            properties[name].documentation = documentation;
            properties[name].type = type;
          }

          if (opt.effectiveCard.toString().charAt(0) == 1) {
            const is_mandatory = 'True';
            properties[name].is_mandatory = is_mandatory;
          }

          if (opt.effectiveCard.toString() !== '0..1') {
            const cardinality = opt.effectiveCard;
            properties[name].cardinality = cardinality;
          }
        }
      }
    }

    return properties;
  }
}

module.exports = { BmmSpecs, setLogger };