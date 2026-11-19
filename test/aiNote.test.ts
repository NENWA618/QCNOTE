import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanAIContent,
  cleanAITitle,
  deriveTitleFromContent,
  parseStructuredNote,
} from '../lib/aiNote';
import { buildAIRequest, canRequestStructuredNote, generateNote } from '../lib/aiClient';

describe('cleanAIContent', () => {
  it('去掉思考过程', () => {
    expect(cleanAIContent('<think>想一想</think>\n\n答案')).toBe('答案');
    expect(cleanAIContent('想一想\n</think>\n答案')).toBe('答案');
  });

  it('拆掉外层的 markdown 围栏，但不动真正的代码块', () => {
    expect(cleanAIContent('```markdown\n# 标题\n正文\n```')).toBe('# 标题\n正文');
    expect(cleanAIContent('```ts\nconst a = 1;\n```')).toBe('```ts\nconst a = 1;\n```');
  });

  it('压缩多余空行和行尾空格，代码块内部保持原样', () => {
    const input = '甲  \n\n\n\n乙   \n```\nx\n\n\n\ny   \n```\n\n\n丙';
    expect(cleanAIContent(input)).toBe('甲  \n\n乙\n```\nx\n\n\n\ny   \n```\n\n丙');
  });
});

describe('cleanAITitle', () => {
  it('去掉引号、Markdown 记号和结尾标点', () => {
    expect(cleanAITitle('「**React 入门**」。')).toBe('React 入门');
    expect(cleanAITitle('# 标题\n第二行')).toBe('标题');
  });
  it('过长时截断，非字符串返回空串', () => {
    expect(Array.from(cleanAITitle('字'.repeat(100))).length).toBe(41);
    expect(cleanAITitle(undefined)).toBe('');
  });
});

describe('deriveTitleFromContent / parseStructuredNote', () => {
  it('只认正文里的 Markdown 标题，忽略代码块里的 #', () => {
    expect(deriveTitleFromContent('```\n# 注释\n```\n## 真标题\n正文')).toBe('真标题');
    expect(deriveTitleFromContent('没有标题的正文')).toBe('');
  });
  it('解析结构化输出，容忍 json 围栏，格式不对时返回 null', () => {
    expect(parseStructuredNote('{"content":"正文","title":"“短标题”"}')).toEqual({
      content: '正文',
      title: '短标题',
    });
    expect(parseStructuredNote('```json\n{"content":"a","title":"b"}\n```')).toEqual({
      content: 'a',
      title: 'b',
    });
    expect(parseStructuredNote('普通文本')).toBeNull();
    expect(parseStructuredNote('{"title":"x"}')).toBeNull();
  });
});

