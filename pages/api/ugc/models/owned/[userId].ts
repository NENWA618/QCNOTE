import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import { UGCService } from '../../../../../server/ugc-service';
import { getRedisClient } from '../../../../../server/redis-client';
import { getPostgresClient } from '../../../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  try {
    if (req.method === 'GET') {
      const session = await getServerSession(req, res, authOptions);
      const ugcService = new UGCService(getRedisClient(), getPostgresClient());

      const space = await ugcService.getUserSpace(userId);

      if (!space) {
        return res.status(404).json({ error: 'User space not found' });
      }

      // 只有拥有者或管理员可以查看完整信息
      if ((session?.user as any)?.id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.status(200).json({ success: true, space });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Get user space error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
