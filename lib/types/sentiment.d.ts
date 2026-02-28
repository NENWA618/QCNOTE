declare module 'sentiment' {
  interface SentimentOptions {
    extras?: Record<string, number>;
    language?: string;
  }

  interface SentimentResult {
    score: number;
    comparative: number;
    calculation: Array<{[word:string]: number}>;
    tokens: string[];
    words: string[];
    positive: string[];
    negative: string[];
  }

  class Sentiment {
    constructor(opts?: SentimentOptions);
    analyze(text: string): SentimentResult;
  }

  export default Sentiment;
}
