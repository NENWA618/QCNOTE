// Anonymous requests are rate-limited per client IP. That IP must not be
// something a caller can choose: neither a forged X-Forwarded-For entry sent
// straight to the backend, nor a client-IP header without the frontend's
// signature.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CLIENT_IP_HEADER, CLIENT_IP_SIGNATURE_HEADER, signClientIp } from '../lib/internalAuth';
import { buildFastify } from '../server/app';

const SECRET = 'a-strong-secret-value';
// a public route with a 60/minute limit; the handler's own result doesn't matter
const LIMITED_URL = '/api/ugc/public/user/someone';
const LIMIT = 60;

async function statuses(headersFor: (i: number) => Record<string, string>) {
  const app = buildFastify();
  const codes: number[] = [];
  for (let i = 0; i <= LIMIT; i++) {
    const res = await app.inject({ method: 'GET', url: LIMITED_URL, headers: headersFor(i) });
    codes.push(res.statusCode);
  }
  await app.close();
  return codes;
}

describe('anonymous rate limiting by IP', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // On Render a request passes Cloudflare, then Render's load balancer: the
  // caller's own entries come first, then the client as Cloudflare saw it,
  // then the Cloudflare edge as the load balancer saw it.
  describe('behind two proxies (TRUST_PROXY_HOPS=2, as on Render)', () => {
    beforeEach(() => {
      vi.stubEnv('TRUST_PROXY_HOPS', '2');
    });

    it('ignores X-Forwarded-For entries the caller wrote itself', async () => {
      const codes = await statuses((i) => ({
        'x-forwarded-for': `10.9.0.${i}, 203.0.113.5, 162.158.26.240`,
      }));
      expect(codes.at(-1)).toBe(429);
    });

    it('counts each client the proxies saw separately', async () => {
      const codes = await statuses((i) => ({
        'x-forwarded-for': `10.9.0.1, 203.0.113.${i}, 162.158.26.240`,
      }));
      expect(codes).not.toContain(429);
    });
  });

  it('trusts no X-Forwarded-For entry by default', async () => {
    // with no proxy in front, the only entry is the caller's own
    const codes = await statuses((i) => ({ 'x-forwarded-for': `203.0.113.${i}` }));
    expect(codes.at(-1)).toBe(429);
  });

  it('counts each client IP signed by the frontend separately', async () => {
    const codes = await statuses((i) => {
      const ip = `198.51.100.${i}`;
      return { [CLIENT_IP_HEADER]: ip, [CLIENT_IP_SIGNATURE_HEADER]: signClientIp(ip, SECRET)! };
    });
    expect(codes).not.toContain(429);
  });

  it('ignores a client IP header without a valid signature', async () => {
    const codes = await statuses((i) => ({
      [CLIENT_IP_HEADER]: `198.51.100.${i}`,
      [CLIENT_IP_SIGNATURE_HEADER]: 'forged',
    }));
    expect(codes.at(-1)).toBe(429);
  });
});
