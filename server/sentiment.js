// simple wrapper around the `sentiment` package to provide analyzeEmotion
const Sentiment = require('sentiment');
const analyzer = new Sentiment();

function analyzeEmotion(text) {
  const result = analyzer.analyze(text || '');
  return { score: result.score, comparative: result.comparative };
}

module.exports = { default: { analyzeEmotion }, analyzeEmotion };
