//  /$$      /$$                               /$$
// | $$$    /$$$                              |__/
// | $$$$  /$$$$  /$$$$$$   /$$$$$$   /$$$$$$  /$$ /$$$$$$$   /$$$$$$   /$$$$$$$
// | $$ $$/$$ $$ |____  $$ /$$__  $$ /$$__  $$| $$| $$__  $$ /$$__  $$ /$$_____/
// | $$  $$$| $$  /$$$$$$$| $$  \ $$| $$  \ $$| $$| $$  \ $$| $$  \ $$|  $$$$$$
// | $$\  $ | $$ /$$__  $$| $$  | $$| $$  | $$| $$| $$  | $$| $$  | $$ \____  $$
// | $$ \/  | $$|  $$$$$$$| $$$$$$$/| $$$$$$$/| $$| $$  | $$|  $$$$$$$ /$$$$$$$/
// |__/     |__/ \_______/| $$____/ | $$____/ |__/|__/  |__/ \____  $$|_______/
//                        | $$      | $$                     /$$  \ $$
//                        | $$      | $$                    |  $$$$$$/
//                        |__/      |__/                     \______/


const models = require('shr-models');
const { idFromFQN } = require('./constructorCommons');

const bunyan = require('bunyan');
var rootLogger = bunyan.createLogger({name: 'shr-text-import'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}


class MappingConstructor {

  constructor() {
    this._mappings = [];
  }

  get mappings() { return this._mappings; }
  set mappings(mappings) {
    this._mappings = mappings;
  }

  add(mapJSON) {
    const constructedMap = this.constructBasicMapping(mapJSON);

    if ('mappings' in mapJSON) {
      constructedMap.rules = this.constructRules(mapJSON.mappings);
    }

    this.mappings.push(constructedMap);
  }

  constructBasicMapping(map) {
    const constructedMap = new models.ElementMapping(idFromFQN(map.fqn), map.targetSpec, map.targetItem);
    // CIMPL does not actually track grammar version on mappings. Commenting out the following line to reflect that.
    // constructedMap.grammarVersion = models.GRAMMAR_VERSION;
    if ('inheritance' in map) {
      constructedMap.inheritance = map.inheritance.status;
      constructedMap.inheritedFrom = idFromFQN(map.inheritance.from);
    }
    return constructedMap;
  }

  constructRules(rules) {
    let constructedRules = [];

    for (let rType of Object.keys(rules)) {
      const rulesOfType = rules[rType];
      constructByType(rulesOfType, rType, []);
    }

    return constructedRules;

    function constructByType(rules, rType, path) {
      switch (rType) {
      case 'fieldMapping':
        constructFieldMappingRules(rules);
        break;
      case 'cardMapping':
        constructCardMappingRules(rules);
        break;
      case 'fixedValueMapping':
        constructFixedValueMappingRules(rules);
        break;
      default:
        //12029 , 'Cannot resolve element definition for ${name1}' , 'This is due to a incomplete definition for an element. Please refer to the document for proper definition syntax.', 'errorNumber'
        logger.error({name1 :  rType }, '11029' );
        break;
      }
    }

    function constructFieldMappingRules(rules) {
      for (const rule of rules) {
        let path = [];
        if ('sourcePath' in rule) {
          path = rule.sourcePath.map(p => idFromFQN(p));
        }

        const fieldMappingRule = new models.FieldMappingRule(path, rule.target);
        if (rule.lastModifiedBy) {
          fieldMappingRule.lastModifiedBy = idFromFQN(rule.lastModifiedBy);
        }
        constructedRules.push(fieldMappingRule);
      }
    }

    function constructCardMappingRules(rules) {
      for (const rule of rules) {
        const card = new models.Cardinality(rule.cardinality.min, rule.cardinality.max);
        const cardMappingRule = new models.CardinalityMappingRule(rule.target, card);
        if (rule.lastModifiedBy) {
          cardMappingRule.lastModifiedBy = idFromFQN(rule.lastModifiedBy);
        }
        constructedRules.push(cardMappingRule);
      }
    }

    function constructFixedValueMappingRules(rules) {
      for (const rule of rules) {
        const fixedValueMappingRule = new models.FixedValueMappingRule(rule.target, rule.fixedValue);
        if (rule.lastModifiedBy) {
          fixedValueMappingRule.lastModifiedBy = idFromFQN(rule.lastModifiedBy);
        }
        constructedRules.push(fixedValueMappingRule);
      }
    }
  }
}

module.exports = { MappingConstructor, setLogger };