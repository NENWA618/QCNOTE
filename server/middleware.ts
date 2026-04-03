/**
 * Rate limiting and authentication middleware for securing AI endpoints
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Max requests per window

/**
 * Rate limiting middleware
 * Tracks requests per IP and enforces limits
 */
export function rateLimitMiddleware(fastify: any) {
  fastify.addHook('preHandler', async (request: any, reply: any) => {
    // Only apply rate limiting to AI endpoints
    if (!request.url.startsWith('/api/ai/')) {
      return;
    }

    const clientIp = request.ip || 'unknown';
    const now = Date.now();

    // Initialize or retrieve rate limit entry
    let entry = rateLimitStore.get(clientIp);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
      rateLimitStore.set(clientIp, entry);
    }

    // Increment request count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > RATE_LIMIT_MAX_REQUESTS) {
      reply.status(429).send({
        error: 'Too many requests',
        message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    // Set rate limit info headers
    const remaining = RATE_LIMIT_MAX_REQUESTS - entry.count;
    const resetIn = Math.ceil((entry.resetTime - now) / 1000);
    reply.header('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    reply.header('X-RateLimit-Remaining', String(remaining));
    reply.header('X-RateLimit-Reset', String(resetIn));
  });
}

/**
 * Optional API key validation (for environment-based authentication)
 * Can be enabled via REQUIRE_API_KEY=true
 */
export function apiKeyMiddleware(fastify: any) {
  if (process.env.REQUIRE_API_KEY !== 'true') {
    return;
  }

  const validApiKey = process.env.API_KEY;
  if (!validApiKey) {
    console.warn('[AUTH] REQUIRE_API_KEY is true but API_KEY is not set');
    return;
  }

  fastify.addHook('preHandler', async (request: any, reply: any) => {
    // Only apply to protected endpoints
    if (!request.url.startsWith('/api/ai/')) {
      return;
    }

    const apiKey = request.headers['x-api-key'];
    if (!apiKey || apiKey !== validApiKey) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid API key. Provide via X-API-Key header.',
      });
      return;
    }
  });
}

/**
 * Clean up rate limit entries periodically
 * Prevents memory leak from long-lived processes
 */
export function startRateLimitCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const [clientIp, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime + RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(clientIp);
      }
    }
  }, RATE_LIMIT_WINDOW_MS * 2);
}

/**
 * Get current rate limit stats (for monitoring)
 */
export function getRateLimitStats() {
  return {
    trackedIPs: rateLimitStore.size,
    windowSizeMs: RATE_LIMIT_WINDOW_MS,
    maxRequestsPerWindow: RATE_LIMIT_MAX_REQUESTS,
  };
}
