import { useEffect, useRef, useState } from 'react';
import SentimentUtil from '../../lib/sentiment';

const LABELS = { positive: '正面', negative: '低落', neutral: '平静' } as const;

/**
 * 情绪分析要扫一遍全文：只在打开笔记时立即算，输入时等停顿 800ms 再算，
 * 而不是每次按键（每次渲染）都分析一次，长笔记会拖慢输入。返回状态栏用的文案。
 */
export function useNoteSentiment(
  noteId: string | undefined,
  title: string | undefined,
  content: string | undefined,
): string {
  const [sentiment, setSentiment] = useState<{
    noteId: string;
    score: number;
    comparative: number;
  } | null>(null);
  const analyzedNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (noteId === undefined) return;

    const delay = analyzedNoteIdRef.current === noteId ? 800 : 0;
    const debounceId = window.setTimeout(() => {
      try {
        const result = SentimentUtil.analyzeEmotion(`${title} ${content}`);
        analyzedNoteIdRef.current = noteId;
        setSentiment({ noteId, ...result });
        window.dispatchEvent(
          new CustomEvent('qcnote:sentiment-update', {
            detail: { noteId, ...result, title },
          }),
        );
      } catch (e) {
        console.warn('[NoteEditor] 无法更新情感状态', e);
      }
    }, delay);

    return () => {
      window.clearTimeout(debounceId);
    };
  }, [noteId, title, content]);

  const category =
    sentiment && sentiment.noteId === noteId
      ? SentimentUtil.getSentimentCategory(sentiment.score, sentiment.comparative)
      : 'neutral';
  return `当前情绪：${LABELS[category as keyof typeof LABELS] ?? LABELS.neutral}`;
}
