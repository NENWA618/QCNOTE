import { proxyToBackend } from '../../../../lib/backend-proxy';
import { withCsrfProtection } from '../../../../lib/csrfProtection';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/authConfig';
import { withErrorHandler, createErrorResponse } from '../../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return res.status(401).json(createErrorResponse('Authentication required', 'AUTH_REQUIRED'));
  }

  // 后端只看会话，不需要请求体
  return proxyToBackend(req, res, '/api/device/session/create', { body: {} });
}

export default withCsrfProtection(withErrorHandler(handler));
