"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.NoteStorage = void 0;
exports.initWindowStorage = initWindowStorage;
var utils_1 = require("./utils");
var idb_1 = require("./idb");
var logger_1 = require("./logger");
var indexer_1 = require("./indexer");
var NoteStorage = /** @class */ (function () {
    function NoteStorage() {
        this.storageKey = 'QCNOTE_STORAGE';
        this.settingsKey = 'QCNOTE_SETTINGS';
        this.webdavConfigKey = 'QCNOTE_WEBDAV_CONFIG';
        this.conflictsKey = 'QCNOTE_CONFLICTS';
        this.useIndexedDB = false;
        this.init();
        // 自动检查 IndexedDB 是否可用
        this.detectIndexedDB();
    }
    NoteStorage.prototype._warnSyncUsage = function (method) {
        if (typeof window !== 'undefined') {
            // keep message concise to aid debugging during migration
            console.warn("[NoteStorage] Deprecated sync method used: ".concat(method, ". Prefer using the async variant (e.g. ").concat(method, "Async)."));
        }
    };
    // 自动检测 IndexedDB 是否已初始化
    NoteStorage.prototype.detectIndexedDB = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (typeof window === 'undefined')
                            return [2 /*return*/];
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, idb_1.default.getItem(this.storageKey)];
                    case 2:
                        data = _a.sent();
                        if (data) {
                            this.useIndexedDB = true;
                            logger_1.default.info('✓ 检测到 IndexedDB 数据，自动启用');
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        e_1 = _a.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.parseWikiLinks = function (text) {
        var re = /\[\[([^\]]+)\]\]/g;
        var links = new Set();
        var match;
        while ((match = re.exec(text)) !== null) {
            var label = match[1].trim();
            if (label)
                links.add(label);
        }
        return Array.from(links);
    };
    NoteStorage.prototype.normalizeNote = function (note) {
        return __assign(__assign({}, note), { links: note.links || [], backlinks: note.backlinks || [], versions: note.versions || [] });
    };
    NoteStorage.prototype.syncLinkGraph = function (notes) {
        var _this = this;
        var titleToId = new Map();
        notes.forEach(function (note) {
            titleToId.set(note.title, note.id);
        });
        var backlinksMap = new Map();
        var enriched = notes.map(function (note) {
            var normalizedNote = _this.normalizeNote(note);
            var links = _this.parseWikiLinks(normalizedNote.content);
            links.forEach(function (linkTitle) {
                var _a;
                var targetId = titleToId.get(linkTitle);
                if (!targetId)
                    return;
                if (!backlinksMap.has(targetId))
                    backlinksMap.set(targetId, new Set());
                (_a = backlinksMap.get(targetId)) === null || _a === void 0 ? void 0 : _a.add(normalizedNote.id);
            });
            return __assign(__assign({}, normalizedNote), { links: links });
        });
        return enriched.map(function (note) { return (__assign(__assign({}, note), { backlinks: Array.from(backlinksMap.get(note.id) || []) })); });
    };
    /**
     * Internal helpers for localStorage access.
     *
     * These used to be the public sync methods (getData/setData)
     * but those have been removed from the public API.  We keep
     * private helpers here so that the async methods can fall back
     * to localStorage when IndexedDB is unavailable.  They are
     * intentionally not exported or documented.
     */
    NoteStorage.prototype._getDataLocal = function () {
        var raw = localStorage.getItem(this.storageKey);
        return raw ? JSON.parse(raw) : null;
    };
    NoteStorage.prototype._setDataLocal = function (notes) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(notes));
            return true;
        }
        catch (e) {
            console.error('[NoteStorage] _setDataLocal failed', e);
            return false;
        }
    };
    NoteStorage.prototype.arrayBufferToBase64 = function (buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        for (var i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };
    NoteStorage.prototype.base64ToArrayBuffer = function (base64) {
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    };
    NoteStorage.prototype.deriveKey = function (passphrase, salt) {
        return __awaiter(this, void 0, void 0, function () {
            var encoder, baseKey;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        encoder = new TextEncoder();
                        return [4 /*yield*/, crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])];
                    case 1:
                        baseKey = _a.sent();
                        return [2 /*return*/, crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt.buffer, iterations: 250000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])];
                }
            });
        });
    };
    NoteStorage.prototype.encryptText = function (plain, passphrase) {
        return __awaiter(this, void 0, void 0, function () {
            var encoder, salt, iv, key, encrypted, combined;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        encoder = new TextEncoder();
                        salt = crypto.getRandomValues(new Uint8Array(16));
                        iv = crypto.getRandomValues(new Uint8Array(12));
                        return [4 /*yield*/, this.deriveKey(passphrase, salt)];
                    case 1:
                        key = _a.sent();
                        return [4 /*yield*/, crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoder.encode(plain))];
                    case 2:
                        encrypted = _a.sent();
                        combined = new Uint8Array(salt.byteLength + iv.byteLength + encrypted.byteLength);
                        combined.set(salt, 0);
                        combined.set(iv, salt.byteLength);
                        combined.set(new Uint8Array(encrypted), salt.byteLength + iv.byteLength);
                        return [2 /*return*/, this.arrayBufferToBase64(combined.buffer)];
                }
            });
        });
    };
    NoteStorage.prototype.decryptText = function (cipherText, passphrase) {
        return __awaiter(this, void 0, void 0, function () {
            var encoder, combined, salt, iv, data, key, decrypted;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        encoder = new TextDecoder();
                        combined = new Uint8Array(this.base64ToArrayBuffer(cipherText));
                        salt = combined.slice(0, 16);
                        iv = combined.slice(16, 28);
                        data = combined.slice(28);
                        return [4 /*yield*/, this.deriveKey(passphrase, salt)];
                    case 1:
                        key = _a.sent();
                        return [4 /*yield*/, crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data)];
                    case 2:
                        decrypted = _a.sent();
                        return [2 /*return*/, encoder.decode(decrypted)];
                }
            });
        });
    };
    NoteStorage.prototype.getWebDAVConfigAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var config, data, raw, encryptedPart, _a, e_2, e_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 8, , 9]);
                        config = null;
                        if (!this.useIndexedDB) return [3 /*break*/, 2];
                        return [4 /*yield*/, idb_1.default.getItem(this.webdavConfigKey)];
                    case 1:
                        data = _b.sent();
                        if (data)
                            config = data;
                        _b.label = 2;
                    case 2:
                        if (!config) {
                            raw = localStorage.getItem(this.webdavConfigKey);
                            config = raw ? JSON.parse(raw) : null;
                        }
                        if (!(config && config.password)) return [3 /*break*/, 7];
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 6, , 7]);
                        if (!config.password.startsWith('encrypted:')) return [3 /*break*/, 5];
                        encryptedPart = config.password.slice('encrypted:'.length);
                        _a = config;
                        return [4 /*yield*/, this.decryptText(encryptedPart, 'qcnote-webdav-default')];
                    case 4:
                        _a.password = _b.sent();
                        _b.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        e_2 = _b.sent();
                        console.warn('[NoteStorage] Failed to decrypt WebDAV password', e_2);
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/, config];
                    case 8:
                        e_3 = _b.sent();
                        console.error('[NoteStorage] getWebDAVConfigAsync failed', e_3);
                        return [2 /*return*/, null];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.setWebDAVConfigAsync = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            var configToStore, encrypted, e_4, _a, e_5;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 10, , 11]);
                        configToStore = __assign({}, config);
                        if (!(configToStore.password && !configToStore.password.startsWith('encrypted:'))) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.encryptText(configToStore.password, 'qcnote-webdav-default')];
                    case 2:
                        encrypted = _b.sent();
                        configToStore.password = "encrypted:".concat(encrypted);
                        return [3 /*break*/, 4];
                    case 3:
                        e_4 = _b.sent();
                        console.warn('[NoteStorage] Failed to encrypt WebDAV password, storing plaintext', e_4);
                        return [3 /*break*/, 4];
                    case 4:
                        if (!this.useIndexedDB) return [3 /*break*/, 6];
                        return [4 /*yield*/, idb_1.default.setItem(this.webdavConfigKey, configToStore)];
                    case 5:
                        _b.sent();
                        return [3 /*break*/, 9];
                    case 6:
                        _b.trys.push([6, 8, , 9]);
                        return [4 /*yield*/, idb_1.default.setItem(this.webdavConfigKey, configToStore)];
                    case 7:
                        _b.sent();
                        this.useIndexedDB = true;
                        localStorage.removeItem(this.webdavConfigKey);
                        return [3 /*break*/, 9];
                    case 8:
                        _a = _b.sent();
                        localStorage.setItem(this.webdavConfigKey, JSON.stringify(configToStore));
                        return [3 /*break*/, 9];
                    case 9: return [2 /*return*/, true];
                    case 10:
                        e_5 = _b.sent();
                        console.error('[NoteStorage] setWebDAVConfigAsync failed', e_5);
                        return [2 /*return*/, false];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.clearWebDAVConfigAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var e_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        if (!this.useIndexedDB) return [3 /*break*/, 2];
                        return [4 /*yield*/, idb_1.default.setItem(this.webdavConfigKey, null)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        localStorage.removeItem(this.webdavConfigKey);
                        return [2 /*return*/, true];
                    case 3:
                        e_6 = _a.sent();
                        console.error('[NoteStorage] clearWebDAVConfigAsync failed', e_6);
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.getConflictsAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var data, raw, e_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        if (!this.useIndexedDB) return [3 /*break*/, 2];
                        return [4 /*yield*/, idb_1.default.getItem(this.conflictsKey)];
                    case 1:
                        data = _a.sent();
                        if (data)
                            return [2 /*return*/, data];
                        _a.label = 2;
                    case 2:
                        raw = localStorage.getItem(this.conflictsKey);
                        return [2 /*return*/, raw ? JSON.parse(raw) : []];
                    case 3:
                        e_7 = _a.sent();
                        console.error('[NoteStorage] getConflictsAsync failed', e_7);
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.setConflictsAsync = function (conflicts) {
        return __awaiter(this, void 0, void 0, function () {
            var _1, e_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        if (!this.useIndexedDB) return [3 /*break*/, 2];
                        return [4 /*yield*/, idb_1.default.setItem(this.conflictsKey, conflicts)];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, idb_1.default.setItem(this.conflictsKey, conflicts)];
                    case 3:
                        _a.sent();
                        this.useIndexedDB = true;
                        return [3 /*break*/, 5];
                    case 4:
                        _1 = _a.sent();
                        localStorage.setItem(this.conflictsKey, JSON.stringify(conflicts));
                        return [3 /*break*/, 5];
                    case 5: return [2 /*return*/, true];
                    case 6:
                        e_8 = _a.sent();
                        console.error('[NoteStorage] setConflictsAsync failed', e_8);
                        return [2 /*return*/, false];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.addConflictAsync = function (conflict) {
        return __awaiter(this, void 0, void 0, function () {
            var conflicts;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getConflictsAsync()];
                    case 1:
                        conflicts = _a.sent();
                        conflicts.push(conflict);
                        return [2 /*return*/, this.setConflictsAsync(conflicts)];
                }
            });
        });
    };
    NoteStorage.prototype.resolveConflictAsync = function (id, resolvedNote) {
        return __awaiter(this, void 0, void 0, function () {
            var conflicts, index, notes, noteIndex;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getConflictsAsync()];
                    case 1:
                        conflicts = _a.sent();
                        index = conflicts.findIndex(function (c) { return c.id === id; });
                        if (index === -1)
                            return [2 /*return*/, false];
                        conflicts.splice(index, 1);
                        return [4 /*yield*/, this.setConflictsAsync(conflicts)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.getDataAsync()];
                    case 3:
                        notes = (_a.sent()) || [];
                        noteIndex = notes.findIndex(function (n) { return n.id === id; });
                        if (noteIndex !== -1) {
                            notes[noteIndex] = resolvedNote;
                        }
                        else {
                            notes.push(resolvedNote);
                        }
                        return [2 /*return*/, this.setDataAsync(notes)];
                }
            });
        });
    };
    NoteStorage.prototype.webdavFetch = function (method, url, config, body) {
        return __awaiter(this, void 0, void 0, function () {
            var headers;
            return __generator(this, function (_a) {
                headers = {
                    'Content-Type': 'application/octet-stream',
                };
                if (config.username && config.password) {
                    headers.Authorization = "Basic ".concat(btoa("".concat(config.username, ":").concat(config.password)));
                }
                return [2 /*return*/, fetch(url, { method: method, headers: headers, body: body })];
            });
        });
    };
    NoteStorage.prototype.normalizeWebDAVUrl = function (config) {
        var base = config.url.trim().replace(/\/+$/, '');
        var path = config.remotePath.trim().replace(/^\/+/, '');
        return "".concat(base, "/").concat(path);
    };
    NoteStorage.prototype.pushToWebDAVAsync = function (config_1) {
        return __awaiter(this, arguments, void 0, function (config, encrypt) {
            var allNotes, payload, url, response, e_9;
            if (encrypt === void 0) { encrypt = true; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (typeof fetch !== 'function' || typeof window === 'undefined') {
                            console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
                            return [2 /*return*/, false];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        return [4 /*yield*/, this.getDataAsync()];
                    case 2:
                        allNotes = (_a.sent()) || [];
                        payload = JSON.stringify(allNotes);
                        if (!(encrypt && config.encryptionKey && config.encryptionKey.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.encryptText(payload, config.encryptionKey)];
                    case 3:
                        payload = _a.sent();
                        _a.label = 4;
                    case 4:
                        url = this.normalizeWebDAVUrl(config);
                        return [4 /*yield*/, this.webdavFetch('PUT', url, config, payload)];
                    case 5:
                        response = _a.sent();
                        return [2 /*return*/, response.ok];
                    case 6:
                        e_9 = _a.sent();
                        console.error('[NoteStorage] pushToWebDAVAsync failed', e_9);
                        return [2 /*return*/, false];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.pullFromWebDAVAsync = function (config_1) {
        return __awaiter(this, arguments, void 0, function (config, decrypt) {
            var url, response, raw, content, remoteNotes, localNotes, localMap, mergedNotes, conflicts, _i, remoteNotes_1, remote, local, strategy, _loop_1, _a, localNotes_1, local, e_10;
            if (decrypt === void 0) { decrypt = true; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (typeof fetch !== 'function' || typeof window === 'undefined') {
                            console.warn('[NoteStorage] WebDAV 仅在浏览器环境支持');
                            return [2 /*return*/, false];
                        }
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 10, , 11]);
                        url = this.normalizeWebDAVUrl(config);
                        return [4 /*yield*/, this.webdavFetch('GET', url, config)];
                    case 2:
                        response = _b.sent();
                        if (!response.ok) {
                            console.warn('[NoteStorage] pullFromWebDAVAsync 读取失败', response.status);
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, response.text()];
                    case 3:
                        raw = _b.sent();
                        content = raw;
                        if (!(decrypt && config.encryptionKey && config.encryptionKey.length > 0)) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.decryptText(raw, config.encryptionKey)];
                    case 4:
                        content = _b.sent();
                        _b.label = 5;
                    case 5:
                        remoteNotes = JSON.parse(content);
                        if (!Array.isArray(remoteNotes)) {
                            throw new Error('WebDAV 数据格式错误');
                        }
                        return [4 /*yield*/, this.getDataAsync()];
                    case 6:
                        localNotes = (_b.sent()) || [];
                        localMap = new Map(localNotes.map(function (n) { return [n.id, n]; }));
                        mergedNotes = [];
                        conflicts = [];
                        for (_i = 0, remoteNotes_1 = remoteNotes; _i < remoteNotes_1.length; _i++) {
                            remote = remoteNotes_1[_i];
                            local = localMap.get(remote.id);
                            if (local) {
                                // Check for conflict: if local is newer or content differs
                                if (local.updatedAt > remote.updatedAt || local.content !== remote.content || local.title !== remote.title) {
                                    strategy = config.conflictStrategy || 'manual';
                                    if (strategy === 'prefer-local') {
                                        mergedNotes.push(local);
                                    }
                                    else if (strategy === 'prefer-remote') {
                                        mergedNotes.push(remote);
                                    }
                                    else {
                                        // manual
                                        conflicts.push({
                                            id: remote.id,
                                            local: local,
                                            remote: remote,
                                            resolved: false,
                                            createdAt: Date.now(),
                                        });
                                        mergedNotes.push(local);
                                    }
                                }
                                else {
                                    // Remote is same or newer, use remote
                                    mergedNotes.push(remote);
                                }
                            }
                            else {
                                // New remote note
                                mergedNotes.push(remote);
                            }
                        }
                        _loop_1 = function (local) {
                            if (!remoteNotes.some(function (r) { return r.id === local.id; })) {
                                mergedNotes.push(local);
                            }
                        };
                        // Add local notes not in remote
                        for (_a = 0, localNotes_1 = localNotes; _a < localNotes_1.length; _a++) {
                            local = localNotes_1[_a];
                            _loop_1(local);
                        }
                        return [4 /*yield*/, this.setDataAsync(mergedNotes)];
                    case 7:
                        _b.sent();
                        if (!(conflicts.length > 0)) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.setConflictsAsync(conflicts)];
                    case 8:
                        _b.sent();
                        _b.label = 9;
                    case 9: return [2 /*return*/, true];
                    case 10:
                        e_10 = _b.sent();
                        console.error('[NoteStorage] pullFromWebDAVAsync failed', e_10);
                        return [2 /*return*/, false];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.enableIndexedDB = function () {
        return __awaiter(this, void 0, void 0, function () {
            var existing, notes, settings, backupKey, bkErr_1, e_11;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (typeof window === 'undefined')
                            return [2 /*return*/, false];
                        if (this.useIndexedDB)
                            return [2 /*return*/, true]; // 已启用，跳过
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 11, , 12]);
                        return [4 /*yield*/, idb_1.default.getItem(this.storageKey)];
                    case 2:
                        existing = _a.sent();
                        if (existing && Array.isArray(existing) && existing.length > 0) {
                            this.useIndexedDB = true;
                            logger_1.default.info('✓ IndexedDB 已有数据，保留现有数据，启用索引存储');
                            return [2 /*return*/, true];
                        }
                        notes = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
                        settings = JSON.parse(localStorage.getItem(this.settingsKey) || 'null');
                        if (!(notes && Array.isArray(notes) && notes.length > 0)) return [3 /*break*/, 10];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        backupKey = "".concat(this.storageKey, "_backup_").concat(Date.now());
                        return [4 /*yield*/, idb_1.default.setItem(backupKey, notes)];
                    case 4:
                        _a.sent();
                        logger_1.default.info('✓ 本地数据已备份到 IndexedDB 键：', backupKey);
                        return [3 /*break*/, 6];
                    case 5:
                        bkErr_1 = _a.sent();
                        console.warn('备份 localStorage 数据到 IndexedDB 失败，继续迁移：', bkErr_1);
                        return [3 /*break*/, 6];
                    case 6: return [4 /*yield*/, idb_1.default.setItem(this.storageKey, notes)];
                    case 7:
                        _a.sent();
                        if (!settings) return [3 /*break*/, 9];
                        return [4 /*yield*/, idb_1.default.setItem(this.settingsKey, settings)];
                    case 8:
                        _a.sent();
                        _a.label = 9;
                    case 9:
                        this.useIndexedDB = true;
                        // 清空 localStorage
                        localStorage.removeItem(this.storageKey);
                        localStorage.removeItem(this.settingsKey);
                        logger_1.default.info('✓ IndexedDB 已启用，数据迁移成功');
                        return [2 /*return*/, true];
                    case 10:
                        // 两边均无数据：启用 IndexedDB（但不写入空数组）
                        this.useIndexedDB = true;
                        logger_1.default.info('✓ IndexedDB 已启用（无需迁移）');
                        return [2 /*return*/, true];
                    case 11:
                        e_11 = _a.sent();
                        console.error('启用IndexedDB失败:', e_11);
                        return [2 /*return*/, false];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    // disable IndexedDB usage (keeps data in place)
    NoteStorage.prototype.disableIndexedDB = function () {
        this.useIndexedDB = false;
    };
    // async accessors that respect IndexedDB when enabled
    NoteStorage.prototype.getDataAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var idbData, lsData, e_12;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, idb_1.default.getItem(this.storageKey)];
                    case 1:
                        idbData = _a.sent();
                        if (idbData) {
                            this.useIndexedDB = true; // 确保标志正确设置
                            return [2 /*return*/, idbData.map(function (note) { return _this.normalizeNote(note); })];
                        }
                        lsData = this._getDataLocal();
                        if (lsData) {
                            return [2 /*return*/, lsData.map(function (note) { return _this.normalizeNote(note); })];
                        }
                        return [2 /*return*/, null];
                    case 2:
                        e_12 = _a.sent();
                        console.error('读取存储失败:', e_12);
                        // IndexedDB 出错，回退到 localStorage
                        return [2 /*return*/, this._getDataLocal()];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.setDataAsync = function (notes) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedNotes, _2, e_13;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        normalizedNotes = notes.map(function (note) { return _this.normalizeNote(note); });
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        if (!this.useIndexedDB) return [3 /*break*/, 3];
                        return [4 /*yield*/, idb_1.default.setItem(this.storageKey, normalizedNotes)];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, idb_1.default.setItem(this.storageKey, notes)];
                    case 4:
                        _a.sent();
                        this.useIndexedDB = true;
                        // 清空 localStorage
                        localStorage.removeItem(this.storageKey);
                        return [3 /*break*/, 6];
                    case 5:
                        _2 = _a.sent();
                        // IndexedDB 失败，回退到本地 localStorage
                        this._setDataLocal(normalizedNotes);
                        return [3 /*break*/, 6];
                    case 6:
                        // 一旦本地数据写入成功，尝试同步到服务器（如果可用）
                        this.syncWithServer(notes).catch(function (err) {
                            // 静默失败，服务器可能离线
                            logger_1.default.warn('[NoteStorage] 同步服务器失败', err);
                        });
                        return [2 /*return*/, true];
                    case 7:
                        e_13 = _a.sent();
                        console.error('保存存储失败:', e_13);
                        return [2 /*return*/, false];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    // 尝试将单条或多条笔记发送给后端
    NoteStorage.prototype.syncWithServer = function (notes) {
        return __awaiter(this, void 0, void 0, function () {
            var url, all, list, e_14;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // originally we avoided attempting network calls when running on server
                        // side (no "window"). for tests we prefer to simply check for a
                        // fetch implementation so that the polyfilled global.fetch is usable.
                        if (typeof fetch !== 'function')
                            return [2 /*return*/];
                        url = '/syncNote';
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        if (!!notes) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.getDataAsync()];
                    case 2:
                        all = _a.sent();
                        if (!all)
                            return [2 /*return*/];
                        notes = all;
                        _a.label = 3;
                    case 3:
                        list = Array.isArray(notes) ? notes : [notes];
                        // send requests in parallel; avoid throwing for individual failures
                        return [4 /*yield*/, Promise.allSettled(list.map(function (note) {
                                return fetch(url, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(note),
                                });
                            }))];
                    case 4:
                        // send requests in parallel; avoid throwing for individual failures
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        e_14 = _a.sent();
                        console.debug('[NoteStorage] 无法同步到服务器', e_14);
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.init = function () {
        // 如果已启用 IndexedDB，跳过 localStorage 初始化
        // 因为数据已经在 IndexedDB 中了
        if (this.useIndexedDB) {
            return;
        }
        if (!localStorage.getItem(this.storageKey)) {
            localStorage.setItem(this.storageKey, JSON.stringify([]));
        }
        if (!localStorage.getItem(this.settingsKey)) {
            localStorage.setItem(this.settingsKey, JSON.stringify({
                theme: 'light',
                sortBy: 'date',
                itemsPerPage: 12,
                defaultCategory: '生活',
            }));
        }
    };
    NoteStorage.prototype.getSettingsAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var idbSettings, settings, e_15, settings;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, idb_1.default.getItem(this.settingsKey)];
                    case 1:
                        idbSettings = _a.sent();
                        if (idbSettings) {
                            this.useIndexedDB = true;
                            return [2 /*return*/, idbSettings];
                        }
                        settings = localStorage.getItem(this.settingsKey);
                        return [2 /*return*/, settings ? JSON.parse(settings) : null];
                    case 2:
                        e_15 = _a.sent();
                        console.error('读取设置失败:', e_15);
                        settings = localStorage.getItem(this.settingsKey);
                        return [2 /*return*/, settings ? JSON.parse(settings) : null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.setSettingsAsync = function (settings) {
        return __awaiter(this, void 0, void 0, function () {
            var _3, e_16;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        if (!this.useIndexedDB) return [3 /*break*/, 2];
                        return [4 /*yield*/, idb_1.default.setItem(this.settingsKey, settings)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, idb_1.default.setItem(this.settingsKey, settings)];
                    case 3:
                        _a.sent();
                        this.useIndexedDB = true;
                        localStorage.removeItem(this.settingsKey);
                        return [2 /*return*/, true];
                    case 4:
                        _3 = _a.sent();
                        // fallback to localStorage
                        localStorage.setItem(this.settingsKey, JSON.stringify(settings));
                        return [2 /*return*/, true];
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        e_16 = _a.sent();
                        console.error('保存设置失败:', e_16);
                        return [2 /*return*/, false];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.addNoteAsync = function (note) {
        return __awaiter(this, void 0, void 0, function () {
            var notes, newNote, updatedNotes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        newNote = {
                            id: "note_".concat(Date.now()),
                            title: note.title || '无标题',
                            content: note.content || '',
                            category: note.category || '生活',
                            tags: note.tags || [],
                            color: note.color || '#dc96b4',
                            isFavorite: false,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            isArchived: false,
                            links: [],
                            backlinks: [],
                            versions: [],
                        };
                        notes.unshift(newNote);
                        updatedNotes = this.syncLinkGraph(notes);
                        return [4 /*yield*/, this.setDataAsync(updatedNotes)];
                    case 2:
                        _a.sent();
                        indexer_1.default.invalidateIndex(); // Invalidate search index cache
                        return [2 /*return*/, updatedNotes.find(function (n) { return n.id === newNote.id; })];
                }
            });
        });
    };
    NoteStorage.prototype.updateNoteAsync = function (id, updates) {
        return __awaiter(this, void 0, void 0, function () {
            var notes, index, existing, version, updatedVersionList, updatedNotes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        index = notes.findIndex(function (n) { return n.id === id; });
                        if (!(index !== -1)) return [3 /*break*/, 3];
                        existing = notes[index];
                        version = {
                            versionId: "ver_".concat(Date.now()),
                            title: existing.title,
                            content: existing.content,
                            category: existing.category,
                            tags: __spreadArray([], existing.tags, true),
                            color: existing.color,
                            isFavorite: existing.isFavorite,
                            isArchived: existing.isArchived,
                            updatedAt: existing.updatedAt,
                        };
                        updatedVersionList = __spreadArray(__spreadArray([], (existing.versions || []), true), [version], false).slice(-20);
                        notes[index] = __assign(__assign(__assign({}, existing), updates), { updatedAt: Date.now(), versions: updatedVersionList });
                        updatedNotes = this.syncLinkGraph(notes);
                        return [4 /*yield*/, this.setDataAsync(updatedNotes)];
                    case 2:
                        _a.sent();
                        indexer_1.default.invalidateIndex(); // Invalidate search index cache
                        return [2 /*return*/, updatedNotes.find(function (n) { return n.id === id; }) || null];
                    case 3: return [2 /*return*/, null];
                }
            });
        });
    };
    NoteStorage.prototype.deleteNoteAsync = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var notes, index, updatedNotes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        index = notes.findIndex(function (n) { return n.id === id; });
                        if (!(index !== -1)) return [3 /*break*/, 3];
                        notes[index] = __assign(__assign({}, notes[index]), { isDeleted: true, deletedAt: Date.now(), updatedAt: Date.now() });
                        updatedNotes = this.syncLinkGraph(notes);
                        return [4 /*yield*/, this.setDataAsync(updatedNotes)];
                    case 2:
                        _a.sent();
                        indexer_1.default.invalidateIndex(); // Invalidate search index cache
                        return [2 /*return*/, true];
                    case 3: return [2 /*return*/, false];
                }
            });
        });
    };
    NoteStorage.prototype.permanentlyDeleteNoteAsync = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var notes, filteredNotes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        filteredNotes = notes.filter(function (n) { return n.id !== id; });
                        return [4 /*yield*/, this.setDataAsync(filteredNotes)];
                    case 2:
                        _a.sent();
                        indexer_1.default.invalidateIndex(); // Invalidate search index cache
                        return [2 /*return*/, true];
                }
            });
        });
    };
    NoteStorage.prototype.restoreNoteAsync = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var notes, note, updatedNotes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        note = notes.find(function (n) { return n.id === id; });
                        if (!(note && note.isDeleted)) return [3 /*break*/, 3];
                        note.isDeleted = false;
                        note.deletedAt = undefined;
                        note.updatedAt = Date.now();
                        updatedNotes = this.syncLinkGraph(notes);
                        return [4 /*yield*/, this.setDataAsync(updatedNotes)];
                    case 2:
                        _a.sent();
                        indexer_1.default.invalidateIndex(); // Invalidate search index cache
                        return [2 /*return*/, true];
                    case 3: return [2 /*return*/, false];
                }
            });
        });
    };
    NoteStorage.prototype.getTrashNotesAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var notes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        return [2 /*return*/, notes.filter(function (n) { return n.isDeleted; })];
                }
            });
        });
    };
    NoteStorage.prototype.getNoteAsync = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var notes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        return [2 /*return*/, notes.find(function (n) { return n.id === id; })];
                }
            });
        });
    };
    NoteStorage.prototype.searchNotesAsync = function (keyword_1) {
        return __awaiter(this, arguments, void 0, function (keyword, includeDeleted) {
            var notes, filtered, lowerKeyword;
            if (includeDeleted === void 0) { includeDeleted = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        filtered = notes;
                        if (!includeDeleted) {
                            filtered = filtered.filter(function (n) { return !n.isDeleted; });
                        }
                        if (!keyword)
                            return [2 /*return*/, filtered];
                        lowerKeyword = keyword.toLowerCase();
                        return [2 /*return*/, filtered.filter(function (note) {
                                return note.title.toLowerCase().includes(lowerKeyword) ||
                                    note.content.toLowerCase().includes(lowerKeyword) ||
                                    note.tags.some(function (tag) { return tag.toLowerCase().includes(lowerKeyword); });
                            })];
                }
            });
        });
    };
    NoteStorage.prototype.getNotesByCategoryAsync = function (category_1) {
        return __awaiter(this, arguments, void 0, function (category, includeDeleted) {
            var notes, filtered;
            if (includeDeleted === void 0) { includeDeleted = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        filtered = notes;
                        if (!includeDeleted) {
                            filtered = filtered.filter(function (n) { return !n.isDeleted; });
                        }
                        if (category === 'all')
                            return [2 /*return*/, filtered];
                        return [2 /*return*/, filtered.filter(function (n) { return n.category === category; })];
                }
            });
        });
    };
    NoteStorage.prototype.getFavoriteNotesAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var notes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        return [2 /*return*/, notes.filter(function (n) { return !n.isDeleted && n.isFavorite; })];
                }
            });
        });
    };
    NoteStorage.prototype.toggleFavoriteAsync = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var notes, note;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        note = notes.find(function (n) { return n.id === id; });
                        if (!note) return [3 /*break*/, 3];
                        note.isFavorite = !note.isFavorite;
                        return [4 /*yield*/, this.setDataAsync(notes)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, note.isFavorite];
                    case 3: return [2 /*return*/, null];
                }
            });
        });
    };
    NoteStorage.prototype.getCategoriesAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var notes, categories;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        categories = new Set(notes.map(function (n) { return n.category; }));
                        return [2 /*return*/, Array.from(categories).sort()];
                }
            });
        });
    };
    NoteStorage.prototype.getAllTagsAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var notes, tagsSet;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        tagsSet = new Set();
                        notes.forEach(function (note) {
                            note.tags.forEach(function (tag) { return tagsSet.add(tag); });
                        });
                        return [2 /*return*/, Array.from(tagsSet).sort()];
                }
            });
        });
    };
    NoteStorage.prototype.exportToJSON = function () {
        return __awaiter(this, void 0, void 0, function () {
            var notes, dataStr, dataBlob, url, link;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_a.sent()) || [];
                        dataStr = JSON.stringify(notes, null, 2);
                        if (typeof window === 'undefined')
                            return [2 /*return*/];
                        dataBlob = new Blob([dataStr], { type: 'application/json' });
                        url = URL.createObjectURL(dataBlob);
                        link = document.createElement('a');
                        link.href = url;
                        link.download = "QCNOTE_backup_".concat(Date.now(), ".json");
                        link.click();
                        URL.revokeObjectURL(url);
                        return [2 /*return*/];
                }
            });
        });
    };
    NoteStorage.prototype.importFromJSON = function (file) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var _a;
                try {
                    var result = (_a = e.target) === null || _a === void 0 ? void 0 : _a.result;
                    var notes_1 = JSON.parse(result);
                    if (Array.isArray(notes_1)) {
                        if (_this.useIndexedDB) {
                            idb_1.default.setItem(_this.storageKey, notes_1).then(function () { return resolve(notes_1.length); });
                        }
                        else {
                            _this._setDataLocal(notes_1);
                            resolve(notes_1.length);
                        }
                    }
                    else {
                        reject('无效的JSON格式');
                    }
                }
                catch (error) {
                    var msg = error instanceof Error ? error.message : String(error);
                    reject('导入失败: ' + msg);
                }
            };
            reader.onerror = function () { return reject('读取文件失败'); };
            reader.readAsText(file);
        });
    };
    NoteStorage.prototype.clearAllAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (typeof window === 'undefined')
                            return [2 /*return*/, false];
                        if (!this.useIndexedDB) return [3 /*break*/, 2];
                        return [4 /*yield*/, idb_1.default.clearStore()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        localStorage.removeItem(this.storageKey);
                        _a.label = 3;
                    case 3:
                        this.init();
                        return [2 /*return*/, true];
                }
            });
        });
    };
    NoteStorage.prototype.getStatsAsync = function () {
        return __awaiter(this, void 0, void 0, function () {
            var notes, aliveNotes, categories, categoryStats;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getDataAsync()];
                    case 1:
                        notes = (_b.sent()) || [];
                        aliveNotes = notes.filter(function (n) { return !n.isDeleted; });
                        return [4 /*yield*/, this.getCategoriesAsync()];
                    case 2:
                        categories = _b.sent();
                        categoryStats = {};
                        categories.forEach(function (cat) {
                            categoryStats[cat] = aliveNotes.filter(function (n) { return n.category === cat; }).length;
                        });
                        _a = {
                            totalNotes: aliveNotes.length,
                            favoriteNotes: aliveNotes.filter(function (n) { return n.isFavorite; }).length,
                            archivedNotes: aliveNotes.filter(function (n) { return n.isArchived; }).length,
                            categories: categoryStats
                        };
                        return [4 /*yield*/, this.getAllTagsAsync()];
                    case 3: return [2 /*return*/, (_a.totalTags = (_b.sent()).length,
                            _a.createdToday = aliveNotes.filter(function (n) {
                                var today = new Date().toDateString();
                                return new Date(n.createdAt).toDateString() === today;
                            }).length,
                            _a)];
                }
            });
        });
    };
    return NoteStorage;
}());
exports.NoteStorage = NoteStorage;
function initWindowStorage() {
    if (typeof window === 'undefined')
        return null;
    // 检查是否已经存在全局 storage，避免重复创建
    if (window.storage instanceof NoteStorage) {
        return window.storage;
    }
    var s = new NoteStorage();
    window.storage = s;
    // optionally expose Utils
    window.Utils = utils_1.default;
    return s;
}
exports.default = NoteStorage;
