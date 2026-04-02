import Sentiment from 'sentiment';

const analyzer = new Sentiment();

export function analyzeEmotion(text: string) {
  const result = analyzer.analyze(text || '');
  return { score: result.score, comparative: result.comparative };
}

export default { analyzeEmotion };
