/**
 * CSRF Protection Utilities
 * Provides token generation and validation for CSRF protection
 */

const tokenStore = new Map<string, { token: string; expiresAt: number }>();
const TOKEN_EXPIRY_MS = 3600000; // 1 hour
const TOKEN_LENGTH = 32;

/**
 * Generate a CSRF token for a session
 */
export function generateCSRFToken(sessionId: string): string {
  // Generate cryptographically secure random token
  const token = Array.from(crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  tokenStore.set(sessionId, {
    token,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
  });

  // Cleanup expired tokens (lazy cleanup)
  if (tokenStore.size > 10000) {
    const now = Date.now();
    const entriesToDelete: string[] = [];
    for (const [id, entry] of tokenStore.entries()) {
      if (now > entry.expiresAt) {
        entriesToDelete.push(id);
      }
    }
    entriesToDelete.forEach(id => tokenStore.delete(id));
  }

  return token;
}

/**
 * Validate a CSRF token
 */
export function validateCSRFToken(sessionId: string, token: string): boolean {
  const entry = tokenStore.get(sessionId);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(sessionId);
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(entry.token, token);
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * Revoke a CSRF token
 */
export function revokeCSRFToken(sessionId: string): void {
  tokenStore.delete(sessionId);
}
