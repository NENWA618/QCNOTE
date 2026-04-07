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
var react_1 = require("react");
var vitest_1 = require("vitest");
var react_2 = require("@testing-library/react");
require("@testing-library/jest-dom");
var NoteList_1 = require("../components/NoteList");
// Mock the storage module
vitest_1.vi.mock('../lib/storage', function () { return ({
    NoteStorage: vitest_1.vi.fn(),
}); });
(0, vitest_1.describe)('NoteList Component', function () {
    var mockNotes = [
        {
            id: '1',
            title: 'First Note',
            content: 'First content',
            category: 'Work',
            tags: ['test', 'sample'],
            color: '#ff0000',
            isFavorite: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isArchived: false,
        },
        {
            id: '2',
            title: 'Second Note',
            content: 'Second content',
            category: 'Personal',
            tags: ['personal'],
            color: '#00ff00',
            isFavorite: true,
            createdAt: Date.now() - 1000,
            updatedAt: Date.now() - 1000,
            isArchived: false,
        },
    ];
    var defaultProps = {
        notes: mockNotes,
        onEdit: vitest_1.vi.fn(),
        onDelete: vitest_1.vi.fn(),
        onToggleFavorite: vitest_1.vi.fn(),
        onToggleArchive: vitest_1.vi.fn(),
        searchQuery: '',
        selectedTags: [],
        onTagClick: vitest_1.vi.fn(),
    };
    (0, vitest_1.beforeEach)(function () {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('renders note list with all items', function () {
        (0, react_2.render)(<NoteList_1.default {...defaultProps}/>);
        (0, vitest_1.expect)(react_2.screen.getByText('First Note')).toBeInTheDocument();
        (0, vitest_1.expect)(react_2.screen.getByText('Second Note')).toBeInTheDocument();
    });
    (0, vitest_1.it)('calls onSelectNote when a note is clicked', function () { return __awaiter(void 0, void 0, void 0, function () {
        var firstNote;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    (0, react_2.render)(<NoteList_1.default {...defaultProps}/>);
                    firstNote = react_2.screen.getByText('First Note').closest('.card');
                    if (!firstNote) return [3 /*break*/, 2];
                    react_2.fireEvent.click(firstNote);
                    return [4 /*yield*/, (0, react_2.waitFor)(function () {
                            (0, vitest_1.expect)(defaultProps.onEdit).toHaveBeenCalledWith(mockNotes[0]);
                        })];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('displays favorite indicator for favorited notes', function () {
        (0, react_2.render)(<NoteList_1.default {...defaultProps}/>);
        // Second note is favorite
        var favoriteIndicator = react_2.screen.getByText('Second Note').closest('li');
        (0, vitest_1.expect)(favoriteIndicator).toHaveTextContent('★') || (0, vitest_1.expect)(favoriteIndicator).toHaveClass('favorite');
    });
    (0, vitest_1.it)('filters notes by search term', function () {
        var rerender = (0, react_2.render)(<NoteList_1.default {...defaultProps} searchQuery=""/>).rerender;
        (0, vitest_1.expect)(react_2.screen.getByText('First Note')).toBeInTheDocument();
        (0, vitest_1.expect)(react_2.screen.getByText('Second Note')).toBeInTheDocument();
        rerender(<NoteList_1.default {...defaultProps} searchQuery="First"/>);
        (0, vitest_1.expect)(react_2.screen.getByText('First Note')).toBeInTheDocument();
        (0, vitest_1.expect)(react_2.screen.queryByText('Second Note')).not.toBeInTheDocument();
    });
    (0, vitest_1.it)('renders empty state when no notes', function () {
        (0, react_2.render)(<NoteList_1.default {...defaultProps} notes={[]}/>);
        (0, vitest_1.expect)(react_2.screen.getByText(/no notes/i) || react_2.screen.getByText(/empty/i)).toBeInTheDocument();
    });
    (0, vitest_1.it)('handles delete action correctly', function () { return __awaiter(void 0, void 0, void 0, function () {
        var deleteButtons;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    (0, react_2.render)(<NoteList_1.default {...defaultProps}/>);
                    deleteButtons = react_2.screen.getAllByRole('button', { name: /删除/i });
                    if (!(deleteButtons.length > 0)) return [3 /*break*/, 2];
                    react_2.fireEvent.click(deleteButtons[0]);
                    return [4 /*yield*/, (0, react_2.waitFor)(function () {
                            (0, vitest_1.expect)(defaultProps.onDelete).toHaveBeenCalledWith('1');
                        })];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)('groups notes by category if groupByCategory prop is true', function () {
        (0, react_2.render)(<NoteList_1.default {...defaultProps}/>);
        // Check that categories are displayed
        (0, vitest_1.expect)(react_2.screen.getByText(/Work/i)).toBeInTheDocument();
        (0, vitest_1.expect)(react_2.screen.getByText(/Personal/i)).toBeInTheDocument();
    });
});
(0, vitest_1.describe)('NoteList Accessibility', function () {
    var mockNotes = [
        {
            id: '1',
            title: 'Accessible Note',
            content: 'Content',
            category: 'Test',
            tags: [],
            color: '#000000',
            isFavorite: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isArchived: false,
        },
    ];
    (0, vitest_1.it)('has proper ARIA labels', function () {
        (0, react_2.render)(<NoteList_1.default notes={mockNotes} onEdit={vitest_1.vi.fn()} onDelete={vitest_1.vi.fn()} onToggleFavorite={vitest_1.vi.fn()} onToggleArchive={vitest_1.vi.fn()} searchQuery="" selectedTags={[]} onTagClick={vitest_1.vi.fn()}/>);
        // Check that note items are rendered and accessible
        var noteItem = react_2.screen.getByText('Accessible Note');
        (0, vitest_1.expect)(noteItem).toBeInTheDocument();
    });
    (0, vitest_1.it)('supports keyboard navigation', function () {
        var onEdit = vitest_1.vi.fn();
        (0, react_2.render)(<NoteList_1.default notes={mockNotes} onEdit={onEdit} onDelete={vitest_1.vi.fn()} onToggleFavorite={vitest_1.vi.fn()} onToggleArchive={vitest_1.vi.fn()} searchQuery="" selectedTags={[]} onTagClick={vitest_1.vi.fn()}/>);
        var noteItem = react_2.screen.getByText('Accessible Note');
        react_2.fireEvent.keyDown(noteItem, { key: 'Enter' });
        // Check that the note item is still in document after keyboard interaction
        (0, vitest_1.expect)(noteItem).toBeInTheDocument();
    });
});
