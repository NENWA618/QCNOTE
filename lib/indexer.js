"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIndex = buildIndex;
exports.loadIndex = loadIndex;
exports.invalidateIndex = invalidateIndex;
exports.preloadCache = preloadCache;
exports.searchNotes = searchNotes;
var lunr_1 = require("lunr");
var idb_1 = require("./idb");
var vector_1 = require("./vector");
var sentiment_1 = require("./sentiment");
var INDEX_KEY = 'QCNOTE_LUNR_INDEX';
var VECTOR_KEY = 'QCNOTE_VECTORS';
var SENTIMENT_KEY = 'QCNOTE_SENTIMENTS';
var NOTES_HASH_KEY = 'QCNOTE_HASH'; // Track notes hash to detect changes
// Cache state for performance
var cachedIndex = null;
var cachedVectors = null;
var cachedSentiments = null;
var cachedNotesHash = null;
var indexDirty = true; // Flag to track if index needs rebuild
/**
 * Compute a simple hash of notes to detect changes
 * @param notes Array of notes to hash
 */
function computeNotesHash(notes) {
    var notesStr = notes.map(function (n) { return "".concat(n.id, ":").concat(n.updatedAt); }).join('|');
    return notesStr; // Simple hash - could use crypto for production
}
/**
 * Check if notes have changed since last index build
 */
function isIndexDirty(notes, currentHash) {
    return currentHash !== cachedNotesHash;
}
// build index from a list of notes
function buildIndex(notes) {
    return __awaiter(this, void 0, void 0, function () {
        var notesHash, idx, e_1, vectors, sentiments, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    notesHash = computeNotesHash(notes);
                    // Check if index is already cached and valid
                    if (!indexDirty &&
                        cachedIndex &&
                        cachedVectors &&
                        cachedSentiments &&
                        cachedNotesHash === notesHash) {
                        return [2 /*return*/, cachedIndex];
                    }
                    idx = (0, lunr_1.default)(function () {
                        var _this = this;
                        this.ref('id');
                        this.field('title');
                        this.field('content');
                        notes.forEach(function (n) {
                            _this.add({ id: n.id, title: n.title, content: n.content });
                        });
                    });
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, idb_1.default.setItem(INDEX_KEY, idx.toJSON())];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    console.warn('unable to save search index', e_1);
                    return [3 /*break*/, 4];
                case 4:
                    vectors = {};
                    sentiments = {};
                    notes.forEach(function (n) {
                        var text = "".concat(n.title, " ").concat(n.content);
                        vectors[n.id] = vector_1.default.computeVector(text);
                        sentiments[n.id] = sentiment_1.default.analyzeEmotion(text);
                    });
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 9, , 10]);
                    return [4 /*yield*/, idb_1.default.setItem(VECTOR_KEY, vectors)];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, idb_1.default.setItem(SENTIMENT_KEY, sentiments)];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, idb_1.default.setItem(NOTES_HASH_KEY, notesHash)];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 10];
                case 9:
                    e_2 = _a.sent();
                    console.warn('unable to save vector/sentiment data', e_2);
                    return [3 /*break*/, 10];
                case 10:
                    // Update cache
                    cachedIndex = idx;
                    cachedVectors = vectors;
                    cachedSentiments = sentiments;
                    cachedNotesHash = notesHash;
                    indexDirty = false;
                    return [2 /*return*/, idx];
            }
        });
    });
}
// load existing index from IndexedDB, or null if not found
function loadIndex() {
    return __awaiter(this, void 0, void 0, function () {
        var data, e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, idb_1.default.getItem(INDEX_KEY)];
                case 1:
                    data = _a.sent();
                    if (data) {
                        return [2 /*return*/, lunr_1.default.Index.load(data)];
                    }
                    return [3 /*break*/, 3];
                case 2:
                    e_3 = _a.sent();
                    console.warn('error loading search index', e_3);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/, null];
            }
        });
    });
}
/**
 * Mark index as dirty - call this when notes are modified
 */
