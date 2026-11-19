/**
 * AI 模型调用 - 直接从浏览器发起，不经过 QCNOTE 自己的后端。
 *
 * API Key 全程只存在于本地（见 aiSettings.ts）和这一次请求里，QCNOTE 服务器
 * 不会看到它。支持的接口格式见 aiProviders.ts：
 * OpenAI Chat Completions（含兼容接口）、OpenAI Responses、Google Gemini、
 * Google Gemini Interactions、DeepSeek。
 */
import { DEFAULT_AI_PROVIDER, type AIProvider } from './aiProviders';
import { cleanAIContent, deriveTitleFromContent, parseStructuredNote } from './aiNote';

export interface ChatCompletionParams {
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
  prompt: string;
  /** 接口格式；缺省为 openai-chat，保持旧调用方式不变 */
  provider?: AIProvider;
}

/**
 * 生成笔记时用的输出结构。只靠结构约束输出，不往用户的提问里加任何说明文字，
 * 所以不会影响模型选择的语言和回答内容。
 *
 * content 排在 title 前面：模型先写完正文，再给这篇正文起标题，标题更贴切。
 */
function noteSchema(strict: boolean) {
  return {
    type: 'object',
    properties: { content: { type: 'string' }, title: { type: 'string' } },
    required: ['content', 'title'],
    ...(strict ? { additionalProperties: false } : {}),
  };
}

/**
 * DeepSeek 的 Chat Completions 只有 json_object 模式，且要求提示词里出现 "json" 字样，
 * 与“不改提示词”冲突；但它官方的 Responses 接口（POST /responses）完整支持 json_schema。
 * 所以用户填的是 .../chat/completions 时，换成同级的 .../responses 来发结构化请求。
 * 推不出来（地址不是这种形状）就返回 null，退回普通请求。
 */
function deepseekResponsesUrl(apiEndpoint: string): string | null {
  const base = apiEndpoint.trim().replace(/\/+$/, '');
  return /\/chat\/completions$/.test(base)
    ? base.replace(/\/chat\/completions$/, '/responses')
    : null;
}

