import Sentiment from 'sentiment';

const analyzer = new Sentiment();

export function analyzeEmotion(text: string): { score: number; comparative: number } {
  const result = analyzer.analyze(text);
  return { score: result.score, comparative: result.comparative };
}

const SentimentUtil = { analyzeEmotion };
export default SentimentUtil;