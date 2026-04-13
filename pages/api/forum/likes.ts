import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { targetId, targetType, action } = req.body; // targetType: 'post' | 'reply', action: 'like' | 'dislike'

    if (!targetId || !targetType || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['post', 'reply'].includes(targetType) || !['like', 'dislike'].includes(action)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const forumService = new ForumService(getRedisClient(), getPostgresClient());

    const result = await forumService.toggleLike(userId, targetType === 'post' ? targetId : undefined, targetType === 'reply' ? targetId : undefined);

    res.status(200).json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}