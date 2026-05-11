import { NextApiRequest, NextApiResponse } from 'next';
import { UGCService } from '../../../../server/ugc-service';
import { getRedisClient, initRedisClient } from '../../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../../server/postgres-client';
import { withErrorHandler, createSuccessResponse, createErrorResponse } from '../../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  // Initialize clients
  await initRedisClient();
  await initPostgresClient();

  const { userId, email, username } = req.body;

  if (!userId || !email || !username) {
    return res.status(400).json(createErrorResponse('Missing required fields: userId, email, username', 'VALIDATION_ERROR'));
  }

  const ugcService = new UGCService(getRedisClient(), getPostgresClient());

  // Create or update user profile
  const profile = await ugcService.createUserProfile(userId, email, username);

  res.status(200).json(createSuccessResponse({
    profile,
    message: 'User profile initialized successfully'
  }));
}

export default withErrorHandler(handler);