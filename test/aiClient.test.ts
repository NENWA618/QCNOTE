import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAIRequest, callAI, extractAIText } from '../lib/aiClient';
import {
  AI_PROVIDERS,
  AI_PROVIDER_ORDER,
  DEFAULT_AI_PROVIDER,
  normalizeAIProvider,
} from '../lib/aiProviders';

const base = { apiKey: 'SECRET-KEY', prompt: '你好' };

describe('buildAIRequest', () => {
  it('Chat Completions：Bearer 鉴权 + messages', () => {
    const req = buildAIRequest({
      ...base,
      apiEndpoint: 'https://x.test/v1/chat/completions',
      modelName: 'm',
    });
    expect(req.url).toBe('https://x.test/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer SECRET-KEY');
    expect(req.body).toEqual({ model: 'm', messages: [{ role: 'user', content: '你好' }] });
  });

  it('不传 provider 时与旧行为一致（Chat Completions）', () => {
    const a = buildAIRequest({ ...base, apiEndpoint: 'https://x.test', modelName: 'm' });
    const b = buildAIRequest({
      ...base,
      apiEndpoint: 'https://x.test',
      modelName: 'm',
      provider: 'openai-chat',
    });
    expect(a).toEqual(b);
  });

  it('DeepSeek：与 Chat Completions 同格式', () => {
    const req = buildAIRequest({
      ...base,
      provider: 'deepseek',
      apiEndpoint: AI_PROVIDERS.deepseek.defaultEndpoint,
      modelName: 'deepseek-v4-flash',
    });
    expect(req.url).toBe('https://api.deepseek.com/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer SECRET-KEY');
    expect(req.body).toEqual({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: '你好' }],
    });
  });

  it('Responses：input 字段，并关闭服务端存储', () => {
    const req = buildAIRequest({
      ...base,
      provider: 'openai-responses',
      apiEndpoint: 'https://api.openai.com/v1/responses',
      modelName: 'gpt-5.4',
    });
    expect(req.headers.Authorization).toBe('Bearer SECRET-KEY');
    expect(req.body).toEqual({ model: 'gpt-5.4', input: '你好', store: false });
  });

  it('Gemini：Key 放请求头而不是 URL，地址由基础地址和模型名拼出', () => {
    const req = buildAIRequest({
      ...base,
      provider: 'gemini',
      apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/',
      modelName: 'gemini-3.5-flash',
    });
    expect(req.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    );
    expect(req.url).not.toContain('SECRET-KEY');
    expect(req.headers['x-goog-api-key']).toBe('SECRET-KEY');
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body).toEqual({ contents: [{ role: 'user', parts: [{ text: '你好' }] }] });
  });

  it('Gemini：模型名带 models/ 前缀时不会重复；完整的 :generateContent 地址原样使用', () => {
    const prefixed = buildAIRequest({
      ...base,
      provider: 'gemini',
      apiEndpoint: 'https://g.test/v1beta',
      modelName: 'models/gemini-x',
    });
    expect(prefixed.url).toBe('https://g.test/v1beta/models/gemini-x:generateContent');

    const full = buildAIRequest({
      ...base,
      provider: 'gemini',
      apiEndpoint: 'https://proxy.test/custom/models/foo:generateContent',
      modelName: 'ignored',
    });
    expect(full.url).toBe('https://proxy.test/custom/models/foo:generateContent');
  });
});

describe('extractAIText', () => {
  it('Chat Completions / DeepSeek：取 choices[0].message.content，忽略 reasoning_content', () => {
    const data = {
      choices: [{ message: { content: '答案', reasoning_content: '思考过程' } }],
    };
    expect(extractAIText('openai-chat', data)).toBe('答案');
    expect(extractAIText('deepseek', data)).toBe('答案');
  });

  it('Responses：从 output 的 message 项拼接文本，跳过推理项', () => {
    const data = {
      output: [
        { type: 'reasoning', summary: [] },
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: '你好，' },
            { type: 'output_text', text: '世界' },
          ],
        },
      ],
    };
    expect(extractAIText('openai-responses', data)).toBe('你好，世界');
  });

  it('Responses：没有 output 数组时接受兼容服务给出的 output_text 字符串', () => {
    expect(extractAIText('openai-responses', { output_text: '直接给的' })).toBe('直接给的');
  });

  it('Gemini Interactions：Key 放请求头，store=false，基础地址自动补 /interactions', () => {
    const req = buildAIRequest({
      ...base,
      provider: 'gemini-interactions',
      apiEndpoint: 'https://g.test/v1beta/',
      modelName: 'gemini-3.5-flash',
    });
    expect(req.url).toBe('https://g.test/v1beta/interactions');
    expect(req.headers['x-goog-api-key']).toBe(base.apiKey);
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body).toEqual({ model: 'gemini-3.5-flash', input: base.prompt, store: false });

    const full = buildAIRequest({
      ...base,
      provider: 'gemini-interactions',
      apiEndpoint: 'https://g.test/v1beta/interactions',
      modelName: 'm',
    });
    expect(full.url).toBe('https://g.test/v1beta/interactions');
  });

  it('Gemini Interactions：新旧两种响应结构都能解析，跳过思考步骤', () => {
    const steps = {
      steps: [
        { type: 'thought', summary: [{ type: 'text', text: '思考' }] },
        {
          type: 'model_output',
          content: [
            { type: 'text', text: '答案一' },
            { type: 'text', text: '答案二' },
          ],
        },
      ],
    };
    expect(extractAIText('gemini-interactions', steps)).toBe('答案一答案二');
    const legacy = {
      outputs: [
        { type: 'thought', summary: '思考' },
        { type: 'text', text: '旧结构答案' },
      ],
    };
    expect(extractAIText('gemini-interactions', legacy)).toBe('旧结构答案');
    expect(extractAIText('gemini-interactions', {})).toBe('');
  });

  it('Gemini：拼接所有 parts，跳过 thought 思考摘要', () => {
    const data = {
      candidates: [
        {
          content: {
            parts: [{ text: '内部思考', thought: true }, { text: '答案一' }, { text: '答案二' }],
          },
        },
      ],
    };
    expect(extractAIText('gemini', data)).toBe('答案一答案二');
  });

  it('结构不对、或为 null 时返回空串而不是抛错', () => {
    for (const provider of AI_PROVIDER_ORDER) {
      expect(extractAIText(provider, null)).toBe('');
      expect(extractAIText(provider, {})).toBe('');
      expect(extractAIText(provider, { choices: 'x', output: 1, candidates: {} })).toBe('');
    }
  });
});

