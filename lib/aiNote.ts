/**
 * 把模型的原始输出整理成可以直接存进笔记的内容和标题。
 *
 * 这里只做确定性的代码处理，不会向模型追加任何提示词：用户输入原样发给模型，
 * 这样既不会影响模型选择的语言，也不会改变它的回答。
 */

/** 笔记标题的最大长度（按字符计，中英文一视同仁） */
export const MAX_NOTE_TITLE_LENGTH = 40;

export interface ParsedNote {
  title: string;
  content: string;
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * 对每一段“不在代码块里”的文字调用 fn，代码块原样保留。
 * 整理空行和行尾空格时不能碰代码块，否则会改坏代码。
 */
function mapOutsideFences(text: string, fn: (chunk: string) => string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let buffer: string[] = [];
  let fence: { char: string; length: number } | null = null;

  const flush = () => {
    if (buffer.length > 0) {
      out.push(fn(buffer.join('\n')));
      buffer = [];
    }
  };

  for (const line of lines) {
    if (fence) {
      out.push(line);
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      flush();
      fence = { char: open[1][0], length: open[1].length };
      out.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return out.join('\n');
}

/** 去掉推理模型夹在正文里的思考过程（<think>…</think> 等） */
function stripReasoning(text: string): string {
  let result = text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '');
  // 成对的都删掉后还剩结束标签，说明服务吃掉了开头的 <think>，结束标签之前全是思考过程
  let cut = -1;
  for (const m of result.matchAll(/<\/(?:think|thinking|reasoning)>/gi)) {
    cut = m.index + m[0].length;
  }
  if (cut !== -1) result = result.slice(cut);
  return result;
}

/**
 * 模型有时会把整篇回答包进一个 ```markdown 围栏里。
 * 只拆标了 markdown / md 的围栏；没标语言的围栏多半就是一段真正的代码回答，不能动。
 */
function unwrapMarkdownFence(text: string): string {
  const match = text.match(/^(`{3,}|~{3,})(?:markdown|md)[ \t]*\n([\s\S]*)\n\1[ \t]*$/i);
  return match ? match[2] : text;
}

/** 整理模型的原始输出：去思考过程、拆外层围栏、统一换行、压缩多余空行和行尾空格 */
export function cleanAIContent(raw: string): string {
  let text = raw.replace(/\r\n?/g, '\n');
  text = stripReasoning(text).trim();
  text = unwrapMarkdownFence(text).trim();
  text = mapOutsideFences(text, (chunk) => {
    const lines: string[] = [];
    for (const raw of chunk.split('\n')) {
      // 行尾恰好两个空格是 Markdown 的硬换行，保留；其余行尾空白去掉
      const line = /[^ \t] {2}$/.test(raw) ? raw : raw.replace(/[ \t]+$/, '');
      // 连续空行只留一个（含紧贴代码块的那一侧）
      if (line === '' && lines[lines.length - 1] === '') continue;
      lines.push(line);
    }
    return lines.join('\n');
  });
  return text.trim();
}

/** 去掉 Markdown 记号和包裹符号，得到适合做标题的一行纯文字 */
function toPlainLine(raw: string): string {
  return (
    raw
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0)
      ?.replace(/^#{1,6}\s+/, '')
      .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim() ?? ''
  );
}

/** 整理模型给的标题；整理后为空则返回空串，由调用方决定怎么兜底 */
export function cleanAITitle(raw: unknown, max = MAX_NOTE_TITLE_LENGTH): string {
  if (typeof raw !== 'string') return '';
  let line = toPlainLine(raw).replace(/[。.!！?？:：,，;；、]+$/, '');
  // 整个标题被一对引号/书名号包住时才拆掉；只包一部分的（如 《三体》读后感）要保留
  const pairs: Record<string, string> = {
    '"': '"',
    "'": "'",
    '“': '”',
    '‘': '’',
    '「': '」',
    '『': '』',
    '《': '》',
    '【': '】',
  };
  if (line.length > 2 && pairs[line[0]] === line[line.length - 1]) line = line.slice(1, -1).trim();
  const chars = Array.from(line);
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : line;
}

/** 模型没有给标题时，从正文结构里找：只认第一个 Markdown 标题，没有就返回空串 */
export function deriveTitleFromContent(content: string): string {
  let heading = '';
  mapOutsideFences(content, (chunk) => {
    if (!heading) {
      const m = chunk.match(/^ {0,3}#{1,6}[ \t]+(.+)$/m);
      if (m) heading = m[1];
    }
    return chunk;
  });
  return cleanAITitle(heading);
}

/** 解析结构化输出：{ content, title }。解析失败返回 null，调用方把原文当普通回答处理 */
export function parseStructuredNote(text: string): ParsedNote | null {
  let json = text.trim();
  // 个别服务即使要求了 JSON 也会套一层 ```json 围栏
  const fenced = json.match(/^```(?:json)?[ \t]*\n([\s\S]*?)\n```$/i);
  if (fenced) json = fenced[1];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { content, title } = data as Record<string, unknown>;
  if (typeof content !== 'string' || !content.trim()) return null;
  return { content: cleanAIContent(content), title: cleanAITitle(title) };
}
