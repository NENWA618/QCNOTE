/**
 * 站点默认 AI 模型（服务端专用）。
 *
 * 由部署者通过环境变量配置一个 OpenAI 兼容的中转站，用户无需自己填写 Key 就能使用。
 * Key 只在服务端读取，浏览器通过 /api/ai/default 代理调用，永远拿不到它。
 *
 * 环境变量（均不要加 NEXT_PUBLIC_ 前缀）：
 *   DEFAULT_AI_BASE_URL   中转站基础地址，如 https://example.com/v1（不含 /chat/completions）
 *   DEFAULT_AI_API_KEY    中转站 Key
 *   DEFAULT_AI_MODELS     可用模型 ID，逗号分隔；第一个为默认。可写成 `id|显示名`
 *   DEFAULT_AI_RATE_LIMIT 每用户每分钟请求上限，默认 10
 */

/** 浏览器端调用默认模型的代理地址（同源） */
export const DEFAULT_AI_ENDPOINT = '/api/ai/default';

export interface DefaultAIModel {
  id: string;
  label: string;
}

export interface DefaultAIConfig {
  baseUrl: string;
  apiKey: string;
  models: DefaultAIModel[];
  rateLimitPerMinute: number;
}

export function parseModels(raw: string | undefined): DefaultAIModel[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const models: DefaultAIModel[] = [];
  for (const item of raw.split(',')) {
    const [id, ...rest] = item.split('|');
    const modelId = id.trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    models.push({ id: modelId, label: rest.join('|').trim() || modelId });
  }
  return models;
}

/** 读取配置；任何一项缺失都视为“未启用”，返回 null */
export function getDefaultAIConfig(env: NodeJS.ProcessEnv = process.env): DefaultAIConfig | null {
  const baseUrl = env.DEFAULT_AI_BASE_URL?.trim().replace(/\/+$/, '');
  const apiKey = env.DEFAULT_AI_API_KEY?.trim();
  const models = parseModels(env.DEFAULT_AI_MODELS);
  if (!baseUrl || !apiKey || models.length === 0) return null;
  try {
    const { protocol } = new URL(baseUrl);
    if (protocol !== 'https:' && protocol !== 'http:') return null;
  } catch {
    return null;
  }
  const limit = Number(env.DEFAULT_AI_RATE_LIMIT);
  return {
    baseUrl,
    apiKey,
    models,
    rateLimitPerMinute: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10,
  };
}
