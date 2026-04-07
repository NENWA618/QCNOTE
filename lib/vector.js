"use strict";
// simple bag-of-words vectorizer and cosine similarity
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeVector = computeVector;
exports.cosine = cosine;
// tokenize by non-word characters, lowercase
function tokenize(text) {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(function (w) { return w.length > 0; });
}
function computeVector(text) {
    var tokens = tokenize(text);
    var vec = {};
    tokens.forEach(function (t) {
        vec[t] = (vec[t] || 0) + 1;
    });
    // normalize by length
    var len = Math.sqrt(Object.values(vec).reduce(function (sum, v) { return sum + v * v; }, 0));
    if (len > 0) {
        Object.keys(vec).forEach(function (k) {
            vec[k] = vec[k] / len;
        });
    }
    return vec;
}
function cosine(a, b) {
    var sum = 0;
    for (var k in a) {
        if (b[k])
            sum += a[k] * b[k];
    }
    return sum; // vectors assumed normalized
}
var VectorUtil = { computeVector: computeVector, cosine: cosine };
exports.default = VectorUtil;