/** 这组配置能不能发结构化请求；不能的接口仍可生成，标题改由正文结构推出（见 generateNote） */
export function canRequestStructuredNote({
  provider = DEFAULT_AI_PROVIDER,
  apiEndpoint,
}: Pick<ChatCompletionParams, 'provider' | 'apiEndpoint'>): boolean {
  return provider !== 'deepseek' || deepseekResponsesUrl(apiEndpoint) !== null;
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

/** Interactions 的地址不含模型名；只填了基础地址时补上 /interactions */
function buildGeminiInteractionsUrl(apiEndpoint: string): string {
  const base = apiEndpoint.replace(/\/+$/, '');
  return /\/interactions$/.test(base) ? base : `${base}/interactions`;
}

/** 按接口格式组装请求。纯函数，不发网络请求。 */
export function buildAIRequest({
  apiEndpoint,
  apiKey,
  modelName,
  prompt,
  provider = DEFAULT_AI_PROVIDER,
  structured = false,
}: ChatCompletionParams & { structured?: boolean }): AIRequest {
  const useSchema = structured && canRequestStructuredNote({ provider, apiEndpoint });
  if (provider === 'deepseek' && useSchema) {
    // 结构化请求走官方 Responses 接口（见 deepseekResponsesUrl）；该接口无状态，不需要 store
    return {
      url: deepseekResponsesUrl(apiEndpoint) as string,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: {
        model: modelName,
        input: prompt,
        text: {
          format: { type: 'json_schema', name: 'note', strict: true, schema: noteSchema(true) },
        },
      },
    };
  }
  switch (provider) {
    case 'gemini':
      return {
        url: buildGeminiUrl(apiEndpoint, modelName),
        // Key 放请求头而不是 ?key= 查询参数，避免它出现在 URL、浏览器历史和各类日志里
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          ...(useSchema
            ? {
                generationConfig: {
                  responseMimeType: 'application/json',
                  responseJsonSchema: noteSchema(false),
                },
              }
            : {}),
        },
      };
    case 'gemini-interactions':
      return {
        url: buildGeminiInteractionsUrl(apiEndpoint),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        // 与 Responses 一样，Interactions 默认会在服务端保存交互；这里明确关闭
        body: {
          model: modelName,
          input: prompt,
          store: false,
          ...(useSchema
            ? {
                response_format: {
                  type: 'text',
                  mime_type: 'application/json',
                  schema: noteSchema(false),
                },
              }
            : {}),
        },
      };
    case 'openai-responses':
      return {
        url: apiEndpoint,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        // Responses 默认会在服务端保存请求；笔记应用不应替用户做这个决定
        body: {
          model: modelName,
          input: prompt,
          store: false,
          ...(useSchema
            ? {
                text: {
                  format: {
                    type: 'json_schema',
                    name: 'note',
                    strict: true,
                    schema: noteSchema(true),
                  },
                },
              }
            : {}),
        },
      };
    case 'deepseek':
    case 'openai-chat':
    default:
      return {
        url: apiEndpoint,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: {
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          ...(useSchema
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: { name: 'note', strict: true, schema: noteSchema(true) },
                },
              }
            : {}),
        },
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

/**
 * Interactions 的响应有两种结构：
 * - 新结构：steps[] 中 type 为 model_output 的步骤，其 content[] 里的 text 是答案
 *   （思考、工具调用等是别的 step 类型，自然被跳过）；
 * - 旧结构：扁平的 outputs[]，其中 type 为 text 的项是答案（thought 等是别的类型）。
 * 两种都解析，这样无论服务端默认哪种结构都能用，也不必发送会触发额外跨域预检的版本头。
 */
function extractGeminiInteractionsText(data: unknown): string {
  if (!isObject(data)) return '';
  const parts: string[] = [];
  if (Array.isArray(data.steps)) {
    for (const step of data.steps) {
      if (!isObject(step) || step.type !== 'model_output' || !Array.isArray(step.content)) continue;
      for (const part of step.content) {
        if (isObject(part) && part.type === 'text' && typeof part.text === 'string') {
          parts.push(part.text);
        }
      }
    }
    if (parts.length > 0) return parts.join('');
  }
  if (Array.isArray(data.outputs)) {
    for (const item of data.outputs) {
      if (isObject(item) && item.type === 'text' && typeof item.text === 'string') {
        parts.push(item.text);
      }
    }
  }
  return parts.join('');
}

/** 从响应中取出文本；取不到时返回空串，由调用方根据情况给出具体错误 */
export function extractAIText(provider: AIProvider, data: unknown): string {
  switch (provider) {
    case 'gemini':
      return extractGeminiText(data);
    case 'gemini-interactions':
      return extractGeminiInteractionsText(data);
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
    if (provider === 'gemini-interactions') {
      const error = isObject(data.error) ? data.error : undefined;
      if (error && typeof error.message === 'string') return `接口返回错误：${error.message}`;
      if (typeof data.status === 'string' && data.status !== 'completed') {
        return `Gemini 没有返回内容（状态：${data.status}）。`;
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
    'gemini-interactions': 'steps[].content[].text 或 outputs[].text',
  };
  return `响应格式不符合预期（未找到 ${expected[provider]}）。请确认「接口类型」与你填写的地址一致。`;
}

/** 带 HTTP 状态码的错误，调用方据此判断是不是“服务不支持这个参数”。消息文字与以前一致。 */
class AIHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function assertConfigured({ apiEndpoint, apiKey, modelName }: ChatCompletionParams) {
  if (!apiEndpoint || !apiKey || !modelName) {
    throw new Error('请先填写并保存 API 地址、API Key 和模型名称');
  }
}

async function requestAIText(params: ChatCompletionParams, structured: boolean): Promise<string> {
  const provider = params.provider ?? DEFAULT_AI_PROVIDER;
  const request = buildAIRequest({ ...params, provider, structured });

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
    throw new AIHttpError(
      `请求失败：${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 200)}` : ''}`,
      response.status,
    );
  }

  const data: unknown = await response.json().catch(() => null);
  // DeepSeek 的结构化请求发往 Responses 接口，响应也是 Responses 的形状
  const readAs: AIProvider = structured && provider === 'deepseek' ? 'openai-responses' : provider;
  const content =
    extractAIText(readAs, data) || (readAs !== provider ? extractAIText(provider, data) : '');
  if (!content) {
    throw new Error(explainEmptyResponse(readAs, data));
  }
  return content;
}

export async function callAI(params: ChatCompletionParams): Promise<string> {
  assertConfigured(params);
  return requestAIText(params, false);
}

export interface GeneratedNote {
  /** 短标题；模型没给、正文里也没有标题时为空串，由调用方兜底 */
  title: string;
  /** 已整理过的正文 */
  content: string;
}

/**
 * 生成笔记：提问原样发给模型，输出用结构约束成 { content, title }，再由代码整理。
 *
 * 服务不支持结构化输出（返回 400/422）、或模型没有按结构返回时，退回普通请求，
 * 此时标题取正文里的第一个 Markdown 标题，没有就留空。
 */
export async function generateNote(params: ChatCompletionParams): Promise<GeneratedNote> {
  assertConfigured(params);
  const structured = canRequestStructuredNote(params);

  let raw: string | null = null;
  if (structured) {
    try {
      raw = await requestAIText(params, true);
    } catch (e) {
      // 兼容服务常常不认 json_schema，代理也可能没有 /responses；
      // 只有“请求被拒/地址不存在”这一类才退回，401、429、5xx 等照常抛出
      if (!(e instanceof AIHttpError) || ![400, 404, 405, 422].includes(e.status)) throw e;
    }
  }
  const askedStructured = raw !== null;
  if (raw === null) raw = await requestAIText(params, false);

  const parsed = askedStructured ? parseStructuredNote(raw) : null;
  if (parsed) {
    return {
      content: parsed.content,
      title: parsed.title || deriveTitleFromContent(parsed.content),
    };
  }
  const content = cleanAIContent(raw);
  if (!content) throw new Error('模型只返回了思考过程，没有正文。');
  return { content, title: deriveTitleFromContent(content) };
}

/** 旧名称，保留以兼容已有调用；等价于 provider 缺省的 callAI */
export const callChatCompletion = callAI;
