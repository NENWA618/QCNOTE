// The shared relay every proxying API route goes through.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { proxyToBackend } from '../lib/backend-proxy';

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    send(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res.headers[name] = value;
    },
  };
  return res;
}

const req = (body: unknown, url = '/api/device/verify') =>
  ({ method: 'POST', url, headers: {}, socket: {}, body }) as unknown as NextApiRequest;

describe('proxyToBackend', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends only the body the route chose, to BACKEND_URL without a doubled slash', async () => {
    vi.stubEnv('BACKEND_URL', 'https://backend.example/');
    const fetchMock = vi.fn(async () => new Response('{"success":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = fakeRes();

    await proxyToBackend(
      req({ fingerprint: 'fp', extra: 'not forwarded' }),
      res as unknown as NextApiResponse,
      '/api/device/verify',
      { body: { fingerprint: 'fp' } },
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://backend.example/api/device/verify');
    expect(JSON.parse(init.body as string)).toEqual({ fingerprint: 'fp' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('relays the backend status and forwards the query string', async () => {
    vi.stubEnv('BACKEND_URL', 'https://backend.example');
    const fetchMock = vi.fn(async () => new Response('{"error":"nope"}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = fakeRes();

    await proxyToBackend(
      req(undefined, '/api/x?limit=5'),
      res as unknown as NextApiResponse,
      '/api/x',
    );

    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe(
      'https://backend.example/api/x?limit=5',
    );
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'nope' });
  });

  it('answers 503 without a backend and 502 when it is unreachable', async () => {
    vi.stubEnv('BACKEND_URL', '');
    const res = fakeRes();
    await proxyToBackend(req({}), res as unknown as NextApiResponse, '/api/x');
    expect(res.statusCode).toBe(503);

    vi.stubEnv('BACKEND_URL', 'https://backend.example');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
    const res2 = fakeRes();
    await proxyToBackend(req({}), res2 as unknown as NextApiResponse, '/api/x');
    expect(res2.statusCode).toBe(502);
  });
});
