import { NextApiRequest, NextApiResponse } from 'next';
import { getPostgresClient, initPostgresClient } from '../../server/postgres-client';
import { withErrorHandler, createErrorResponse } from '../../lib/api-utils';

interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  try {
    // Initialize database
    await initPostgresClient();
    const pool = getPostgresClient();

    // Static pages
    const staticUrls: SitemapUrl[] = [
      { loc: 'https://www.qcnote.com/', priority: 1.0, changefreq: 'daily' },
      { loc: 'https://www.qcnote.com/dashboard', priority: 0.8, changefreq: 'weekly' },
      { loc: 'https://www.qcnote.com/contact', priority: 0.6, changefreq: 'monthly' },
      { loc: 'https://www.qcnote.com/privacy', priority: 0.4, changefreq: 'yearly' },
      { loc: 'https://www.qcnote.com/terms', priority: 0.4, changefreq: 'yearly' },
      { loc: 'https://www.qcnote.com/forum', priority: 0.9, changefreq: 'daily' },
      { loc: 'https://www.qcnote.com/forum-create', priority: 0.7, changefreq: 'weekly' },
      { loc: 'https://www.qcnote.com/leaderboard', priority: 0.8, changefreq: 'daily' },
      { loc: 'https://www.qcnote.com/models', priority: 0.8, changefreq: 'weekly' },
      { loc: 'https://www.qcnote.com/signin', priority: 0.5, changefreq: 'monthly' },
    ];

    // Dynamic content: forum posts
    const postsResult = await pool.query(`
      SELECT id, updated_at
      FROM forum_posts
      WHERE created_at > NOW() - INTERVAL '6 months'
      ORDER BY updated_at DESC
      LIMIT 1000
    `);

    const postUrls: SitemapUrl[] = postsResult.rows.map(post => ({
      loc: `https://www.qcnote.com/forum/post/${post.id}`,
      lastmod: post.updated_at.toISOString(),
      changefreq: 'weekly' as const,
      priority: 0.6,
    }));

    // Dynamic content: user profiles (if public)
    // Add user profile URLs if applicable

    // Combine all URLs
    const allUrls = [...staticUrls, ...postUrls];

    // Generate XML
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${url.loc}</loc>
${url.lastmod ? `    <lastmod>${url.lastmod}</lastmod>` : ''}
${url.changefreq ? `    <changefreq>${url.changefreq}</changefreq>` : ''}
${url.priority ? `    <priority>${url.priority}</priority>` : ''}
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(sitemapXml);

  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).json(createErrorResponse('Internal server error', 'INTERNAL_ERROR'));
  }
}

export default withErrorHandler(handler);