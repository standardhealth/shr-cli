const antlr4 = require('antlr4/index');
const {SHRParser} = require('./parsers/SHRParser');
const {SHRParserListener} = require('./parsers/SHRParserListener');
const {DataElement, Entry} = require('./models')

class SHR2JS extends SHRParserListener {
    constructor() {
        super();
        /** The data elements, entries, and vocabs defined in this file **/
        this.definitions = [];
        /** The currently active namespace */
        this.currentNamespace = "";
        /** The currently active definition (data element, entry, vocabulary) */
        this.currentDefinition = null;
    }

    exitNamespace(ctx) {
        if (ctx.parentCtx instanceof SHRParser.NamespaceDefContext) {
            this.currentNamespace = ctx.getText();
            console.log(`In namespace: ${this.currentNamespace}`);
        }
    }

    exitDataElementName(ctx) {
        if (ctx.parentCtx instanceof SHRParser.DataElementHeaderContext) {
            this.currentDefinition = new DataElement(this.currentNamespace, ctx.getText());
            console.log(`Start ${this.currentDefinition.type}: ${this.currentDefinition.namespace}.${this.currentDefinition.name}`);
        }
    }

    exitDataElementDef(ctx) {
        this.definitions.push(this.currentDefinition);
        console.log(`Stop ${this.currentDefinition.type}: ${this.currentDefinition.namespace}.${this.currentDefinition.name}`);
        this.currentDefinition = null;
    }

    exitEntryName(ctx) {
        if (ctx.parentCtx instanceof SHRParser.EntryHeaderContext) {
            this.currentDefinition = new Entry(this.currentNamespace, ctx.getText());
            console.log(`Start ${this.currentDefinition.type}: ${this.currentDefinition.namespace}.${this.currentDefinition.name}`);
        }
    }

    exitEntryDef(ctx) {
        this.definitions.push(this.currentDefinition);
        console.log(`Stop ${this.currentDefinition.type}: ${this.currentDefinition.namespace}.${this.currentDefinition.name}`);
        this.currentDefinition = null;
    }
}

exports.SHR2JS = SHR2JS;