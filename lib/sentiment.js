"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeEmotion = analyzeEmotion;
var sentiment_1 = require("sentiment");
var analyzer = new sentiment_1.default();
function analyzeEmotion(text) {
    var result = analyzer.analyze(text);
    return { score: result.score, comparative: result.comparative };
}
var SentimentUtil = { analyzeEmotion: analyzeEmotion };
exports.default = SentimentUtil;
