/**
 * Rate limiting and authentication middleware for securing AI endpoints
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const MAX_TRACKED_IPS = 100000; // Prevent unbounded memory growth

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

    // Check for expired entries and clean up periodically (lazy cleanup)
    if (rateLimitStore.size > MAX_TRACKED_IPS) {
      const entriesToDelete: string[] = [];
      for (const [ip, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime + RATE_LIMIT_WINDOW_MS) {
          entriesToDelete.push(ip);
        }
      }
      entriesToDelete.forEach(ip => rateLimitStore.delete(ip));
    }

    // Initialize or retrieve rate limit entry
    let entry = rateLimitStore.get(clientIp);
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
      if (rateLimitStore.size < MAX_TRACKED_IPS) {
        rateLimitStore.set(clientIp, entry);
      } else {
        // Gracefully handle capacity - use temporary entry
        entry = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
      }
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
  const cleanupIntervalMs = Math.min(RATE_LIMIT_WINDOW_MS * 10, 600000); // Max 10 min interval
  setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;
    for (const [clientIp, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime + RATE_LIMIT_WINDOW_MS) {
        rateLimitStore.delete(clientIp);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      console.log(`[RateLimit] Cleaned up ${deletedCount} expired entries. Current size: ${rateLimitStore.size}`);
    }
  }, cleanupIntervalMs);
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
