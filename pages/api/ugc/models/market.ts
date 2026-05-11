import { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler, createSuccessResponse, createErrorResponse } from '../../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  // 获取市场上的模型（用户分享的自定义模型）
  const marketModels = [
    {
      id: 'market_model_1',
      name: '可爱少女',
      path: '/live2d/market/model_1/',
      isCustom: true,
      uploadedBy: 'user123',
      uploaderName: '创意达人',
      price: 15,
      downloads: 23,
      rating: 4.8,
      tags: ['可爱', '少女', '动漫'],
      description: '一款可爱的动漫风格Live2D模型，适合个人空间装饰'
    },
    {
      id: 'market_model_2',
      name: '科技风格',
      path: '/live2d/market/model_2/',
      isCustom: true,
      uploadedBy: 'user456',
      uploaderName: '设计师小明',
      price: 20,
      downloads: 12,
      rating: 4.6,
      tags: ['科技', '未来', '酷炫'],
      description: '具有未来科技感的Live2D模型，适合科技主题空间'
    },
    {
      id: 'market_model_3',
      name: '古典美女',
      path: '/live2d/market/model_3/',
      isCustom: true,
      uploadedBy: 'user789',
      uploaderName: '古典艺术家',
      price: 25,
      downloads: 8,
      rating: 4.9,
      tags: ['古典', '美女', '优雅'],
      description: '古典风格的美女Live2D模型，优雅而富有内涵'
    }
  ];

  res.status(200).json(createSuccessResponse({ models: marketModels }));
}

export default withErrorHandler(handler);