const antlr4 = require('antlr4/index');
const {SHRParser} = require('./parsers/SHRParser');
const {SHRParserListener} = require('./parsers/SHRParserListener');
const {Namespace, DataElement, Entry} = require('./models')

class SHR2JS extends SHRParserListener {
    constructor() {
        super();
        // The map of namespace to elements
        this._nsMap = {};
        // The currently active namespace
        this._currentNs = "";
        // The currently active definition (data element, entry, vocabulary)
        this._currentDef = null;
    }

    exitNamespace(ctx) {
        if (ctx.parentCtx instanceof SHRParser.NamespaceDefContext) {
            let ns = ctx.getText()
            this._currentNs = ns;
            this._nsMap[ns] = new Namespace(ns)
        }
    }

    exitDataElementName(ctx) {
        if (ctx.parentCtx instanceof SHRParser.DataElementHeaderContext) {
            this._currentDef = new DataElement(this._currentNs, ctx.getText());
        }
    }

    exitDataElementDef(ctx) {
        this.pushCurrentDefinition();
    }

    exitEntryName(ctx) {
        if (ctx.parentCtx instanceof SHRParser.EntryHeaderContext) {
            this._currentDef = new Entry(this._currentNs, ctx.getText());
        }
    }

    exitEntryDef(ctx) {
        this.pushCurrentDefinition();
    }

    exitAnswer(ctx) {
        this._currentDef.addAnswer(ctx.getText());
    }

    exitDescriptionProp(ctx) {
        let d = stripStringToken(ctx.STRING());
        this._currentDef.setDescription(d);
    }

    pushCurrentDefinition() {
        this._nsMap[this._currentNs].push(this._currentDef);
        this._currentDef = null;
    }

    toSchemas() {
        let schemas = []
        for (let key of Object.keys(this._nsMap)) {
            schemas.push(this._nsMap[key].toSchema())
        }
        return schemas;
    }
}

function stripStringToken(tkn) {
    str = tkn.getText()
    // TODO: Also fix escaped double-quotes, but right now, the parser seems to be screwing those up.
    return str.substr(1,str.length -2)
}

exports.SHR2JS = SHR2JS;