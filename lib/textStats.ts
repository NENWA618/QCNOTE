/**
 * 笔记字数统计（中英文混排）。
 *
 * 中文没有空格分词，`split(/\s+/)` 会把整段中文算成 1 个词；而 `string.length`
 * 又把空白、换行、Markdown 符号都算进去。这里按 Word 的口径：
 * 字数 = 汉字/假名/谚文的个数 + 西文单词的个数。
 */

export interface TextStats {
  /** 字数：CJK 字符个数 + 西文单词个数 */
  words: number;
  /** 不含空白的字符数 */
  chars: number;
  /** 预计阅读分钟数；没有内容为 0，有内容至少 1 */
  readingMinutes: number;
}

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD_RE = /[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu;

/** 中文约 400 字/分钟，英文约 220 词/分钟 */
const CJK_PER_MINUTE = 400;
const WORDS_PER_MINUTE = 220;

export function computeTextStats(text: string): TextStats {
  if (!text) return { words: 0, chars: 0, readingMinutes: 0 };

  const cjk = text.match(CJK_RE)?.length ?? 0;
  // 先去掉 CJK 字符再数西文单词，否则连着写的中英文会被当成一个词
  const latin = text.replace(CJK_RE, ' ').match(WORD_RE)?.length ?? 0;
  const chars = Array.from(text.replace(/\s/g, '')).length;
  const words = cjk + latin;
  const readingMinutes =
    words === 0 ? 0 : Math.max(1, Math.ceil(cjk / CJK_PER_MINUTE + latin / WORDS_PER_MINUTE));

  return { words, chars, readingMinutes };
}
