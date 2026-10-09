// Device-session token and vault-key (KEK) helpers used to unlock a signed-in
// user's encrypted notes database. All network calls go to this app's own
// /api/device and /api/vault routes.
import logger from '../logger';

export const DEVICE_SESSION_TOKEN_KEY = 'qcnote:deviceSessionToken';

function getBaseUrl(): string {
  return typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost');
}

export function getDeviceSessionToken(userId: string | null): string | null {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined' || !userId) {
    return null;
  }

  const raw = sessionStorage.getItem(DEVICE_SESSION_TOKEN_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { userId: string; token: string };
    if (!parsed?.userId || !parsed?.token || parsed.userId !== userId) {
      sessionStorage.removeItem(DEVICE_SESSION_TOKEN_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    sessionStorage.removeItem(DEVICE_SESSION_TOKEN_KEY);
    return null;
  }
}

export function setDeviceSessionToken(userId: string | null, token: string | null): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  if (!userId || !token) {
    sessionStorage.removeItem(DEVICE_SESSION_TOKEN_KEY);
    return;
  }
  sessionStorage.setItem(DEVICE_SESSION_TOKEN_KEY, JSON.stringify({ userId, token }));
}

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return '';
  }

  const parts = [
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    Array.isArray(navigator.languages) ? navigator.languages.join(',') : '',
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String((navigator as any).hardwareConcurrency ?? ''),
    String((navigator as any).deviceMemory ?? ''),
    String(navigator.maxTouchPoints ?? ''),
  ].filter(Boolean);

  const encoder = new TextEncoder();
  const data = encoder.encode(parts.join('||'));
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function validateDeviceSessionToken(token: string): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const fingerprint = await getDeviceFingerprint();
    if (!fingerprint) {
      return false;
    }

    const response = await fetch(new URL('/api/device/session/validate', getBaseUrl()).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fingerprint }),
    });
    const result = await response.json();
    return response.ok && result?.success === true;
  } catch (error) {
    logger.warn('[NoteStorage] Device session token validation failed', error);
    return false;
  }
}

/**
 * Exchanges a validated device session token for this user's server-held
 * vault key (KEK). The KEK is only ever used in-memory to unwrap/create the
 * browser-local DEK that actually encrypts note fields — it is never
 * persisted to localStorage/IndexedDB. Returns null on any failure (e.g.
 * offline) so callers can fall back to an already-migrated local key.
 */
export async function fetchVaultKey(
  token: string,
  fingerprint: string,
): Promise<Uint8Array | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const response = await fetch(new URL('/api/vault/key', getBaseUrl()).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fingerprint }),
    });
    const result = await response.json();
    if (!response.ok || !result?.success || typeof result.kek !== 'string') {
      return null;
    }
    const binary = atob(result.kek);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    logger.warn('[NoteStorage] Vault key fetch failed', error);
    return null;
  }
}
