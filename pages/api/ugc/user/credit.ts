import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/authConfig';
import { UGCService } from '../../../../server/ugc-service';
import { initRedisClient, getRedisClient } from '../../../../server/redis-client';
import { initPostgresClient, getPostgresClient } from '../../../../server/postgres-client';
import { withErrorHandler, createSuccessResponse, createErrorResponse } from '../../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  await initRedisClient();
  await initPostgresClient();

  const session = await getServerSession(req, res, authOptions);
  if (!(session?.user as any)?.id) {
    return res.status(401).json(createErrorResponse('Unauthorized', 'AUTH_ERROR'));
  }

  const userId = (session?.user as any)?.id;
  const ugcService = new UGCService(getRedisClient(), getPostgresClient());

  const credit = await ugcService.getUserCredit(userId);

  res.status(200).json(createSuccessResponse({ credit }));
}

export default withErrorHandler(handler);