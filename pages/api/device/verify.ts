import { proxyToBackend } from '../../../lib/backend-proxy';
import { withCsrfProtection } from '../../../lib/csrfProtection';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import { withErrorHandler, createErrorResponse } from '../../../lib/api-utils';

type SessionUserWithId = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as SessionUserWithId | undefined)?.id;

  if (!userId) {
    return res.status(401).json(createErrorResponse('Authentication required', 'AUTH_REQUIRED'));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  const fingerprint = req.body?.fingerprint;
  if (!fingerprint || typeof fingerprint !== 'string') {
    return res.status(400).json(createErrorResponse('Fingerprint is required', 'VALIDATION_ERROR'));
  }

  // 只转发校验过的字段
  return proxyToBackend(req, res, '/api/device/verify', { body: { fingerprint } });
}

export default withCsrfProtection(withErrorHandler(handler));
