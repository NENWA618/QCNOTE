import { NextApiRequest, NextApiResponse } from 'next';
import { UGCService } from '../../../../server/ugc-service';
import { getRedisClient } from '../../../../server/redis-client';
import { getPostgresClient } from '../../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const ugcService = new UGCService(getRedisClient(), getPostgresClient());

    // 获取用户拥有的模型（包括购买的和自己上传的）
    const ownedModels = [
      {
        id: 'owned_model_1',
        name: '我的可爱少女',
        path: '/live2d/owned/model_1/',
        isCustom: true,
        uploadedBy: userId,
        uploaderName: '我自己',
        price: 0, // 自己上传的模型免费使用
        downloads: 0,
        rating: 5.0,
        tags: ['自定义', '可爱'],
        description: '我自己上传的可爱Live2D模型'
      },
      {
        id: 'owned_model_2',
        name: '购买的科技模型',
        path: '/live2d/owned/model_2/',
        isCustom: true,
        uploadedBy: 'user456',
        uploaderName: '设计师小明',
        price: 20,
        downloads: 12,
        rating: 4.6,
        tags: ['科技', '购买'],
        description: '从市场购买的科技风格Live2D模型'
      }
    ];

    res.status(200).json({
      success: true,
      models: ownedModels
    });
  } catch (error) {
    console.error('Get owned models error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}