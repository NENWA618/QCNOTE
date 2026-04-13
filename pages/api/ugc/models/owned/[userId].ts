import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/authConfig';
import { initRedisClient } from '../../../../../server/redis-client';
import { initPostgresClient } from '../../../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  try {
    if (req.method === 'GET') {
      await initRedisClient();
      await initPostgresClient();

      const session = await getServerSession(req, res, authOptions);
      if (!(session?.user as any)?.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if ((session.user as any).id !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const ownedModels = [
        {
          id: 'owned_model_1',
          name: '专属Live2D模型',
          path: '/live2d/owned/model_1/',
          isCustom: true,
          uploadedBy: userId,
          uploaderName: '我的模型',
          price: 0,
          downloads: 0,
          rating: 5.0,
          tags: ['专属', '用户'],
          description: '这是用户拥有的自定义Live2D模型'
        }
      ];

      res.status(200).json({ success: true, models: ownedModels });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Get user models error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
