/**
 * 支持的 AI 接口类型及其界面预设。
 *
 * 注意"接口类型"指的是请求/响应的格式，而不是公司：DeepSeek 用的就是 OpenAI Chat Completions
 * 格式，单独列出来只是为了预填它的地址和模型名，减少用户配置出错。
 */
export type AIProvider = 'openai-chat' | 'openai-responses' | 'gemini' | 'deepseek';

export const DEFAULT_AI_PROVIDER: AIProvider = 'openai-chat';

export interface AIProviderPreset {
  label: string;
  /** 切换到该类型时自动填入的地址；空串表示没有通用默认值，由用户填写 */
  defaultEndpoint: string;
  endpointPlaceholder: string;
  endpointHint: string;
  modelPlaceholder: string;
  /** 显示在类型选择下方的一句话说明 */
  description: string;
}

export const AI_PROVIDER_ORDER: AIProvider[] = [
  'openai-chat',
  'openai-responses',
  'gemini',
  'deepseek',
];

export const AI_PROVIDERS: Record<AIProvider, AIProviderPreset> = {
  'openai-chat': {
    label: 'OpenAI Chat Completions（及兼容接口）',
    defaultEndpoint: '',
    endpointPlaceholder: 'https://api.openai.com/v1/chat/completions',
    endpointHint: '填写完整的 Chat Completions 接口地址，通常以 /chat/completions 结尾',
    modelPlaceholder: '例如：gpt-4o-mini',
    description: '最通用的格式，大多数第三方和自建服务都兼容它。',
  },
  'openai-responses': {
    label: 'OpenAI Responses',
    defaultEndpoint: 'https://api.openai.com/v1/responses',
    endpointPlaceholder: 'https://api.openai.com/v1/responses',
    endpointHint: '填写完整的 Responses 接口地址，通常以 /responses 结尾',
    modelPlaceholder: '例如：gpt-5.4',
    description:
      'OpenAI 目前推荐新项目使用的格式。这里只发送文本，并设置 store=false，让 OpenAI 不保存这次请求。',
  },
  gemini: {
    label: 'Google Gemini',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    endpointPlaceholder: 'https://generativelanguage.googleapis.com/v1beta',
    endpointHint: '填写 API 基础地址即可，会自动拼上 /models/模型名:generateContent',
    modelPlaceholder: '例如：gemini-3.5-flash',
    description: '使用 Gemini 的 generateContent 接口，API Key 通过请求头发送，不会出现在网址里。',
  },
  deepseek: {
    label: 'DeepSeek',
    defaultEndpoint: 'https://api.deepseek.com/chat/completions',
    endpointPlaceholder: 'https://api.deepseek.com/chat/completions',
    endpointHint: '默认即官方地址；如果浏览器报跨域错误，可改成你自己的代理地址',
    modelPlaceholder: '例如：deepseek-v4-flash',
    description:
      'DeepSeek 使用 Chat Completions 格式。旧的模型名 deepseek-chat / deepseek-reasoner 已于 2026-07-24 弃用，请使用 deepseek-v4-flash 或 deepseek-v4-pro。',
  },
};

export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === 'string' && value in AI_PROVIDERS;
}

/** 读取旧数据或外部数据时使用：未知或缺失的类型一律回退到 Chat Completions */
export function normalizeAIProvider(value: unknown): AIProvider {
  return isAIProvider(value) ? value : DEFAULT_AI_PROVIDER;
}
