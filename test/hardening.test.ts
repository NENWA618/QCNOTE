import { describe, it, expect, vi, afterEach } from 'vitest';
import { forwardedHeaders } from '../lib/backend-proxy';
import {
  CLIENT_IP_HEADER,
  CLIENT_IP_SIGNATURE_HEADER,
  getInternalApiToken,
  isValidClientIpSignature,
  isValidInternalApiToken,
  signClientIp,
} from '../lib/internalAuth';
import { isAllowedPushEndpoint } from '../lib/pushEndpoint';

describe('internal API token', () => {
  it('accepts the token derived from the same secret', () => {
    const token = getInternalApiToken('a-strong-secret-value');
    expect(isValidInternalApiToken(token, 'a-strong-secret-value')).toBe(true);
  });

  it('rejects tokens from another secret, garbage and missing values', () => {
    const token = getInternalApiToken('secret-one-secret-one');
    expect(isValidInternalApiToken(token, 'secret-two-secret-two')).toBe(false);
    expect(isValidInternalApiToken('nope', 'secret-one-secret-one')).toBe(false);
    expect(isValidInternalApiToken(undefined, 'secret-one-secret-one')).toBe(false);
    expect(isValidInternalApiToken(token, undefined)).toBe(false);
  });
});

describe('push endpoint allowlist (SSRF guard)', () => {
  it('allows the official browser push services over https', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(
      true,
    );
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://db5p.notify.windows.com/?token=abc')).toBe(true);
  });

  it('rejects internal, plain-http, credentialed and look-alike hosts', () => {
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://evilfcm.googleapis.com@evil.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://user:pw@fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isAllowedPushEndpoint('not a url')).toBe(false);
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
  });
});

