/**
 * CSRF Protection with Redis Persistence
 * Provides secure token generation and validation with persistent storage
 */
import { safeAsync, retryAsync } from './errorHandler';
import logger from './logger';

const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const TOKEN_LENGTH = 32;

// In-memory fallback for development/testing
const inMemoryTokenStore = new Map<string, { token: string; expiresAt: number }>();

let redisClient: any = null;

/**
 * Initialize Redis client if available
 * Must be called with a pre-initialized Redis client from server-side code
 */
export async function initCSRFRedis(client?: any): Promise<void> {
  if (client) {
    redisClient = client;
    logger.info('[CSRF] Redis client initialized');
  } else {
    logger.info('[CSRF] No Redis client provided, using in-memory store');
  }
}

/**
 * Get Redis key for CSRF token
 */
function getTokenKey(sessionId: string): string {
  return `csrf:${sessionId}`;
}

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(): string {
  if (typeof window !== 'undefined' && window.crypto) {
    // Browser environment
    const array = new Uint8Array(TOKEN_LENGTH);
    window.crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Node.js environment
    const array = new Uint8Array(TOKEN_LENGTH);
    crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback (not cryptographically secure, should not be used in production)
  logger.warn('[CSRF] Using fallback token generation, not cryptographically secure');
  return Math.random().toString(36).substr(2);
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate a CSRF token for a session
 * Persists to Redis if available, falls back to in-memory storage
 */
export async function generateCSRFToken(sessionId: string): Promise<string> {
  const token = generateSecureToken();
  const key = getTokenKey(sessionId);

  // Try Redis first
  if (redisClient) {
    try {
      await retryAsync(
        () => redisClient.setEx(key, TOKEN_EXPIRY_SECONDS, token),
        2,
        500
      );
      logger.info('[CSRF] Token stored in Redis');
      return token;
    } catch (error) {
      logger.warn('[CSRF] Failed to store token in Redis, falling back to in-memory', { error });
    }
  }

  // Fallback to in-memory storage
  inMemoryTokenStore.set(sessionId, {
    token,
    expiresAt: Date.now() + TOKEN_EXPIRY_SECONDS * 1000,
  });

  // Cleanup expired tokens
  cleanupExpiredTokens();

  return token;
}

/**
 * Validate a CSRF token
 * Checks Redis first, then falls back to in-memory storage
 */
export async function validateCSRFToken(sessionId: string, token: string): Promise<boolean> {
  const key = getTokenKey(sessionId);

  // Try Redis first
  if (redisClient) {
    try {
      const storedToken = await safeAsync(
        () => redisClient.get(key),
        null,
        '[CSRF] Redis token validation failed'
      );

      if (storedToken && timingSafeEqual(storedToken, token)) {
        // Delete token after validation (single-use)
        await safeAsync(
          () => redisClient.del(key),
          null,
          '[CSRF] Failed to delete Redis token'
        );
        return true;
      }

      return false;
    } catch (error) {
      logger.error('[CSRF] Redis validation error', { error });
      // Fall through to in-memory check
    }
  }

  // Fall back to in-memory validation
  const entry = inMemoryTokenStore.get(sessionId);
  if (!entry) {
    return false;
  }

  if (Date.now() > entry.expiresAt) {
    inMemoryTokenStore.delete(sessionId);
    return false;
  }

  const isValid = timingSafeEqual(entry.token, token);
  if (isValid) {
    inMemoryTokenStore.delete(sessionId);
  }

  return isValid;
}

/**
 * Revoke a CSRF token immediately
 */
export async function revokeCSRFToken(sessionId: string): Promise<void> {
  const key = getTokenKey(sessionId);

  // Revoke from Redis
  if (redisClient) {
    await safeAsync(
      () => redisClient.del(key),
      null,
      '[CSRF] Failed to revoke Redis token'
    );
  }

  // Revoke from in-memory store
  inMemoryTokenStore.delete(sessionId);
}

/**
 * Cleanup expired tokens in in-memory store
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  for (const [sessionId, entry] of inMemoryTokenStore.entries()) {
    if (now > entry.expiresAt) {
      keysToDelete.push(sessionId);
    }
  }

  keysToDelete.forEach(sessionId => {
    inMemoryTokenStore.delete(sessionId);
  });

  if (keysToDelete.length > 0) {
    logger.info(`[CSRF] Cleaned up ${keysToDelete.length} expired tokens`);
  }
}

/**
 * Periodic cleanup (call this periodically)
 */
export function startCSRFTokenCleanup(intervalMs: number = 300000): NodeJS.Timeout {
  // Run cleanup every 5 minutes
  return setInterval(() => {
    cleanupExpiredTokens();
  }, intervalMs);
}

/**
 * Get token statistics (for monitoring)
 */
export function getCSRFTokenStats() {
  return {
    inMemoryCount: inMemoryTokenStore.size,
    storageType: redisClient ? 'redis+memory' : 'memory',
    lastCleanup: new Date().toISOString(),
  };
}

export default {
  initCSRFRedis,
  generateCSRFToken,
  validateCSRFToken,
  revokeCSRFToken,
  startCSRFTokenCleanup,
  getCSRFTokenStats,
};