describe('结构化请求不改动提问', () => {
  const base = { apiEndpoint: 'https://x.test', apiKey: 'k', modelName: 'm', prompt: '你好' };

  it('三种支持的格式都只多一个 schema，提问原样不变', () => {
    const chat = buildAIRequest({ ...base, structured: true }).body as any;
    expect(chat.messages).toEqual([{ role: 'user', content: '你好' }]);
    expect(chat.response_format.json_schema.schema.required).toEqual(['content', 'title']);

    const resp = buildAIRequest({ ...base, provider: 'openai-responses', structured: true })
      .body as any;
    expect(resp.input).toBe('你好');
    expect(resp.text.format.type).toBe('json_schema');

    const gem = buildAIRequest({ ...base, provider: 'gemini', structured: true }).body as any;
    expect(gem.contents).toEqual([{ role: 'user', parts: [{ text: '你好' }] }]);
    expect(gem.generationConfig.responseMimeType).toBe('application/json');
  });

  it('Gemini Interactions：response_format 带 schema，提问不变', () => {
    const body = buildAIRequest({ ...base, provider: 'gemini-interactions', structured: true })
      .body as any;
    expect(body.input).toBe('你好');
    expect(body.response_format).toMatchObject({ type: 'text', mime_type: 'application/json' });
    expect(body.response_format.schema.required).toEqual(['content', 'title']);
  });

  it('DeepSeek：结构化请求改发同级的 /responses，提问不变', () => {
    const req = buildAIRequest({
      ...base,
      provider: 'deepseek',
      apiEndpoint: 'https://api.deepseek.com/chat/completions',
      structured: true,
    });
    expect(req.url).toBe('https://api.deepseek.com/responses');
    expect(req.headers.Authorization).toBe('Bearer k');
    const body = req.body as any;
    expect(body.input).toBe('你好');
    expect(body.messages).toBeUndefined();
    expect(body.text.format.type).toBe('json_schema');
  });

  it('DeepSeek 地址不是 /chat/completions 形状时推不出 /responses，不发结构化请求', () => {
    const params = { provider: 'deepseek' as const, apiEndpoint: 'https://proxy.test/ds' };
    expect(canRequestStructuredNote(params)).toBe(false);
    expect(buildAIRequest({ ...base, ...params, structured: true }).body).toEqual({
      model: 'm',
      messages: [{ role: 'user', content: '你好' }],
    });
  });

  it('不要求结构化时，所有接口的请求都不带 schema', () => {
    expect((buildAIRequest(base).body as any).response_format).toBeUndefined();
    expect(
      (buildAIRequest({ ...base, provider: 'gemini-interactions' }).body as any).response_format,
    ).toBeUndefined();
  });
});

describe('generateNote', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const base = { apiEndpoint: 'https://x.test', apiKey: 'k', modelName: 'm', prompt: '你好' };
  const chatOk = (content: string) =>
    ({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    }) as unknown as Response;
  const rejected = (status: number) =>
    ({ ok: false, status, statusText: 'Bad', text: async () => '' }) as unknown as Response;

  it('结构化返回：取出整理后的正文和短标题', async () => {
    fetchMock.mockResolvedValue(
      chatOk(JSON.stringify({ content: '你好呀\n\n\n\n再见', title: '打招呼' })),
    );
    expect(await generateNote(base)).toEqual({ title: '打招呼', content: '你好呀\n\n再见' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('服务拒绝 json_schema（400）时退回普通请求，且普通请求里没有 schema', async () => {
    fetchMock
      .mockResolvedValueOnce(rejected(400))
      .mockResolvedValueOnce(chatOk('<think>x</think>## 问候\n你好'));
    expect(await generateNote(base)).toEqual({ title: '问候', content: '## 问候\n你好' });
    const fallbackBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body)) as {
      response_format?: unknown;
    };
    expect(fallbackBody.response_format).toBeUndefined();
  });

  it('401 等其他错误不重试，直接抛出', async () => {
    fetchMock.mockResolvedValue(rejected(401));
    await expect(generateNote(base)).rejects.toThrow('请求失败：401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('DeepSeek：先发 /responses 结构化请求，取出正文和标题', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          { type: 'reasoning' },
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify({ content: '你好', title: '问候' }) },
            ],
          },
        ],
      }),
    } as unknown as Response);
    const note = await generateNote({
      ...base,
      provider: 'deepseek',
      apiEndpoint: 'https://api.deepseek.com/chat/completions',
    });
    expect(note).toEqual({ title: '问候', content: '你好' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepseek.com/responses');
  });

  it('DeepSeek 的 /responses 不存在（404）时，退回原来的 Chat 地址', async () => {
    fetchMock.mockResolvedValueOnce(rejected(404)).mockResolvedValueOnce(chatOk('正文'));
    const note = await generateNote({
      ...base,
      provider: 'deepseek',
      apiEndpoint: 'https://proxy.test/chat/completions',
    });
    expect(note).toEqual({ title: '', content: '正文' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://proxy.test/chat/completions');
  });

  it('服务忽略 schema、直接返回普通文本时，当作普通回答处理', async () => {
    fetchMock.mockResolvedValue(chatOk('# 标题\n正文'));
    expect(await generateNote(base)).toEqual({ title: '标题', content: '# 标题\n正文' });
  });
});
