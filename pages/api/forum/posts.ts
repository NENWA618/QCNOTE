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

  if (req.method === 'GET') {
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

    res.status(200).json(createSuccessResponse({
      posts,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    }));
  } else if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) {
      return res.status(401).json(createErrorResponse('Unauthorized', 'AUTH_ERROR'));
    }

    const { title, content, category, tags } = req.body;

    if (!title || !content || !category) {
      return res.status(400).json(createErrorResponse('Missing required fields', 'VALIDATION_ERROR'));
    }

    const forumService = new ForumService(getRedisClient(), getPostgresClient());

    const post = await forumService.createPost(userId, {
      title,
      content,
      categoryId: category,
      tags: tags || []
    });

    res.status(201).json(createSuccessResponse({ post }));
  } else {
    res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }
}

export default withErrorHandler(handler);