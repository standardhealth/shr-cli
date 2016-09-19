class DataElement {
    constructor(namespace, name) {
        this.type = 'DataElement';
        this.namespace = namespace;
        this.name = name;
    }
}

class Entry extends DataElement {
    constructor(namespace, name) {
        super(namespace, name);
        this.type = 'Entry';
    }
}

module.exports = {DataElement, Entry};