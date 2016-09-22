class Namespace {
    constructor(namespace) {
        this._namespace = namespace;
        this._elements = [];
    }

    push(element) {
        this._elements.push(element)
    }

    toJSON() {
        let j = {
            namespace: this._namespace,
            definitions: {}
        }
        for (const el of this._elements) {
            j.definitions[el.name()] = el
        }
        return j
    }
}

class DataElement {
    constructor(namespace, name) {
        this._namespace = namespace;
        this._name = name;
    }

    name() {
        return this._name;
    }

    toJSON() {
        return {
            name: this._name
        }
    }
}

class Entry extends DataElement {
    constructor(namespace, name) {
        super(namespace, name);
    }

    toJSON() {
        return {
            name: this._name
        }
    }
}

module.exports = {Namespace, DataElement, Entry};