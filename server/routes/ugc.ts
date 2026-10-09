import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { requireUser, requireAdmin } from '../session';
import { clampLimit, isHttpUrl } from '../utils';
import {
  MAX_PUBLIC_NOTES_PER_USER,
  isValidLocalNoteId,
  validatePublishPayload,
} from '../public-notes';
import { INTERNAL_TOKEN_HEADER, isValidInternalApiToken } from '../../lib/internalAuth';
import { getUgcService } from '../context';
import type { UserProfile } from '../../types/ugc-types';
import logger from '../../lib/logger';

export function registerUgcRoutes(app: ExtendedFastifyInstance) {
  // ==================== UGC 用户路由 ====================

  // 获取或创建用户资料（仅供前端 NextAuth 登录回调以服务间令牌调用）
  app.post(
    '/api/ugc/user/init',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (
      request: BackendRequest<{ userId: string; email: string; username: string }>,
      reply: FastifyReply,
    ) => {
      if (
        !isValidInternalApiToken(
          request.headers[INTERNAL_TOKEN_HEADER],
          process.env.NEXTAUTH_SECRET,
        )
      ) {
        return reply.status(401).send({ success: false, error: 'Unauthorized' });
      }

      try {
        const { userId, email, username } = request.body ?? {};
        if (
          typeof userId !== 'string' ||
          typeof email !== 'string' ||
          typeof username !== 'string' ||
          !userId ||
          userId.length > 256 ||
          email.length > 320 ||
          username.length > 100
        ) {
          return reply.status(400).send({ success: false, error: 'Invalid parameters' });
        }

        let profile = await getUgcService().getUserProfile(userId);
        if (!profile) {
          profile = await getUgcService().createUserProfile(userId, email, username);
        }
        reply.send({ success: true, profile });
      } catch (error) {
        logger.error('User init error:', error);
        reply.status(400).send({ success: false, error: 'Failed to initialize user' });
      }
    },
  );

  // 获取用户资料：本人返回完整资料；他人返回的资料不含邮箱
  app.get('/api/ugc/user/:userId', async (request: BackendRequest, reply: FastifyReply) => {
    const me = await requireUser(request, reply);
    if (!me) return;

    try {
      const { userId } = request.params;
      const profile = await getUgcService().getUserProfile(userId);

      if (userId === me.userId) {
        return reply.send({ success: true, profile });
      }
      if (!profile) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }
      const { email: _email, ...publicProfile } = profile;
      reply.send({ success: true, profile: publicProfile });
    } catch (error) {
      logger.error('Get user profile error:', error);
      reply.status(400).send({ success: false, error: 'Failed to load profile' });
    }
  });

  // 公开主页：所有用户的主页一律公开，无需登录，仅返回展示字段（不含邮箱）
  app.get(
    '/api/ugc/public/user/:userId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params;
        if (typeof userId !== 'string' || !userId || userId.length > 256) {
          return reply.status(404).send({ success: false, error: 'User not found' });
        }
        const profile = await getUgcService().getUserProfile(userId);
        if (!profile) {
          return reply.status(404).send({ success: false, error: 'User not found' });
        }
        const { username, avatar, bio, joinedAt } = profile;
        reply.send({
          success: true,
          profile: { userId: profile.userId, username, avatar, bio, joinedAt },
        });
      } catch (error) {
        logger.error('Get public profile error:', error);
        reply.status(400).send({ success: false, error: 'Failed to load profile' });
      }
    },
  );

  // ==================== 公开笔记 ====================
  // 笔记原件只在浏览器本地；这里保存的是用户主动发布的明文快照

  // 某用户主页上的公开笔记列表（无需登录，分页，不含全文）
  app.get(
    '/api/ugc/public/user/:userId/notes',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.params;
        if (typeof userId !== 'string' || !userId || userId.length > 256) {
          return reply.status(404).send({ success: false, error: 'User not found' });
        }
        const query = request.query as { limit?: unknown; offset?: unknown };
        const limit = clampLimit(query.limit, 20, 50);
        const offset = Math.max(0, Math.floor(Number(query.offset)) || 0);
        const { notes, total } = await getUgcService().listPublicNotes(userId, limit, offset);
        reply.send({ success: true, notes, total });
      } catch (error) {
        logger.error('List public notes error:', error);
        reply.status(400).send({ success: false, error: 'Failed to load notes' });
      }
    },
  );

  // 单篇公开笔记全文（无需登录）
  app.get(
    '/api/ugc/public/notes/:id',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        if (typeof id !== 'string' || !id || id.length > 64) {
          return reply.status(404).send({ success: false, error: 'Note not found' });
        }
        const note = await getUgcService().getPublicNote(id);
        if (!note) {
          return reply.status(404).send({ success: false, error: 'Note not found' });
        }
        reply.send({ success: true, note });
      } catch (error) {
        logger.error('Get public note error:', error);
        reply.status(400).send({ success: false, error: 'Failed to load note' });
      }
    },
  );

  // 我已发布的笔记（仪表盘用来显示"已公开"与"有未发布的更改"）
  app.get('/api/ugc/notes/public', async (request: BackendRequest, reply: FastifyReply) => {
    const me = await requireUser(request, reply);
    if (!me) return;
    try {
      const published = await getUgcService().listPublishedNotes(me.userId);
      reply.send({ success: true, published });
    } catch (error) {
      logger.error('List published notes error:', error);
      reply.status(400).send({ success: false, error: 'Failed to load published notes' });
    }
  });

  // 发布或更新发布
  app.put(
    '/api/ugc/notes/public/:localNoteId',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      const me = await requireUser(request, reply);
      if (!me) return;

      const { localNoteId } = request.params;
      if (!isValidLocalNoteId(localNoteId)) {
        return reply.status(400).send({ success: false, error: 'Invalid note id' });
      }
      const parsed = validatePublishPayload(request.body);
      if (!parsed.ok) {
        return reply.status(400).send({ success: false, error: parsed.error });
      }

      try {
        const published = await getUgcService().publishNote(me.userId, localNoteId, parsed.value);
        if (!published) {
          return reply.status(409).send({
            success: false,
            error: `公开笔记数量已达上限（${MAX_PUBLIC_NOTES_PER_USER} 篇），请先取消发布一些笔记`,
          });
        }
        reply.send({ success: true, published });
      } catch (error) {
        logger.error('Publish note error:', error);
        reply.status(400).send({ success: false, error: 'Failed to publish note' });
      }
    },
  );

  // 取消发布：真正删除服务器上的副本（用 POST，因为前端代理只放行 GET/POST/PUT）
  app.post(
    '/api/ugc/notes/public/:localNoteId/unpublish',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      const me = await requireUser(request, reply);
      if (!me) return;

      const { localNoteId } = request.params;
      if (!isValidLocalNoteId(localNoteId)) {
        return reply.status(400).send({ success: false, error: 'Invalid note id' });
      }
      try {
        await getUgcService().unpublishNote(me.userId, localNoteId);
        reply.send({ success: true });
      } catch (error) {
        logger.error('Unpublish note error:', error);
        reply.status(400).send({ success: false, error: 'Failed to unpublish note' });
      }
    },
  );

  // 一次取消我的全部公开笔记（清空所有笔记时用，避免前端逐篇请求触发限流）
  app.post(
    '/api/ugc/notes/public/unpublish-all',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: BackendRequest, reply: FastifyReply) => {
      const me = await requireUser(request, reply);
      if (!me) return;
      try {
        const removed = await getUgcService().unpublishAllNotes(me.userId);
        reply.send({ success: true, removed });
      } catch (error) {
        logger.error('Unpublish all notes error:', error);
        reply.status(400).send({ success: false, error: 'Failed to unpublish notes' });
      }
    },
  );

  // 管理员下架任意公开笔记
  app.post(
    '/api/admin/public-notes/:id/remove',
    async (request: BackendRequest, reply: FastifyReply) => {
      const adminUserId = await requireAdmin(request, reply);
      if (!adminUserId) return;

      const { id } = request.params;
      if (typeof id !== 'string' || !id || id.length > 64) {
        return reply.status(400).send({ success: false, error: 'Invalid note id' });
      }
      try {
        const removed = await getUgcService().removePublicNote(id);
        if (!removed) {
          return reply.status(404).send({ success: false, error: 'Note not found' });
        }
        logger.info(`[Admin] ${adminUserId} removed public note ${id}`);
        reply.send({ success: true });
      } catch (error) {
        logger.error('Remove public note error:', error);
        reply.status(400).send({ success: false, error: 'Failed to remove note' });
      }
    },
  );

  // 更新用户资料：只能改自己的，且只接受白名单字段（邮箱来自登录提供方，不可改）
  app.put(
    '/api/ugc/user/:userId',
    async (request: BackendRequest<Partial<UserProfile>>, reply: FastifyReply) => {
      const me = await requireUser(request, reply);
      if (!me) return;

      const { userId } = request.params;
      if (userId !== me.userId) {
        return reply.status(403).send({ success: false, error: 'Forbidden' });
      }

      try {
        const body = request.body ?? {};
        const updates: Partial<UserProfile> = {};
        if (body.username !== undefined) {
          if (
            typeof body.username !== 'string' ||
            !body.username.trim() ||
            body.username.length > 100
          ) {
            return reply.status(400).send({ success: false, error: 'Invalid username' });
          }
          updates.username = body.username.trim();
        }
        if (body.bio !== undefined) {
          if (typeof body.bio !== 'string' || body.bio.length > 1000) {
            return reply.status(400).send({ success: false, error: 'Invalid bio' });
          }
          updates.bio = body.bio;
        }
        if (body.avatar !== undefined) {
          if (!isHttpUrl(body.avatar)) {
            return reply.status(400).send({ success: false, error: 'Invalid avatar' });
          }
          updates.avatar = body.avatar;
        }
        const updated = await getUgcService().updateUserProfile(userId, updates);
        reply.send({ success: true, profile: updated });
      } catch (error) {
        logger.error('Update user profile error:', error);
        reply.status(400).send({ success: false, error: 'Failed to update profile' });
      }
    },
  );
}
