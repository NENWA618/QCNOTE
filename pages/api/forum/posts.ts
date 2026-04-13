import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize clients if not already initialized
  try {
    await initRedisClient();
    await initPostgresClient();
  } catch (error) {
    console.error('Client initialization error:', error);
    return res.status(500).json({ error: 'Database connection failed' });
  }

  if (req.method === 'GET') {
    try {
      const { 
        category, 
        page = '1', 
        limit = '20',
        q = '',  // search query
        sort = 'newest' // newest, hottest, trending
      } = req.query;
      
      const forumService = new ForumService(getRedisClient(), getPostgresClient());

      const { posts, total } = await forumService.getPosts(
        category as string | undefined,
        parseInt(page as string),
        parseInt(limit as string),
        q as string,
        sort as string
      );

      res.status(200).json({
        success: true,
        posts,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error) {
      console.error('Get posts error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else if (req.method === 'POST') {
    try {
      const session = await getServerSession(req, res, authOptions);
      const userId = (session?.user as any)?.id as string | undefined;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { title, content, category, tags } = req.body;

      if (!title || !content || !category) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const forumService = new ForumService(getRedisClient(), getPostgresClient());

      const post = await forumService.createPost(userId, {
        title,
        content,
        categoryId: category,
        tags: tags || []
      });

      res.status(201).json({
        success: true,
        post
      });
    } catch (error) {
      console.error('Create post error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}