describe('CSRF protection', () => {
  const req = (method: string, headers: Record<string, string> = {}) => ({
    method,
    headers: { host: 'www.qcnote.com', ...headers },
  });

  it('never blocks safe methods', async () => {
    const { isSameOriginRequest } = await import('../lib/csrfProtection');
    expect(isSameOriginRequest(req('GET', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
  });

  it('blocks cross-site and same-site browser writes via Sec-Fetch-Site', async () => {
    const { isSameOriginRequest } = await import('../lib/csrfProtection');
    expect(isSameOriginRequest(req('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isSameOriginRequest(req('POST', { 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(isSameOriginRequest(req('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isSameOriginRequest(req('PUT', { 'sec-fetch-site': 'none' }))).toBe(true);
  });

  it('falls back to Origin/Referer host matching', async () => {
    const { isSameOriginRequest } = await import('../lib/csrfProtection');
    expect(isSameOriginRequest(req('POST', { origin: 'https://www.qcnote.com' }))).toBe(true);
    expect(isSameOriginRequest(req('POST', { origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOriginRequest(req('POST', { origin: 'null' }))).toBe(false);
    expect(
      isSameOriginRequest(req('POST', { referer: 'https://evil.example/page?x=www.qcnote.com' })),
    ).toBe(false);
  });

  it('allows non-browser clients that send no origin information', async () => {
    const { isSameOriginRequest } = await import('../lib/csrfProtection');
    expect(isSameOriginRequest(req('POST'))).toBe(true);
  });

  it('withCsrfProtection short-circuits blocked requests with 403', async () => {
    const { withCsrfProtection } = await import('../lib/csrfProtection');
    let called = false;
    const wrapped = withCsrfProtection(() => {
      called = true;
    });
    let status = 0;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await wrapped(req('POST', { 'sec-fetch-site': 'cross-site' }) as never, res as never);
    expect(status).toBe(403);
    expect(called).toBe(false);
  });

  it('stateless tokens are bound to the session and reject tampering/expiry', async () => {
    const { generateCSRFToken, validateCSRFToken } = await import('../lib/csrfProtection');
    const token = generateCSRFToken('session-a');
    expect(validateCSRFToken('session-a', token)).toBe(true);
    expect(validateCSRFToken('session-b', token)).toBe(false);

    const [nonce, exp, sig] = token.split('.');
    expect(validateCSRFToken('session-a', `${nonce}.${Number(exp) + 1000}.${sig}`)).toBe(false);
    expect(validateCSRFToken('session-a', `${nonce}.${exp}.${sig.replace(/.$/, '0')}`)).toBe(
      sig.endsWith('0'),
    );

    const expired = `${nonce}.${Date.now() - 1}.${sig}`;
    expect(validateCSRFToken('session-a', expired)).toBe(false);
    expect(validateCSRFToken('session-a', 'garbage')).toBe(false);
  });
});

describe('forwardedHeaders (client IP for backend rate limiting)', () => {
  const socket = { remoteAddress: '10.0.0.9' } as never;
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends a single client IP: the leftmost X-Forwarded-For entry set by the platform proxy', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'a-strong-secret-value');
    const headers = forwardedHeaders({
      headers: { 'x-forwarded-for': '203.0.113.7, 10.1.1.1' },
      socket,
    });
    expect(headers[CLIENT_IP_HEADER]).toBe('203.0.113.7');
    expect(
      isValidClientIpSignature(
        '203.0.113.7',
        headers[CLIENT_IP_SIGNATURE_HEADER],
        'a-strong-secret-value',
      ),
    ).toBe(true);
    expect(headers['x-forwarded-for']).toBeUndefined();
  });

  it('falls back to the socket address and forwards session credentials', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'a-strong-secret-value');
    const headers = forwardedHeaders({
      headers: { cookie: 'session=abc', authorization: 'Bearer t' },
      socket,
    });
    expect(headers).toEqual({
      cookie: 'session=abc',
      authorization: 'Bearer t',
      [CLIENT_IP_HEADER]: '10.0.0.9',
      [CLIENT_IP_SIGNATURE_HEADER]: signClientIp('10.0.0.9', 'a-strong-secret-value'),
    });
  });

  it('never sends the internal API token, which would authorize internal routes', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'a-strong-secret-value');
    const headers = forwardedHeaders({ headers: {}, socket });
    expect(Object.values(headers)).not.toContain(getInternalApiToken('a-strong-secret-value'));
  });
});

describe('client IP signature', () => {
  it('only vouches for the IP it was made for, under the same secret', () => {
    const sig = signClientIp('203.0.113.7', 'secret-a');
    expect(isValidClientIpSignature('203.0.113.7', sig, 'secret-a')).toBe(true);
    expect(isValidClientIpSignature('203.0.113.8', sig, 'secret-a')).toBe(false);
    expect(isValidClientIpSignature('203.0.113.7', sig, 'secret-b')).toBe(false);
    expect(isValidClientIpSignature('203.0.113.7', undefined, 'secret-a')).toBe(false);
    expect(isValidClientIpSignature('203.0.113.7', sig, undefined)).toBe(false);
  });
});

describe('production secret enforcement', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadEnv(vars: Record<string, string>) {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('NEXTAUTH_SECRET', undefined);
    vi.stubEnv('ALLOW_INSECURE_SECRETS', undefined);
    for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
    return import('../lib/env-config');
  }

  it('refuses the fallback secret in production even when CI=true leaks into the runtime', async () => {
    await expect(loadEnv({ CI: 'true' })).rejects.toThrow();
    await expect(loadEnv({ CI: 'true', NEXTAUTH_SECRET: 'development-secret' })).rejects.toThrow();
  });

  it('accepts a strong secret, and the explicit CI opt-out', async () => {
    const strong = await loadEnv({ NEXTAUTH_SECRET: 'x'.repeat(32) });
    expect(strong.env.NEXTAUTH_SECRET).toBe('x'.repeat(32));
    const optOut = await loadEnv({ ALLOW_INSECURE_SECRETS: 'true' });
    expect(optOut.env.NEXTAUTH_SECRET).toBe('development-secret');
  });
});
