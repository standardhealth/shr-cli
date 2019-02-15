//  /$$$$$$$              /$$               /$$$$$$$$ /$$                                               /$$
// | $$__  $$            | $$              | $$_____/| $$                                              | $$
// | $$  \ $$  /$$$$$$  /$$$$$$    /$$$$$$ | $$      | $$  /$$$$$$  /$$$$$$/$$$$   /$$$$$$  /$$$$$$$  /$$$$$$   /$$$$$$$
// | $$  | $$ |____  $$|_  $$_/   |____  $$| $$$$$   | $$ /$$__  $$| $$_  $$_  $$ /$$__  $$| $$__  $$|_  $$_/  /$$_____/
// | $$  | $$  /$$$$$$$  | $$      /$$$$$$$| $$__/   | $$| $$$$$$$$| $$ \ $$ \ $$| $$$$$$$$| $$  \ $$  | $$   |  $$$$$$
// | $$  | $$ /$$__  $$  | $$ /$$ /$$__  $$| $$      | $$| $$_____/| $$ | $$ | $$| $$_____/| $$  | $$  | $$ /$$\____  $$
// | $$$$$$$/|  $$$$$$$  |  $$$$/|  $$$$$$$| $$$$$$$$| $$|  $$$$$$$| $$ | $$ | $$|  $$$$$$$| $$  | $$  |  $$$$//$$$$$$$/
// |_______/  \_______/   \___/   \_______/|________/|__/ \_______/|__/ |__/ |__/ \_______/|__/  |__/   \___/ |_______/



const models = require('shr-models');
const { idFromFQN, constructCode } = require('./constructorCommons');

const bunyan = require('bunyan');
var rootLogger = bunyan.createLogger({name: 'shr-text-import'});
var logger = rootLogger;
function setLogger(bunyanLogger) {
  rootLogger = logger = bunyanLogger;
}

class DataElementConstructor {

  constructor() {
    this._elements = [];
  }

  get elements() { return this._elements; }
  set elements(elements) {
    this._elements = elements;
  }

  add(deJSON) {
    const constructedDE = this.constructBasicElement(deJSON);

    if ('basedOn' in deJSON) {
      this.constructBasedOn(deJSON).forEach(b => constructedDE.addBasedOn(b));
    }
    if ('concepts' in deJSON) {
      this.constructConcepts(deJSON).forEach(c => constructedDE.addConcept(c));
    }
    if ('value' in deJSON) {
      constructedDE.value = this.constructValue(deJSON.value, deJSON);
    }
    if ('fields' in deJSON) {
      constructedDE.fields = this.constructFields(deJSON);
    }

    this.elements.push(constructedDE);
  }

  constructBasicElement(de) {
    const constructedDE = new models.DataElement(new models.Identifier(de.namespace, de.name), de.isEntry, de.isAbstract);
    constructedDE.description = de.description;
    constructedDE.grammarVersion = models.GRAMMAR_VERSION;
    constructedDE.hierarchy = (de.hierarchy) ? de.hierarchy : [];
    return constructedDE;
  }

  constructBasedOn(de) {
    const basedOns = [];
    for (let basedOn of de.basedOn) {
      basedOns.push(idFromFQN(basedOn));
    }

    return basedOns;
  }

  constructConcepts(de) {
    const constructedConcepts = [];
    for (let cpt of de.concepts) {
      constructedConcepts.push(new models.Concept(cpt.system, cpt.code, cpt.display));
    }
    return constructedConcepts;
  }

