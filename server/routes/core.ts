import type { FastifyReply } from 'fastify';
import type { BackendRequest, ExtendedFastifyInstance } from '../types';
import { initPostgresClient } from '../postgres-client';
import { initRedisClient } from '../redis-client';
import logger from '../../lib/logger';

export function registerCoreRoutes(app: ExtendedFastifyInstance) {
  app.get('/api/health', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      // 检查数据库连接
      const dbClient = await initPostgresClient();
      await dbClient.query('SELECT 1');

      // 检查Redis连接
      const redisClient = await initRedisClient();
      await redisClient.ping();

      return reply.code(200).send({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        services: {
          database: 'ok',
          redis: 'ok',
        },
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      return reply.code(503).send({
        status: 'unhealthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        error: 'Internal server error',
      });
    }
  });

  app.get('/api/sitemap.xml', async (request: BackendRequest, reply: FastifyReply) => {
    try {
      const staticUrls = [
        { loc: 'https://www.qcnote.com/', priority: 1.0, changefreq: 'daily' },
        { loc: 'https://www.qcnote.com/dashboard', priority: 0.8, changefreq: 'weekly' },
        { loc: 'https://www.qcnote.com/contact', priority: 0.6, changefreq: 'monthly' },
        { loc: 'https://www.qcnote.com/privacy', priority: 0.4, changefreq: 'yearly' },
        { loc: 'https://www.qcnote.com/terms', priority: 0.4, changefreq: 'yearly' },
        { loc: 'https://www.qcnote.com/leaderboard', priority: 0.8, changefreq: 'daily' },
        { loc: 'https://www.qcnote.com/models', priority: 0.8, changefreq: 'weekly' },
        { loc: 'https://www.qcnote.com/signin', priority: 0.5, changefreq: 'monthly' },
      ];

      const allUrls: Array<{
        loc: string;
        priority: number;
        changefreq: string;
        lastmod?: string;
      }> = staticUrls;
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${allUrls.map((url) => `  <url>\n    <loc>${url.loc}</loc>\n${url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>` : ''}\n${url.changefreq ? `    <changefreq>${url.changefreq}</changefreq>` : ''}\n${url.priority ? `    <priority>${url.priority}</priority>` : ''}\n  </url>`).join('\n')}\n</urlset>`;

      reply.header('Content-Type', 'application/xml').send(sitemapXml);
    } catch (error) {
      logger.error('Sitemap generation error:', error);
      reply.status(500).send({ success: false, error: 'Internal server error' });
    }
  });
}
