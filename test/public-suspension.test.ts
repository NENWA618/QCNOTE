// 管理员可以关闭某个用户的个人主页和公开笔记，但不删除它们（留作证据）：
// 对外所有公开读取路径返回 403 profile_closed，作者本人的发布 / 更新发布 / 取消发布
// 返回 403 public_suspended。同时“版主”角色已取消，不能再被设置。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';

const { service, query } = vi.hoisted(() => ({
  service: {
    getPublicSuspension: vi.fn(),
    suspendPublic: vi.fn(),
    restorePublic: vi.fn(),
    getUserProfile: vi.fn(),
    listPublicNotes: vi.fn(),
    getPublicNote: vi.fn(),
    listPublishedNotes: vi.fn(),
    publishNote: vi.fn(),
    unpublishNote: vi.fn(),
    unpublishAllNotes: vi.fn(),
  },
  query: vi.fn(),
}));

vi.mock('../server/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../server/session')>()),
  requireAdmin: vi.fn(async () => 'admin-1'),
  requireUser: vi.fn(async () => ({ userId: 'author-1', email: null, sessionId: null })),
}));
vi.mock('../server/context', () => ({ getUgcService: () => service }));
vi.mock('../server/postgres-client', () => ({
  initPostgresClient: async () => ({ query }),
}));

import { buildFastify } from '../server/app';
import { UGCService } from '../server/ugc-service';

const SUSPENSION = { suspendedAt: 1700000000000, suspendedBy: 'admin-1', reason: '违规内容' };
const PUBLISH_BODY = {
  title: '标题',
  content: '正文',
  tags: [],
  coloredRanges: [],
  sourceUpdatedAt: 1700000000000,
};

beforeEach(() => {
  query.mockReset();
  for (const fn of Object.values(service)) fn.mockReset();
  service.getPublicSuspension.mockResolvedValue(null);
});

describe('POST /api/admin/users/:userId/public-suspension', () => {
  it('关闭：去掉原因两端空白后交给服务层', async () => {
    service.suspendPublic.mockResolvedValue(true);
    const app = buildFastify();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/github%3A42/public-suspension',
      payload: { suspended: true, reason: '  违规内容  ' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, suspended: true });
    expect(service.suspendPublic).toHaveBeenCalledWith('github:42', 'admin-1', '违规内容');
  });

  it('关闭一个不存在的用户返回 404', async () => {
    service.suspendPublic.mockResolvedValue(false);
    const app = buildFastify();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/nobody/public-suspension',
      payload: { suspended: true },
    });

    expect(res.statusCode).toBe(404);
  });

  it('恢复：只删除关闭记录', async () => {
    service.restorePublic.mockResolvedValue(true);
    const app = buildFastify();

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/author-1/public-suspension',
      payload: { suspended: false },
    });

    expect(res.statusCode).toBe(200);
    expect(service.restorePublic).toHaveBeenCalledWith('author-1');
    expect(service.suspendPublic).not.toHaveBeenCalled();
  });

  it('拒绝缺少 suspended、原因类型不对或过长的请求', async () => {
    const app = buildFastify();
    const post = (payload: unknown) =>
      app.inject({
        method: 'POST',
        url: '/api/admin/users/author-1/public-suspension',
        payload: payload as object,
      });

    expect((await post({})).statusCode).toBe(400);
    expect((await post({ suspended: 'yes' })).statusCode).toBe(400);
    expect((await post({ suspended: true, reason: 123 })).statusCode).toBe(400);
    expect((await post({ suspended: true, reason: 'x'.repeat(501) })).statusCode).toBe(400);
    expect(service.suspendPublic).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/users', () => {
  it('带上每个用户的主页关闭状态', async () => {
    query.mockResolvedValue({
      rows: [
        {
          id: 'u1',
          name: 'A',
          email: 'a@example.com',
          role: 'user',
          created_at: '1700000000000',
          public_suspended_at: '1700000005000',
          public_suspended_reason: '违规内容',
        },
        {
          id: 'u2',
          name: 'B',
          email: 'b@example.com',
          role: 'admin',
          created_at: '1700000001000',
          public_suspended_at: null,
          public_suspended_reason: null,
        },
      ],
    });
    const app = buildFastify();

    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });

    const [closed, open] = res.json().users;
    expect(closed).toMatchObject({
      publicSuspended: true,
      publicSuspendedAt: 1700000005000,
      publicSuspendedReason: '违规内容',
    });
    expect(open).toMatchObject({
      publicSuspended: false,
      publicSuspendedAt: null,
      publicSuspendedReason: '',
    });
  });
});

