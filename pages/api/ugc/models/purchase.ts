import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { UGCService } from '../../../../server/ugc-service';
import { getRedisClient } from '../../../../server/redis-client';
import { getPostgresClient } from '../../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!(session?.user as any)?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { modelId, userId } = req.body;

    if (!modelId || !userId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const ugcService = new UGCService(getRedisClient(), getPostgresClient());

    // 检查用户积分是否足够
    const userCredit = await ugcService.getUserCredit(userId);
    const modelPrice = 15; // 简化：假设所有模型都是15积分

    if (userCredit < modelPrice) {
      return res.status(400).json({ error: 'Insufficient credit' });
    }

    // 扣除购买者积分
    await ugcService.addCredit(userId, -modelPrice, '购买Live2D模型');

    // 奖励上传者积分（假设上传者ID可以从模型ID推断）
    const uploaderId = modelId.split('_')[2]; // 简化：从modelId提取上传者ID
    if (uploaderId && uploaderId !== userId) {
      await ugcService.addCredit(uploaderId, modelPrice, '模型被购买');
    }

    // 记录购买统计
    await ugcService.recordModelPurchase(modelId, userId);

    // 获取更新后的积分
    const newCredit = await ugcService.getUserCredit(userId);

    res.status(200).json({
      success: true,
      newCredit,
      message: 'Purchase successful'
    });
  } catch (error) {
    console.error('Model purchase error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}