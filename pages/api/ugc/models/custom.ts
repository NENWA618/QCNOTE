import { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler, createSuccessResponse, createErrorResponse } from '../../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

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

  res.status(200).json(createSuccessResponse({ models: customModels }));
}

export default withErrorHandler(handler);