describe('callAI', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

  it('按接口格式发出请求并返回文本', async () => {
    fetchMock.mockResolvedValue(
      ok({ candidates: [{ content: { parts: [{ text: 'Gemini 回复' }] } }] }),
    );
    const text = await callAI({
      ...base,
      provider: 'gemini',
      apiEndpoint: 'https://g.test/v1beta',
      modelName: 'gemini-3.5-flash',
    });

    expect(text).toBe('Gemini 回复');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://g.test/v1beta/models/gemini-3.5-flash:generateContent');
    expect(init.method).toBe('POST');
    expect(init.headers['x-goog-api-key']).toBe('SECRET-KEY');
    expect(JSON.parse(init.body)).toEqual({
      contents: [{ role: 'user', parts: [{ text: '你好' }] }],
    });
  });

  it('缺少必填项时直接报错，不发请求', async () => {
    await expect(
      callAI({ ...base, apiEndpoint: '', modelName: 'm', provider: 'deepseek' }),
    ).rejects.toThrow('请先填写');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('网络/跨域失败时提示检查 CORS', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      callAI({ ...base, apiEndpoint: 'https://x.test', modelName: 'm', provider: 'deepseek' }),
    ).rejects.toThrow(/CORS/);
  });

  it('HTTP 错误带上状态码和响应片段', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'bad key',
    } as unknown as Response);
    await expect(
      callAI({ ...base, apiEndpoint: 'https://x.test', modelName: 'm' }),
    ).rejects.toThrow('401 Unauthorized - bad key');
  });

  it('Gemini 被安全策略拦截时给出具体原因', async () => {
    fetchMock.mockResolvedValue(ok({ promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(
      callAI({ ...base, provider: 'gemini', apiEndpoint: 'https://g.test', modelName: 'm' }),
    ).rejects.toThrow('SAFETY');
  });

  it('Responses 返回 error 或未完成时给出具体原因', async () => {
    fetchMock.mockResolvedValueOnce(ok({ error: { message: '额度不足' } }));
    await expect(
      callAI({ ...base, provider: 'openai-responses', apiEndpoint: 'https://x', modelName: 'm' }),
    ).rejects.toThrow('额度不足');

    fetchMock.mockResolvedValueOnce(
      ok({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }),
    );
    await expect(
      callAI({ ...base, provider: 'openai-responses', apiEndpoint: 'https://x', modelName: 'm' }),
    ).rejects.toThrow('max_output_tokens');
  });

  it('格式对不上时提示检查接口类型，并说明期望的字段', async () => {
    // 把 Gemini 的响应当成 Chat Completions 解析——典型的"类型选错了"
    fetchMock.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }));
    await expect(
      callAI({ ...base, provider: 'openai-chat', apiEndpoint: 'https://x', modelName: 'm' }),
    ).rejects.toThrow(/choices\[0\]\.message\.content.*接口类型/);
  });

  it('响应不是合法 JSON 时给出格式错误而不是抛出解析异常', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    } as unknown as Response);
    await expect(callAI({ ...base, apiEndpoint: 'https://x', modelName: 'm' })).rejects.toThrow(
      '响应格式不符合预期',
    );
  });
});

describe('aiProviders', () => {
  it('未知或缺失的类型回退到 Chat Completions', () => {
    expect(normalizeAIProvider(undefined)).toBe(DEFAULT_AI_PROVIDER);
    expect(normalizeAIProvider('nonsense')).toBe(DEFAULT_AI_PROVIDER);
    expect(normalizeAIProvider('gemini')).toBe('gemini');
  });

  it('每种类型都有预设，且顺序列表没有遗漏', () => {
    expect(new Set(AI_PROVIDER_ORDER)).toEqual(new Set(Object.keys(AI_PROVIDERS)));
  });

  it('DeepSeek 预设不再使用已弃用的模型名', () => {
    expect(AI_PROVIDERS.deepseek.modelPlaceholder).not.toMatch(/deepseek-(chat|reasoner)/);
  });
});
