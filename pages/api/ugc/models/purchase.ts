import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/authConfig';
import { withErrorHandler, createErrorResponse } from '../../../../lib/api-utils';
import { proxyToBackend } from '../../../../lib/backend-proxy';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return res.status(401).json(createErrorResponse('Unauthorized', 'AUTH_ERROR'));
  }

  req.body = {
    ...req.body,
    userId,
  };

  return proxyToBackend(req, res, '/api/ugc/models/purchase', { preserveQuery: false });
}

export default withErrorHandler(handler);
