import { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler, createErrorResponse } from '../../../lib/api-utils';
import { proxyToBackend } from '../../../lib/backend-proxy';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  return proxyToBackend(req, res, '/api/forum/categories', { preserveQuery: true });
}

export default withErrorHandler(handler);
