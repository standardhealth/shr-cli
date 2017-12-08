const { EventEmitter } = require('events');
const { TRACE, DEBUG, INFO, WARN, ERROR, FATAL } = require('bunyan');

/**
 * LogCounter simply counts the number of each kind of logging statement and the modules that triggered it.
 * This implementation is loosely based on the RingBuffer implementation.
 */
class LogCounter extends EventEmitter {
  constructor() {
    super();
    this._trace = new CountInfo();
    this._debug = new CountInfo();
    this._info = new CountInfo();
    this._warn = new CountInfo();
    this._error = new CountInfo();
    this._fatal = new CountInfo();
  }

  get trace() { return this._trace; }
  get debug() { return this._debug; }
  get info() { return this._info; }
  get warn() { return this._warn; }
  get error() { return this._error; }
  get fatal() { return this._fatal; }

  write(record) {
    switch(record.level) {
    case TRACE: this._trace.increment(record.module); break;
    case DEBUG: this._debug.increment(record.module); break;
    case INFO: this._info.increment(record.module); break;
    case WARN: this._warn.increment(record.module); break;
    case ERROR: this._error.increment(record.module); break;
    case FATAL: this._fatal.increment(record.module); break;
    }
    return true;
  }

  end() {}

  destroy() {
    this.emit('close');
  }

  destroySoon() {
    this.destroy();
  }
}

class CountInfo {
  constructor() {
    this._count = 0;
    this._modules = new Map();
  }

  get count() { return this._count; }
  get modules() { return Array.from(this._modules.keys()); }

  increment(module) {
    this._count++;
    this._modules.set(module, true);
  }
}

module.exports = LogCounter;
