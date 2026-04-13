import { NextApiRequest, NextApiResponse } from 'next';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient } from '../../../server/redis-client';
import { getPostgresClient } from '../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      const forumService = new ForumService(getRedisClient(), getPostgresClient());
      const categories = await forumService.getCategories();

      res.status(200).json({
        success: true,
        categories
      });
    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}