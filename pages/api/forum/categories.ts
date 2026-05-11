import { NextApiRequest, NextApiResponse } from 'next';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';
import { withErrorHandler, createSuccessResponse, createErrorResponse } from '../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize clients if not already initialized
  await initRedisClient();
  await initPostgresClient();

  if (req.method === 'GET') {
    const forumService = new ForumService(getRedisClient(), getPostgresClient());
    const categories = await forumService.getCategories();

    res.status(200).json(createSuccessResponse({ categories }));
  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }
}

export default withErrorHandler(handler);