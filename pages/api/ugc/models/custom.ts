import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 简化实现：返回一些示例自定义模型
    const customModels = [
      {
        id: 'custom_koharu_v2',
        name: '小春V2',
        path: '/live2d/custom/koharu_v2/',
        isCustom: true,
        uploadedBy: 'user123',
        uploadTime: Date.now() - 86400000, // 1天前
        usageCount: 45
      },
      {
        id: 'custom_anime_girl',
        name: '动漫女孩',
        path: '/live2d/custom/anime_girl/',
        isCustom: true,
        uploadedBy: 'user456',
        uploadTime: Date.now() - 172800000, // 2天前
        usageCount: 23
      }
    ];

    res.status(200).json({
      success: true,
      models: customModels
    });
  } catch (error) {
    console.error('Get custom models error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}