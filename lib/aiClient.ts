/**
 * AI 模型调用 - 直接从浏览器发起，不经过 QCNOTE 自己的后端。
 *
 * API Key 全程只存在于本地（见 aiSettings.ts）和这一次请求里，QCNOTE 服务器
 * 不会看到它。支持的接口格式见 aiProviders.ts：
 * OpenAI Chat Completions（含兼容接口）、OpenAI Responses、Google Gemini、DeepSeek。
 */
import { DEFAULT_AI_PROVIDER, type AIProvider } from './aiProviders';

export interface ChatCompletionParams {
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
  prompt: string;
  /** 接口格式；缺省为 openai-chat，保持旧调用方式不变 */
  provider?: AIProvider;
}

export interface AIRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Gemini 的地址里带模型名，所以界面上让用户填基础地址，这里拼出完整地址。
 * 如果用户直接粘贴了完整的 :generateContent 地址，就原样使用。
 */
function buildGeminiUrl(apiEndpoint: string, modelName: string): string {
  if (apiEndpoint.includes(':generateContent')) return apiEndpoint;
  const model = modelName.replace(/^models\//, '');
  return `${apiEndpoint.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`;
}

/** 按接口格式组装请求。纯函数，不发网络请求。 */
export function buildAIRequest({
  apiEndpoint,
  apiKey,
  modelName,
  prompt,
  provider = DEFAULT_AI_PROVIDER,
}: ChatCompletionParams): AIRequest {
  switch (provider) {
    case 'gemini':
      return {
        url: buildGeminiUrl(apiEndpoint, modelName),
        // Key 放请求头而不是 ?key= 查询参数，避免它出现在 URL、浏览器历史和各类日志里
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: { contents: [{ role: 'user', parts: [{ text: prompt }] }] },
      };
    case 'openai-responses':
      return {
        url: apiEndpoint,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        // Responses 默认会在服务端保存请求；笔记应用不应替用户做这个决定
        body: { model: modelName, input: prompt, store: false },
      };
    case 'deepseek':
    case 'openai-chat':
    default:
      // DeepSeek 使用与 OpenAI 相同的 Chat Completions 格式
      return {
        url: apiEndpoint,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: { model: modelName, messages: [{ role: 'user', content: prompt }] },
      };
  }
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null;
}

function extractChatCompletionText(data: unknown): string {
  if (!isObject(data) || !Array.isArray(data.choices)) return '';
  const message = isObject(data.choices[0]) ? data.choices[0].message : undefined;
  const content = isObject(message) ? message.content : undefined;
  return typeof content === 'string' ? content : '';
}

/**
 * Responses 的答案在 output 数组的 message 项里，数组中还可能夹着推理摘要、工具调用等其他项。
 * 顶层的 output_text 只是官方 SDK 帮忙拼出来的便利字段，原始 REST 响应里不保证有，所以自己拼；
 * 但如果某个兼容服务直接给了字符串，也接受。
 */
function extractResponsesText(data: unknown): string {
  if (!isObject(data)) return '';
  if (Array.isArray(data.output)) {
    const parts: string[] = [];
    for (const item of data.output) {
      if (!isObject(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
      for (const part of item.content) {
        if (isObject(part) && part.type === 'output_text' && typeof part.text === 'string') {
          parts.push(part.text);
        }
      }
    }
    if (parts.length > 0) return parts.join('');
  }
  return typeof data.output_text === 'string' ? data.output_text : '';
}

function extractGeminiText(data: unknown): string {
  if (!isObject(data) || !Array.isArray(data.candidates)) return '';
  const candidate = data.candidates[0];
  const content = isObject(candidate) ? candidate.content : undefined;
  const parts = isObject(content) && Array.isArray(content.parts) ? content.parts : [];
  return parts
    .filter(
      (p): p is Json =>
        isObject(p) &&
        typeof p.text === 'string' &&
        // 思考模型可能返回 thought: true 的思考摘要，它不是答案
        p.thought !== true,
    )
    .map((p) => p.text as string)
    .join('');
}

/** 从响应中取出文本；取不到时返回空串，由调用方根据情况给出具体错误 */
export function extractAIText(provider: AIProvider, data: unknown): string {
  switch (provider) {
    case 'gemini':
      return extractGeminiText(data);
    case 'openai-responses':
      return extractResponsesText(data);
    case 'deepseek':
    case 'openai-chat':
    default:
      return extractChatCompletionText(data);
  }
}

/**
 * 响应是 200 但没有可用文本时，尽量告诉用户真正的原因，而不是一句"格式不符合预期"。
 */
function explainEmptyResponse(provider: AIProvider, data: unknown): string {
  if (isObject(data)) {
    if (provider === 'gemini') {
      const feedback = isObject(data.promptFeedback) ? data.promptFeedback : undefined;
      if (feedback && typeof feedback.blockReason === 'string') {
        return `请求被 Gemini 拦截（${feedback.blockReason}），请换一种问法。`;
      }
      const candidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
      const reason = isObject(candidate) ? candidate.finishReason : undefined;
      if (typeof reason === 'string' && reason !== 'STOP') {
        return `Gemini 没有返回内容（结束原因：${reason}）。`;
      }
    }
    if (provider === 'openai-responses') {
      const error = isObject(data.error) ? data.error : undefined;
      if (error && typeof error.message === 'string') return `接口返回错误：${error.message}`;
      const details = isObject(data.incomplete_details) ? data.incomplete_details : undefined;
      if (data.status === 'incomplete' && details && typeof details.reason === 'string') {
        return `模型没有生成完整回答（原因：${details.reason}）。`;
      }
    }
  }
  const expected: Record<AIProvider, string> = {
    'openai-chat': 'choices[0].message.content',
    deepseek: 'choices[0].message.content',
    'openai-responses': 'output[].content[].text',
    gemini: 'candidates[0].content.parts[].text',
  };
  return `响应格式不符合预期（未找到 ${expected[provider]}）。请确认「接口类型」与你填写的地址一致。`;
}

export async function callAI(params: ChatCompletionParams): Promise<string> {
  const { apiEndpoint, apiKey, modelName } = params;
  const provider = params.provider ?? DEFAULT_AI_PROVIDER;
  if (!apiEndpoint || !apiKey || !modelName) {
    throw new Error('请先填写并保存 API 地址、API Key 和模型名称');
  }

  const request = buildAIRequest({ ...params, provider });

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify(request.body),
    });
  } catch (e) {
    throw new Error(
      `请求发送失败，请检查 API 地址是否正确、目标服务是否允许跨域访问（CORS）：${
        e instanceof Error ? e.message : String(e)
      }`,
      { cause: e },
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `请求失败：${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`,
    );
  }

  const data: unknown = await response.json().catch(() => null);
  const content = extractAIText(provider, data);
  if (!content) {
    throw new Error(explainEmptyResponse(provider, data));
  }
  return content;
}

/** 旧名称，保留以兼容已有调用；等价于 provider 缺省的 callAI */
export const callChatCompletion = callAI;
