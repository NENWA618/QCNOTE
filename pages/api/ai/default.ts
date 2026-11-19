import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import { withCsrfProtection } from '../../../lib/csrfProtection';
import { withErrorHandler, createErrorResponse } from '../../../lib/api-utils';
import { getDefaultAIConfig } from '../../../lib/defaultAI';

const MAX_PROMPT_CHARS = 20000;
const UPSTREAM_TIMEOUT_MS = 90_000;

// 进程内的简易限流（多实例/serverless 下是“尽力而为”；严格限流请在中转站侧配置）
const hits = new Map<string, number[]>();
function rateLimited(userId: string, limit: number): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= 60_000)) hits.delete(k);
  }
  return false;
}

type Message = { role: 'user' | 'system'; content: string };

function parseMessages(value: unknown): Message[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null;
  let total = 0;
  const out: Message[] = [];
  for (const m of value) {
    if (typeof m !== 'object' || m === null) return null;
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'system') || typeof content !== 'string') return null;
    total += content.length;
    out.push({ role, content });
  }
  return total > 0 && total <= MAX_PROMPT_CHARS ? out : null;
}

/** 只放行笔记生成用到的两种格式，其余字段一律丢弃 */
function parseResponseFormat(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const type = (value as Record<string, unknown>).type;
  return type === 'json_schema' || type === 'json_object'
    ? (value as Record<string, unknown>)
    : undefined;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const config = getDefaultAIConfig();

  // 只返回“是否可用”和模型列表，绝不返回地址或 Key
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      available: !!config,
      models: config?.models ?? [],
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }
  if (!config) {
    return res
      .status(503)
      .json(createErrorResponse('站点未配置默认 AI 模型', 'DEFAULT_AI_DISABLED'));
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return res.status(401).json(createErrorResponse('请先登录再使用默认模型', 'AUTH_REQUIRED'));
  }
  if (rateLimited(userId, config.rateLimitPerMinute)) {
    return res.status(429).json(createErrorResponse('请求过于频繁，请稍后再试', 'RATE_LIMITED'));
  }

  const { model, messages, response_format } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof model !== 'string' || !config.models.some((m) => m.id === model)) {
    return res.status(400).json(createErrorResponse('不支持的模型', 'VALIDATION_ERROR'));
  }
  const parsedMessages = parseMessages(messages);
  if (!parsedMessages) {
    return res.status(400).json(createErrorResponse('消息格式不正确或过长', 'VALIDATION_ERROR'));
  }
  const responseFormat = parseResponseFormat(response_format);

  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: parsedMessages,
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return res.status(502).json(createErrorResponse('默认模型服务暂时不可用', 'UPSTREAM_ERROR'));
  }

  // 状态码原样透传，客户端据此判断是否要退回非结构化请求
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(text);
}

export default withCsrfProtection(withErrorHandler(handler));