  constructValue(value, de) {
    let constructedValue;

    switch (value.valueType) {
    case 'IdentifiableValue':
      constructedValue = new models.IdentifiableValue(idFromFQN(value.fqn));
      break;
    case 'RefValue':
      constructedValue = new models.RefValue(idFromFQN(value.fqn));
      break;
    case 'ChoiceValue': {
      let cValue = new models.ChoiceValue();
      for (const opt of value.options) {
        let constructedOption = this.constructValue(opt, de);
        if ('card' in value) {
          constructedOption.setMinMax(value.card.min, value.card.max);
        }
        cValue.addOption(constructedOption);
      }
      constructedValue = cValue;
      break;
    }
    case 'TBD': {
      let tbdText = value.fqn.match(/^TBD\((.*?)\)$/)[1];
      constructedValue = new models.TBD(tbdText);
      break;
    }
    default:
      //11027 , 'Unable to import property ${fqn1}  unknown value type: ${valueType1}' , 'The type either does not exist  or the import tool needs to be updated.', 'errorNumber'
      logger.error({fqn1 : de.fqn, valueType1 : value.valueType }, '11027');
      return;
    }

    if (!constructedValue) return;

    if ('card' in value) {
      if ('history' in value.card) {
        const originalCard = value.card.history[0];
        constructedValue.setMinMax(originalCard.min, originalCard.max);
        constructedValue.card.history = this.constructCardHistory(value.card.history);
        const currentCardConstraint = value.card.history[value.card.history.length - 1];
        if (currentCardConstraint) {
          constructedValue.addConstraint(this.constructCardHistoryConstraints(currentCardConstraint));
        }
      } else {
        constructedValue.setMinMax(value.card.min, value.card.max);
      }
    }

    if ('constraints' in value) {
      this.constructConstraints(value.constraints).forEach(c => constructedValue.addConstraint(c));
    }

    if ('constraintHistory' in value) {
      constructedValue.constraintHistory = this.constructConstraintHistory(value);
    }

    if ('inheritance' in value) {
      constructedValue.inheritance = value.inheritance.status;
      constructedValue.inheritedFrom = idFromFQN(value.inheritance.from);
    }

    return constructedValue;
  }

  constructCardHistory(history) {
    const constructedHistory = [];
    for (const h of history) {
      const histCard = new models.Cardinality(h.min, h.max);
      histCard.source = idFromFQN(h.source);
      constructedHistory.push(histCard);
    }
    return constructedHistory;
  }

  constructCardHistoryConstraints(history) {
    const cardConstraint = new models.CardConstraint(new models.Cardinality(history.min, history.max));
    cardConstraint.lastModifiedBy = idFromFQN(history.source);
    return cardConstraint;
  }

  constructFields(de) {
    let constructedFields = [];
    for (const field of de.fields) {
      constructedFields.push(this.constructValue(field, de));
    }
    return constructedFields;
  }

  constructConstraints(constraints) {
    const constructedConstraints = [];

    for (let cType of Object.keys(constraints)) {
      const constraint = constraints[cType];
      this.constructByType(constraint, cType, [], constructedConstraints);
    }

    return constructedConstraints;

  }
  constructByType(constraint, cType, path, aggregate) {
    if (cType !== 'subpaths' && path.length == 0 && constraint.path) {
      path = constraint.path.map(p=>idFromFQN(p));
    }

    let constructedConstraint;
    switch (cType) {
    case 'type':
      constructedConstraint = this.constructTypeConstraint(constraint, path);
      break;
    case 'valueSet':
      constructedConstraint = this.constructValueSetConstraint(constraint, path);
      break;
    case 'card':
      constructedConstraint = this.constructCardConstraint(constraint, path);
      break;
    case 'code':
    case 'boolean':
    case 'fixedValue':
      constructedConstraint = this.constructFixedValueConstraint(constraint, path);
      break;
    case 'includesType':
      constructedConstraint = this.constructIncludesTypeConstraints(constraint, path);
      break;
    case 'includesCode':
      constructedConstraint = this.constructIncludesCodeConstraints(constraint, path);
      break;
    case 'subpaths':
      this.constructSubpaths(constraint, path, aggregate);
      break;
    default:
      //11028 , 'Unable to import unknown constraint type: ${constraintType1} ' , 'The type either does not exist  or the import tool needs to be updated.', 'errorNumber'
      logger.error({constraintType1 : cType }, '11028' );
      break;
    }

    if (aggregate && constructedConstraint) {
      if (constructedConstraint instanceof Array) {
        aggregate.push(...constructedConstraint);
      } else {
        aggregate.push(constructedConstraint);
      }
    }
    return constructedConstraint;
  }
  constructTypeConstraint(constraint, path) {
    const typeConstraint = new models.TypeConstraint(idFromFQN(constraint.fqn), path, constraint.onValue);
    if (constraint.lastModifiedBy) typeConstraint.lastModifiedBy = idFromFQN(constraint.lastModifiedBy);
    return typeConstraint;
  }

