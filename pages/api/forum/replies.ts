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

  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return res.status(401).json(createErrorResponse('Unauthorized', 'AUTH_ERROR'));
    }

    const { postId, content, parentReplyId } = req.body;

    if (!postId || !content) {
      return res.status(400).json(createErrorResponse('Missing required fields', 'VALIDATION_ERROR'));
    }

    const forumService = new ForumService(getRedisClient(), getPostgresClient());

    // 检查帖子是否存在
    const post = await forumService.getPost(postId);
    if (!post) {
      return res.status(404).json(createErrorResponse('Post not found', 'NOT_FOUND'));
    }

    const reply = await forumService.createReply(userId, {
      postId,
      content,
      parentReplyId
    });

    res.status(201).json(createSuccessResponse({ reply }));
  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }
}

export default withErrorHandler(handler);