describe('PUT /api/admin/roles', () => {
  it('“版主”已取消，不能再设置', async () => {
    const app = buildFastify();

    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/roles',
      payload: { userId: 'u1', role: 'moderator' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('Invalid role');
    expect(query).not.toHaveBeenCalled();
  });

  it('仍可设置 user 和 admin', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    const app = buildFastify();

    for (const role of ['user', 'admin']) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/roles',
        payload: { userId: 'u1', role },
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('被关闭用户：对外的公开读取', () => {
  beforeEach(() => {
    service.getPublicSuspension.mockResolvedValue(SUSPENSION);
    service.getUserProfile.mockResolvedValue({
      userId: 'author-1',
      username: 'A',
      email: 'a@example.com',
      avatar: '',
      bio: '',
      joinedAt: 1,
    });
    service.getPublicNote.mockResolvedValue({
      id: 'n1',
      title: '标题',
      content: '正文',
      author: { userId: 'author-1', username: 'A', avatar: '' },
    });
  });

  it('主页、笔记列表和单篇笔记都返回 403 profile_closed，且不读取内容', async () => {
    const app = buildFastify();

    for (const url of [
      '/api/ugc/public/user/author-1',
      '/api/ugc/public/user/author-1/notes',
      '/api/ugc/public/notes/n1',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(403);
      expect(res.json().code, url).toBe('profile_closed');
      expect(res.body, url).not.toContain('正文');
    }
    expect(service.listPublicNotes).not.toHaveBeenCalled();
  });

  it('没被关闭的用户不受影响', async () => {
    service.getPublicSuspension.mockResolvedValue(null);
    service.listPublicNotes.mockResolvedValue({ notes: [], total: 0 });
    const app = buildFastify();

    const profile = await app.inject({ method: 'GET', url: '/api/ugc/public/user/author-1' });
    const notes = await app.inject({ method: 'GET', url: '/api/ugc/public/user/author-1/notes' });
    const note = await app.inject({ method: 'GET', url: '/api/ugc/public/notes/n1' });

    expect(profile.statusCode).toBe(200);
    expect(notes.statusCode).toBe(200);
    expect(note.statusCode).toBe(200);
  });
});

describe('被关闭用户：本人对公开笔记的操作', () => {
  beforeEach(() => {
    service.getPublicSuspension.mockResolvedValue(SUSPENSION);
  });

  it('发布 / 更新发布、取消发布、全部取消发布都返回 403 public_suspended，且不改动数据', async () => {
    const app = buildFastify();

    const responses = [
      await app.inject({
        method: 'PUT',
        url: '/api/ugc/notes/public/local-1',
        payload: PUBLISH_BODY,
      }),
      await app.inject({
        method: 'POST',
        url: '/api/ugc/notes/public/local-1/unpublish',
        payload: {},
      }),
      await app.inject({
        method: 'POST',
        url: '/api/ugc/notes/public/unpublish-all',
        payload: {},
      }),
    ];

    for (const res of responses) {
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('public_suspended');
    }
    expect(service.publishNote).not.toHaveBeenCalled();
    expect(service.unpublishNote).not.toHaveBeenCalled();
    expect(service.unpublishAllNotes).not.toHaveBeenCalled();
  });

  it('列表接口仍可读，并告诉本人关闭的时间和原因（不含操作人）', async () => {
    service.listPublishedNotes.mockResolvedValue([]);
    const app = buildFastify();

    const res = await app.inject({ method: 'GET', url: '/api/ugc/notes/public' });

    expect(res.statusCode).toBe(200);
    expect(res.json().suspension).toEqual({ suspendedAt: 1700000000000, reason: '违规内容' });
    expect(res.body).not.toContain('admin-1');
  });

  it('没被关闭时 suspension 为 null，发布照常进行', async () => {
    service.getPublicSuspension.mockResolvedValue(null);
    service.listPublishedNotes.mockResolvedValue([]);
    service.publishNote.mockResolvedValue({ id: 'p1' });
    const app = buildFastify();

    const list = await app.inject({ method: 'GET', url: '/api/ugc/notes/public' });
    const publish = await app.inject({
      method: 'PUT',
      url: '/api/ugc/notes/public/local-1',
      payload: PUBLISH_BODY,
    });

    expect(list.json().suspension).toBeNull();
    expect(publish.statusCode).toBe(200);
    expect(service.publishNote).toHaveBeenCalledTimes(1);
  });
});

describe('UGCService：关闭只记录、不删除', () => {
  function makeService() {
    const db = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    const redis = {} as unknown as RedisClientType;
    return { svc: new UGCService(redis, db as unknown as Pool), db };
  }

  it('suspendPublic 只写 public_suspensions，用户存在才写，重复关闭保留最初时间', async () => {
    const { svc, db } = makeService();

    expect(await svc.suspendPublic('u1', 'admin-1', '原因')).toBe(true);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO public_suspensions');
    expect(sql).toContain('EXISTS (SELECT 1 FROM users WHERE id = $1)');
    expect(sql).not.toMatch(/public_notes/);
    // 冲突时只更新原因和操作人，不覆盖 suspended_at
    expect(sql).toMatch(
      /DO UPDATE\s+SET reason = EXCLUDED\.reason,\s+suspended_by = EXCLUDED\.suspended_by/,
    );
    expect(sql.split('DO UPDATE')[1]).not.toContain('suspended_at');
    expect(params.slice(0, 3)).toEqual(['u1', '原因', 'admin-1']);
  });

  it('用户不存在时 suspendPublic 返回 false', async () => {
    const { svc, db } = makeService();
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await svc.suspendPublic('ghost', 'admin-1', '')).toBe(false);
  });

  it('restorePublic 只删除关闭记录，不碰 public_notes', async () => {
    const { svc, db } = makeService();

    expect(await svc.restorePublic('u1')).toBe(true);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toBe('DELETE FROM public_suspensions WHERE user_id = $1');
    expect(params).toEqual(['u1']);
  });

  it('getPublicSuspension 把 BIGINT 时间转成数字，没有记录返回 null', async () => {
    const { svc, db } = makeService();
    db.query.mockResolvedValueOnce({
      rows: [{ reason: '违规', suspended_by: 'admin-1', suspended_at: '1700000000000' }],
    });
    expect(await svc.getPublicSuspension('u1')).toEqual({
      suspendedAt: 1700000000000,
      suspendedBy: 'admin-1',
      reason: '违规',
    });

    db.query.mockResolvedValueOnce({ rows: [] });
    expect(await svc.getPublicSuspension('u2')).toBeNull();
  });
});
