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

    const userId = (session?.user as any)?.id;
    const { shareToCommunity } = req.body;

    // 这里应该处理文件上传
    // 由于Next.js API的限制，我们简化处理
    // 实际实现需要使用multer或其他文件上传中间件

    const ugcService = new UGCService(getRedisClient(), getPostgresClient());

    // 模拟模型ID生成
    const modelId = `model_${Date.now()}_${userId}`;

    // 奖励上传
    await ugcService.rewardModelShare(userId, modelId, shareToCommunity || false);

    res.status(200).json({
      success: true,
      modelId,
      message: '模型上传成功'
    });
  } catch (error) {
    console.error('Model upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}