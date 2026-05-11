import { NextApiRequest, NextApiResponse } from 'next';
import { ZodError } from 'zod';

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

/**
 * 标准化API错误响应
 */
export function createErrorResponse(
  message: string,
  code: string = 'INTERNAL_ERROR',
  details?: any
): ApiResponse {
  return {
    success: false,
    error: {
      message,
      code,
      details,
    },
  };
}

/**
 * 标准化API成功响应
 */
export function createSuccessResponse<T = any>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * 处理Zod验证错误
 */
export function handleZodError(error: ZodError): ApiResponse {
  return createErrorResponse(
    'Validation failed',
    'VALIDATION_ERROR',
    error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }))
  );
}

/**
 * 通用API错误处理包装器
 */
export function withErrorHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error('API Error:', error);

      // 处理已知的错误类型
      if (error instanceof ZodError) {
        res.status(400).json(handleZodError(error));
        return;
      }

      // 处理数据库连接错误
      if (error instanceof Error && error.message.includes('connect')) {
        res.status(503).json(createErrorResponse('Database connection failed', 'DB_CONNECTION_ERROR'));
        return;
      }

      // 处理认证错误
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        res.status(401).json(createErrorResponse('Unauthorized', 'AUTH_ERROR'));
        return;
      }

      // 处理权限错误
      if (error instanceof Error && error.message.includes('Permission')) {
        res.status(403).json(createErrorResponse('Permission denied', 'PERMISSION_ERROR'));
        return;
      }

      // 默认内部服务器错误
      res.status(500).json(createErrorResponse('Internal server error', 'INTERNAL_ERROR'));
    }
  };
}