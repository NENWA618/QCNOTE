import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import { ForumService } from '../../../server/forum-service';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';
import { withErrorHandler, createSuccessResponse, createErrorResponse } from '../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Initialize clients if not already initialized
  await initRedisClient();
  await initPostgresClient();

  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return res.status(401).json(createErrorResponse('Unauthorized', 'AUTH_ERROR'));
  }

  const { targetId, targetType, action } = req.body; // targetType: 'post' | 'reply', action: 'like' | 'dislike'

  if (!targetId || !targetType || !action) {
    return res.status(400).json(createErrorResponse('Missing required fields', 'VALIDATION_ERROR'));
  }

  if (!['post', 'reply'].includes(targetType) || !['like', 'dislike'].includes(action)) {
    return res.status(400).json(createErrorResponse('Invalid parameters', 'VALIDATION_ERROR'));
  }

  const forumService = new ForumService(getRedisClient(), getPostgresClient());

  const result = await forumService.toggleLike(userId, targetType === 'post' ? targetId : undefined, targetType === 'reply' ? targetId : undefined);

  res.status(200).json(createSuccessResponse({ result }));
}

export default withErrorHandler(handler);