// POST /api/admin/set-admin must only grant the role to users who already
// exist. It used to create a placeholder user keyed by the email, whose id no
// OAuth sign-in ever matches, so the grant silently never took effect.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../server/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/session')>()),
  requireAdmin: vi.fn(async () => 'admin-1'),
}));
vi.mock('../server/postgres-client', () => ({
  initPostgresClient: async () => ({ query }),
}));

import { buildFastify } from '../server/app';

describe('POST /api/admin/set-admin', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('refuses an unknown email without creating a user or a role', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    const app = buildFastify();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/set-admin',
      payload: { email: 'new@example.com', username: 'new' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/sign in once/);
    const writes = query.mock.calls.filter(([sql]) => !/^\s*SELECT/i.test(sql));
    expect(writes).toEqual([]);
  });

  it('grants the role to an existing user', async () => {
    const user = { id: 'oauth-42', name: 'Ann', email: 'ann@example.com', username: 'Ann' };
    query.mockImplementation(async (sql: string) =>
      /^\s*SELECT/i.test(sql) ? { rows: [user], rowCount: 1 } : { rows: [], rowCount: 1 },
    );
    const app = buildFastify();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/set-admin',
      payload: { email: 'ann@example.com' },
    });

    expect(res.statusCode).toBe(200);
    const insert = query.mock.calls.find(([sql]) => /INSERT INTO user_roles/.test(sql));
    expect(insert?.[1]).toEqual(['oauth-42', 'admin', 'admin-1']);
  });
});
