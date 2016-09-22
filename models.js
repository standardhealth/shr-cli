class Namespace {
    constructor(namespace) {
        this._namespace = namespace;
        this._elements = [];
    }

    push(element) {
        this._elements.push(element)
    }

    toSchema() {
        let nsPath = this._namespace.replace(/\./g, '/');
        let id = `http://standardhealthrecord.org/schemas/${nsPath}.schema.json`
        let schema = {
            "$schema": "http://standardhealthrecord.org/schemas/shr/extended-schema.schema.json",
            id,
            definitions: {}
        }
        for (const el of this._elements) {
            el.addSelfToSchemaDefinitions(schema)
        }
        return schema
    }
}

class DataElement {
    constructor(namespace, name) {
        this._namespace = namespace;
        this._name = name;
        this._answers = [];
    }

    namespace() {
        return this._namespace;
    }

    name() {
        return this._name;
    }

    setDescription(description) {
        assertNoOverwrite(this._description, this, 'description', description)
        this._description = description;
    }

    addAnswer(answer) {
        this._answers.push(answer)
    }

    addSelfToSchemaDefinitions(schema) {
        let description = this._description;
        let definition = {
            description
        };

        if (this._answers.length > 1) {
            definition.oneOf = this._answers.map(a => this.convertAnswerToSchemaTypeObject(a));
        } else if (this._answers.length == 1) {
            Object.assign(definition, this.convertAnswerToSchemaTypeObject(this._answers[0]));
        }
        schema.definitions[this._name] = definition
    }

    convertAnswerToSchemaTypeObject(answer) {
        // TO CONSIDER: These could all be defined as separate (resusable) types in our types.schema.json.
        switch(answer) {
            case "boolean":
                return {type: "boolean"};
            case "integer":
                return {type: "integer"};
            case "decimal":
                return {type: "number"};
            case "unsignedInt":
                return {type: "integer", minimum: 0}
            case "positiveInt":
                return {type: "integer", minimum: 1}
            case "string":
                return {type: "string"};
            case "markdown":
                return {type: "string"}; // TODO: differentiate from string
            case "code":
                return {type: "string", pattern: "[^\\s]+([\\s]?[^\\s]+)*"}
            case "id":
                return {type: "string", pattern: "[A-Za-z0-9\\-\\.]{1,64}"}
            case "oid":
                return {type: "string", pattern: "urn:oid:[0-2](\\.[1-9]\\d*)+"}
            case "uri":
                return {type: "string", format: "uri"}
            case "base64Binary":
                return {type: "string"}; // TODO: differentiate from string
            case "date":
                return {type: "string", pattern: "-?[0-9]{4}(-(0[1-9]|1[0-2])(-(0[0-9]|[1-2][0-9]|3[0-1]))?)?"}
            case "dateTime":
                return {type: "string", pattern: "-?[0-9]{4}(-(0[1-9]|1[0-2])(-(0[0-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?"}
            case "instant":
                return {type: "string", format: "date-time"}
            case "time":
                return {type: "string", pattern: "([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?"}
        }

        // We fell through, so this is a reference to another data element or entry

        // First break it into its namespace parts (if applicable)
        let parts = answer.split(".")
        if (parts.length == 1) {
            return {"$ref": `#/definitions/${answer}`}
        }
        let name = parts.pop()
        let nsPath = parts.join("/")
        return {"$ref": `http://standardhealthrecord.org/schemas/${nsPath}/${name}.schema.json`}
    }
}

class Entry extends DataElement {
    constructor(namespace, name) {
        super(namespace, name);
    }
}

function assertNoOverwrite(property, object, propName, newValue) {
    if (typeof property !== 'undefined') {
        console.log(`WARNING: Overwriting ${object.namespace()}.${object.name()}['${propName}']:\n\twas: ${property}\n\tnow: ${newValue}`)
    }
}

module.exports = {Namespace, DataElement, Entry};