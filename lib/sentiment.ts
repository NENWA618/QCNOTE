import Sentiment from 'sentiment';

const analyzer = new Sentiment();

type SentimentCategory = 'positive' | 'neutral' | 'negative';

export function analyzeEmotion(text: string): { score: number; comparative: number } {
  const result = analyzer.analyze(text);
  return { score: result.score, comparative: result.comparative };
}

export function getSentimentCategory(score: number, comparative: number): SentimentCategory {
  const positiveThreshold = 0.25;
  const negativeThreshold = -0.25;
  if (comparative >= positiveThreshold || score >= 3) {
    return 'positive';
  }
  if (comparative <= negativeThreshold || score <= -3) {
    return 'negative';
  }
  return 'neutral';
}

const SentimentUtil = { analyzeEmotion, getSentimentCategory };
export default SentimentUtil;