  constructValueSetConstraint(constraint, path) {
    const vsConstraint = new models.ValueSetConstraint(constraint.uri, path, constraint.bindingStrength);
    if (constraint.lastModifiedBy) vsConstraint.lastModifiedBy = idFromFQN(constraint.lastModifiedBy);
    return vsConstraint;
  }

  constructCardConstraint(constraint, path) {
    const cardConstraint = new models.CardConstraint(new models.Cardinality(constraint.min, constraint.max), path);
    if (constraint.lastModifiedBy) cardConstraint.lastModifiedBy = idFromFQN(constraint.lastModifiedBy);
    return cardConstraint;
  }

  constructFixedValueConstraint(constraint, path) {
    if (constraint.type == 'code') {
      const code = constructCode(constraint.value.code, constraint.value.system, constraint.value.display);
      const fixedValueConstraint = new models.CodeConstraint(code, path);
      if (constraint.lastModifiedBy) fixedValueConstraint.lastModifiedBy = idFromFQN(constraint.lastModifiedBy);
      return fixedValueConstraint;
    } else if (constraint.type == 'boolean') {
      const fixedValueConstraint = new models.BooleanConstraint(constraint.value, path);
      if (constraint.lastModifiedBy) fixedValueConstraint.lastModifiedBy = idFromFQN(constraint.lastModifiedBy);
      return fixedValueConstraint;
    } else {
      //11031 , 'Unable to import FixedValueConstraint unknown fixed value type: ${ruleType1}' , 'The value type either does not exist  or the import tool needs to be updated.', 'errorNumber'
      logger.error({ruleType1 :  constraint.type }, '11031' );
    }
  }

  constructIncludesTypeConstraints(constraint, path) {
    const constructedConstraints = [];
    if (!(constraint instanceof Array)) constraint = [constraint];
    for (const cst of constraint) {
      let isA = idFromFQN(cst.fqn);
      let card = new models.Cardinality(cst.card.min, cst.card.max);
      const includesTypeConstraint = new models.IncludesTypeConstraint(isA, card, path);
      if (cst.lastModifiedBy) includesTypeConstraint.lastModifiedBy = idFromFQN(cst.lastModifiedBy);
      constructedConstraints.push(includesTypeConstraint);
    }
    return constructedConstraints;
  }

  constructIncludesCodeConstraints(constraint, path) {
    const constructedConstraints = [];
    if (!(constraint instanceof Array)) constraint = [constraint];
    for (const cst of constraint) {
      let code = constructCode(cst.code, cst.system, cst.description);
      const includesCodeConstraint = new models.IncludesCodeConstraint(code, path);
      if (cst.lastModifiedBy) includesCodeConstraint.lastModifiedBy = idFromFQN(cst.lastModifiedBy);
      constructedConstraints.push(includesCodeConstraint);
    }
    return constructedConstraints;
  }

  constructSubpaths(constraint, path, aggregate) {
    let subpaths = Object.keys(constraint);
    for (const subpath of subpaths) {
      for (const cType of Object.keys(constraint[subpath])) {
        this.constructByType(constraint[subpath][cType], cType, [...path, idFromFQN(subpath)], aggregate);
      }
    }
  }

  constructConstraintHistory(value) {
    const constructedConstraintHistory = new models.ConstraintHistory();
    for (const cType in value.constraintHistory) {
      value.constraintHistory[cType].forEach(historyItem => {
        const cst = this.constructByType(historyItem.constraint, cType, []);
        const src = idFromFQN(historyItem.source);
        if (cst instanceof Array) {
          //This should never be an array length > 1
          cst.forEach(c => constructedConstraintHistory.add(c, src, false));
        } else {
          constructedConstraintHistory.add(cst, src, false);
        }
      });
    }
    return constructedConstraintHistory;
  }
}

module.exports = { DataElementConstructor, setLogger};