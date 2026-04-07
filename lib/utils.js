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
exports.Utils = void 0;
exports.Utils = {
    formatDate: function (timestamp) {
        var date = new Date(timestamp);
        var today = new Date();
        var yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === today.toDateString()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        else if (date.toDateString() === yesterday.toDateString()) {
            return '昨天';
        }
        else {
            return date.toLocaleDateString('zh-CN');
        }
    },
    getRelativeTime: function (timestamp) {
        var now = Date.now();
        var diff = now - timestamp;
        var seconds = Math.floor(diff / 1000);
        var minutes = Math.floor(seconds / 60);
        var hours = Math.floor(minutes / 60);
        var days = Math.floor(hours / 24);
        if (seconds < 60)
            return '刚刚';
        if (minutes < 60)
            return "".concat(minutes, "\u5206\u949F\u524D");
        if (hours < 24)
            return "".concat(hours, "\u5C0F\u65F6\u524D");
        if (days < 30)
            return "".concat(days, "\u5929\u524D");
        return this.formatDate(timestamp);
    },
    truncateText: function (text, length) {
        if (length === void 0) { length = 100; }
        if (!text)
            return '';
        if (text.length <= length)
            return text;
        return text.substring(0, length) + '...';
    },
    getColorPalette: function () {
        return ['#dc96b4', '#b0a8c0', '#d8cbcf', '#f6e0e7', '#9fb1d0', '#c9a8cc', '#d4b5d1', '#e5d1e0'];
    },
    generateId: function () {
        return "".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    },
    /**
     * 高级搜索功能
     */
    searchNotes: function (notes, query) {
        var _this = this;
        if (!query.trim())
            return notes;
        var tokens = this.parseSearchQuery(query);
        return notes.filter(function (note) { return _this.matchesSearchTokens(note, tokens); });
    },
    /**
     * 解析搜索查询，支持字段限定和操作符
     */
    parseSearchQuery: function (query) {
        // 支持的格式：
        // title:关键词 content:内容 tag:标签 category:分类 date:2024-01-01..2024-12-31
        // 关键词1 AND 关键词2 OR 关键词3 NOT 关键词4
        var tokens = [];
        var parts = query.split(/\s+(AND|OR|NOT)\s+/i);
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i].trim();
            if (!part)
                continue;
            if (part.toUpperCase() === 'AND' || part.toUpperCase() === 'OR' || part.toUpperCase() === 'NOT') {
                // 操作符，应用到下一个token
                if (i + 1 < parts.length) {
                    var nextToken = this.parseSingleToken(parts[i + 1]);
                    nextToken.operator = part.toUpperCase();
                    tokens.push(nextToken);
                    i++; // 跳过下一个
                }
            }
            else {
                tokens.push(this.parseSingleToken(part));
            }
        }
        return tokens;
    },
    parseSingleToken: function (token) {
        var fieldMatch = token.match(/^(\w+):(.+)$/);
        if (fieldMatch) {
            var field = fieldMatch[1], value = fieldMatch[2];
            return { field: field, value: value, operator: 'AND' };
        }
        return { value: token, operator: 'AND' };
    },
    matchesSearchTokens: function (note, tokens) {
        // 简单实现：所有AND条件必须满足，OR条件只要一个满足，NOT条件不能满足
        var hasOrMatch = false;
        var hasAndMatch = true;
        for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
            var token = tokens_1[_i];
            var matches = this.matchesSingleToken(note, token);
            if (token.operator === 'OR') {
                if (matches)
                    hasOrMatch = true;
            }
            else if (token.operator === 'NOT') {
                if (matches)
                    return false; // NOT条件满足则不匹配
            }
            else { // AND
                if (!matches)
                    hasAndMatch = false;
            }
        }
        // 如果有OR条件，必须至少一个OR匹配；AND条件必须全部匹配
        return hasAndMatch && (tokens.some(function (t) { return t.operator === 'OR'; }) ? hasOrMatch : true);
    },
    matchesSingleToken: function (note, token) {
        var searchValue = token.value.toLowerCase();
        if (token.field) {
            switch (token.field.toLowerCase()) {
                case 'title':
                    return note.title.toLowerCase().includes(searchValue);
                case 'content':
                    return note.content.toLowerCase().includes(searchValue);
                case 'tag':
                    return note.tags.some(function (tag) { return tag.toLowerCase().includes(searchValue); });
                case 'category':
                    return note.category.toLowerCase().includes(searchValue);
                case 'date':
                    return this.matchesDateRange(note.createdAt, searchValue);
                default:
                    return false;
            }
        }
        else {
            // 全局搜索
            return (note.title.toLowerCase().includes(searchValue) ||
                note.content.toLowerCase().includes(searchValue) ||
                note.tags.some(function (tag) { return tag.toLowerCase().includes(searchValue); }) ||
                note.category.toLowerCase().includes(searchValue));
        }
    },
    matchesDateRange: function (timestamp, dateRange) {
        // 支持格式：2024-01-01 或 2024-01-01..2024-12-31
        var date = new Date(timestamp);
        var _a = dateRange.split('..'), start = _a[0], end = _a[1];
        if (end) {
            var startDate = new Date(start);
            var endDate = new Date(end);
            return date >= startDate && date <= endDate;
        }
        else {
            var targetDate = new Date(start);
            return date.toDateString() === targetDate.toDateString();
        }
    },
    /**
     * 模糊搜索（简单实现）
     */
    fuzzySearch: function (text, query) {
        if (!query)
            return true;
        var queryLower = query.toLowerCase();
        var textLower = text.toLowerCase();
        var queryIndex = 0;
        for (var i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
            if (textLower[i] === queryLower[queryIndex]) {
                queryIndex++;
            }
        }
        return queryIndex === queryLower.length;
    },
    escapeHtml: function (text) {
        var div = typeof document !== 'undefined'
            ? document.createElement('div')
            : { textContent: '' };
        if (typeof document !== 'undefined')
            div.textContent = text;
        return div.innerHTML || '';
    },
    copyToClipboard: function (text) {
        return navigator.clipboard.writeText(text).catch(function (err) {
            console.error('复制失败:', err);
            return false;
        });
    },
    getTextSummary: function (html, length) {
        if (length === void 0) { length = 100; }
        if (typeof document === 'undefined')
            return '';
        var div = document.createElement('div');
        div.innerHTML = html;
        var text = div.textContent || div.innerText || '';
        return this.truncateText(text.replace(/\s+/g, ' '), length);
    },
    sortNotes: function (notes, sortBy) {
        if (sortBy === void 0) { sortBy = 'date'; }
        var sorted = __spreadArray([], notes, true);
        switch (sortBy) {
            case 'date':
                sorted.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
                break;
            case 'title':
                sorted.sort(function (a, b) { return a.title.localeCompare(b.title, 'zh'); });
                break;
            case 'color':
                sorted.sort(function (a, b) { return a.color.localeCompare(b.color); });
                break;
            case 'favorite':
                sorted.sort(function (a, b) { return Number(b.isFavorite) - Number(a.isFavorite); });
                break;
            default:
                sorted.sort(function (a, b) { return b.createdAt - a.createdAt; });
        }
        return sorted;
    },
    prefersDarkMode: function () {
        return (typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-color-scheme: dark)').matches);
    },
    debounce: function (func, wait) {
        if (wait === void 0) { wait = 300; }
        var timeout = null;
        return function executedFunction() {
            var _args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                _args[_i] = arguments[_i];
            }
            var later = function () {
                if (timeout)
                    clearTimeout(timeout);
                func.apply(void 0, _args);
            };
            if (timeout)
                clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    throttle: function (func, limit) {
        if (limit === void 0) { limit = 300; }
        var inThrottle = false;
        return function () {
            var _args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                _args[_i] = arguments[_i];
            }
            if (!inThrottle) {
                func.apply(this, _args);
                inThrottle = true;
                setTimeout(function () { return (inThrottle = false); }, limit);
            }
        };
    },
    estimateReadingTime: function (text) {
        var wordsPerMinute = 200;
        var words = text.trim().split(/\s+/).length;
        var minutes = Math.ceil(words / wordsPerMinute);
        return minutes > 0 ? minutes : 1;
    },
    getWordFrequency: function (texts, limit) {
        if (limit === void 0) { limit = 20; }
        var freq = {};
        texts.forEach(function (text) {
            var words = text.toLowerCase().match(/[\u4e00-\u9fa5\w]+/g) || [];
            words.forEach(function (word) {
                if (word.length > 1) {
                    freq[word] = (freq[word] || 0) + 1;
                }
            });
        });
        return Object.entries(freq)
            .sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, limit)
            .map(function (_a) {
            var word = _a[0], count = _a[1];
            return ({ word: word, count: count });
        });
    },
};
exports.default = exports.Utils;