function invalidateIndex() {
    indexDirty = true;
    cachedIndex = null;
    cachedVectors = null;
    cachedSentiments = null;
    cachedNotesHash = null;
}
/**
 * Preload cache from IndexedDB
 */
function preloadCache() {
    return __awaiter(this, void 0, void 0, function () {
        var idx, vectors, sentiments, hash, e_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    return [4 /*yield*/, loadIndex()];
                case 1:
                    idx = _a.sent();
                    return [4 /*yield*/, idb_1.default.getItem(VECTOR_KEY)];
                case 2:
                    vectors = _a.sent();
                    return [4 /*yield*/, idb_1.default.getItem(SENTIMENT_KEY)];
                case 3:
                    sentiments = _a.sent();
                    return [4 /*yield*/, idb_1.default.getItem(NOTES_HASH_KEY)];
                case 4:
                    hash = _a.sent();
                    if (idx)
                        cachedIndex = idx;
                    if (vectors)
                        cachedVectors = vectors;
                    if (sentiments)
                        cachedSentiments = sentiments;
                    if (hash)
                        cachedNotesHash = hash;
                    indexDirty = !idx; // If we loaded an index, it's not dirty
                    return [3 /*break*/, 6];
                case 5:
                    e_4 = _a.sent();
                    console.warn('error preloading cache', e_4);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// ensure index exists; if not, build from notes
function ensureIndex(notes) {
    return __awaiter(this, void 0, void 0, function () {
        var idx;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, loadIndex()];
                case 1:
                    idx = _a.sent();
                    if (!!idx) return [3 /*break*/, 3];
                    return [4 /*yield*/, buildIndex(notes)];
                case 2:
                    idx = _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/, idx];
            }
        });
    });
}
// search notes by query string; returns matching note ids in order
function searchNotes(query, notes) {
    return __awaiter(this, void 0, void 0, function () {
        var notesHash, idx, _a, results, hits, vectors, _b, qvec, sims, id, _i, sims_1, s, e_5;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    notesHash = computeNotesHash(notes);
                    if (!isIndexDirty(notes, notesHash)) return [3 /*break*/, 2];
                    return [4 /*yield*/, buildIndex(notes)];
                case 1:
                    _c.sent();
                    _c.label = 2;
                case 2:
                    _a = cachedIndex;
                    if (_a) return [3 /*break*/, 4];
                    return [4 /*yield*/, buildIndex(notes)];
                case 3:
                    _a = (_c.sent());
                    _c.label = 4;
                case 4:
                    idx = _a;
                    if (!idx)
                        return [2 /*return*/, []];
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 8, , 9]);
                    results = idx.search(query);
                    hits = results.map(function (r) { return r.ref; });
                    _b = cachedVectors;
                    if (_b) return [3 /*break*/, 7];
                    return [4 /*yield*/, idb_1.default.getItem(VECTOR_KEY)];
                case 6:
                    _b = (_c.sent());
                    _c.label = 7;
                case 7:
                    vectors = _b || {};
                    qvec = vector_1.default.computeVector(query);
                    sims = [];
                    for (id in vectors) {
                        sims.push({ id: id, score: vector_1.default.cosine(qvec, vectors[id]) });
                    }
                    sims.sort(function (a, b) { return b.score - a.score; });
                    for (_i = 0, sims_1 = sims; _i < sims_1.length; _i++) {
                        s = sims_1[_i];
                        if (!hits.includes(s.id) && s.score > 0.3) { // Increased threshold from 0.1 to 0.3
                            hits.push(s.id);
                        }
                    }
                    return [2 /*return*/, hits];
                case 8:
                    e_5 = _c.sent();
                    console.warn('search error', e_5);
                    return [2 /*return*/, []];
                case 9: return [2 /*return*/];
            }
        });
    });
}
var Indexer = {
    buildIndex: buildIndex,
    loadIndex: loadIndex,
    searchNotes: searchNotes,
    invalidateIndex: invalidateIndex,
    preloadCache: preloadCache,
};
exports.default = Indexer;
