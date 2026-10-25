import { proxyToBackend } from '../../../lib/backend-proxy';
import { withCsrfProtection } from '../../../lib/csrfProtection';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import { withErrorHandler, createErrorResponse } from '../../../lib/api-utils';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return res.status(401).json(createErrorResponse('Authentication required', 'AUTH_REQUIRED'));
  }

  const token = req.body?.token;

  if (!token || typeof token !== 'string') {
    return res.status(400).json(createErrorResponse('Token is required', 'VALIDATION_ERROR'));
  }

  // 只转发校验过的字段
  return proxyToBackend(req, res, '/api/vault/key', { body: { token } });
}

export default withCsrfProtection(withErrorHandler(handler));
