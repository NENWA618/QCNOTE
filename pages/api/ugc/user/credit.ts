import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/authConfig';
import { UGCService } from '../../../../server/ugc-service';
import { initRedisClient, getRedisClient } from '../../../../server/redis-client';
import { initPostgresClient, getPostgresClient } from '../../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await initRedisClient();
    await initPostgresClient();

    const session = await getServerSession(req, res, authOptions);
    if (!(session?.user as any)?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (session?.user as any)?.id;
    const ugcService = new UGCService(getRedisClient(), getPostgresClient());

    const credit = await ugcService.getUserCredit(userId);

    res.status(200).json({
      success: true,
      credit
    });
  } catch (error) {
    console.error('Get user credit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}