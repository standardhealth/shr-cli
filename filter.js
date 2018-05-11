const { Specifications } = require('shr-models');

class SpecificationsFilter {

  constructor(specifications, expSpecifications, configSpecifications) {
    this._specs = specifications;
    this._expSpecs = expSpecifications;
    this._config = configSpecifications;
    this._deDependencies = new IdentifierSet();
    this._processedDataElements = [];
    this._vsDependencies = new Set();
    this._csDependencies = new Set();
    this._filteredSpecs = new Specifications();
    this._filteredExpSpecs = new Specifications();
  }

  filter() {
    // get filter config data
    let strategy = '';
    let primary = [];
    if (this._config.igPrimarySelectionStrategy != null) {
      strategy = this._config.igPrimarySelectionStrategy.strategy;
      primary = this._config.igPrimarySelectionStrategy.primary;
    }

    // recursively find dependencies for each data element in specifications
    // if element matches filter criteria
    for (const element of this._expSpecs.dataElements.all) {
      if (((strategy === "element") && (primary.includes(element.identifier.name)))
      || ((strategy === "namespace") && (primary.includes(element.identifier.namespace)))) {
        this.findDataElementDependenciesRecursive(element.identifier);
      }
    }

    // filter data elements in specifications by data element dependencies
    for (const element of this._expSpecs.dataElements.all) {
      if (this._deDependencies.has(element.identifier)) {
        this._filteredExpSpecs.dataElements.add(element);
      }
    }

    // filter value sets in specifications by value set dependencies
    for (const valueSet of this._expSpecs.valueSets.all) {
      if (this._vsDependencies.has(valueSet.url)) {
        this._filteredExpSpecs.valueSets.add(valueSet);
      }
    }

    // find additional code system dependencies by filtered value sets
    for (const valueSet of this._filteredExpSpecs.valueSets.all) {
      valueSet.concepts.forEach(concept => {
        this._csDependencies.add(concept.system);
      });

      valueSet.rules.forEach(rule => {
        if (rule.system) {
          this._csDependencies.add(rule.system);
        } else {
          this._csDependencies.add(rule.code.system);
        }
      });
    }

    // filter code systems in specifications by code system dependencies
    for (const codeSystem of this._expSpecs.codeSystems.all) {
      if (this._csDependencies.has(codeSystem.url)) {
        this._filteredExpSpecs.codeSystems.add(codeSystem);
      }
    }

    // filter namespaces in specifications by filtered data elements, value sets, and code systems
    for (const namespace of this._expSpecs.namespaces.all) {
      if (this._filteredExpSpecs.dataElements.namespaces.some(ns => ns === namespace.namespace)) {
        this._filteredExpSpecs.namespaces.add(namespace);
      } else if (this._filteredExpSpecs.valueSets.namespaces.some(ns => ns === namespace.namespace)) {
        this._filteredExpSpecs.namespaces.add(namespace);
      } else if (this._filteredExpSpecs.codeSystems.namespaces.some(ns => ns === namespace.namespace)) {
        this._filteredExpSpecs.namespaces.add(namespace);
      }
    }

    for (const target of this._expSpecs.maps.targets) {
      for (const map of this._expSpecs.maps.byTarget(target)) {
        if (this._deDependencies.has(map.identifier)) {
          this._filteredExpSpecs.maps.add(map);
        }
      }
    }

    // filter specifications based on filtered expanded specifications
    for (const namespace of this._specs.namespaces.all) {
      if (this._filteredExpSpecs.namespaces.all.includes(namespace)) {
        this._filteredSpecs.namespaces.add(namespace);
      }
    }
    for (const dataElement of this._specs.dataElements.all) {
      if (this._filteredExpSpecs.dataElements.all.includes(dataElement)) {
        this._filteredSpecs.dataElements.add(namespace);
      }
    }
    for (const valueSet of this._specs.valueSets.all) {
      if (this._filteredExpSpecs.valueSets.all.includes(valueSet)) {
        this._filteredSpecs.valueSets.add(valueSet);
      }
    }
    for (const codeSystem of this._specs.codeSystems.all) {
      if (this._filteredExpSpecs.codeSystems.all.includes(codeSystem)) {
        this._filteredSpecs.codeSystems.add(codeSystem);
      }
    }
    for (const target of this._specs.maps.targets) {
      const filteredMaps = this._filteredExpSpecs.maps.byTarget(target);
      for (const map of this._specs.maps.byTarget(target)) {
        if (filteredMaps.includes(map)) {
          this._filteredSpecs.maps.add(map);
        }
      }
    }

    return [this._filteredSpecs, this._filteredExpSpecs];
  }

  findDataElementDependenciesRecursive(identifier) {
    // If it's primitive or we've already processed this one, don't go further
    // (avoid circular dependencies)
    if (this._processedDataElements.some(id => id.equals(identifier))) {
      return;
    } else if (identifier.isPrimitive) {
      this._processedDataElements.push(identifier);
      return;
    }

    this._deDependencies.add(identifier);

    const element = this._expSpecs.dataElements.findByIdentifier(identifier);

    element.basedOn.forEach(b => this._deDependencies.add(b));

    element.concepts.forEach(concept => this._csDependencies.add(concept.system));

    [element.value, ...element.fields].forEach(field => {
      if (!field) {
        return;
      }

      if (field.effectiveIdentifier) { // is IdentifiableValue
        this._deDependencies.add(field.effectiveIdentifier);
      } else if (field.options) { // is ChoiceValue
        field.aggregateOptions.filter(opt => opt.effectiveIdentifier).forEach(option => {
          this._deDependencies.add(option.effectiveIdentifier);
        });
      }

      field.constraintsFilter.includesType.constraints.forEach(constraint => {
        this._deDependencies.add(constraint.isA);
      });

      field.constraintsFilter.valueSet.constraints.forEach(constraint => {
        this._vsDependencies.add(constraint.valueSet);
      });

      field.constraintsFilter.code.constraints.forEach(constraint => {
        this._csDependencies.add(constraint.code.system);
      });

      field.constraintsFilter.includesCode.constraints.forEach(constraint => {
        this._csDependencies.add(constraint.code.system);
      });
    });

    this._processedDataElements.push(identifier);

    this._deDependencies.forEach(de => {
      this.findDataElementDependenciesRecursive(de);
    });
  }

}

/**
 * IdentifierSet contains a set of Identifiers with the guarantee that there are no duplicates.
 * This class mimics a few of the useful functions found on JavaScript's Set class.
 */
class IdentifierSet {
  constructor() {
    this._map = new Map();
  }

  add(identifier) {
    this._map.set(identifier.fqn, identifier);
    return this;
  }

  has(identifier) {
    return this._map.has(identifier.fqn);
  }

  forEach(callback) {
    this._map.forEach(v => callback(v, v, this));
  }
}

module.exports = SpecificationsFilter;
