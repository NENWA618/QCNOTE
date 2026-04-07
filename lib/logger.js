"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.info = info;
exports.warn = warn;
exports.error = error;
// simple logger wrapper so we can control verbosity or redirect to remote in future
var isDev = process.env.NODE_ENV !== 'production';
function sendRemote(level, msg) {
    var url = process.env.LOG_ENDPOINT;
    if (!url)
        return;
    try {
        // fire-and-forget POST, do not block
        var body = JSON.stringify({ level: level, message: msg, time: new Date().toISOString() });
        // eslint-disable-next-line no-void
        void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body });
    }
    catch (_a) {
        // ignore failures
    }
}
function info() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    if (isDev)
        console.log.apply(console, __spreadArray(['[QCNOTE]'], args, false));
    sendRemote('info', args);
}
function warn() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.warn.apply(console, __spreadArray(['[QCNOTE]'], args, false));
    sendRemote('warn', args);
}
function error() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    console.error.apply(console, __spreadArray(['[QCNOTE]'], args, false));
    sendRemote('error', args);
}
var logger = { info: info, warn: warn, error: error };
exports.default = logger;
