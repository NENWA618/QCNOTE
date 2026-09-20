import { NextApiRequest, NextApiResponse } from 'next';
import { withErrorHandler } from '../../../../lib/api-utils';
import { proxyToBackend } from '../../../../lib/backend-proxy';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  return proxyToBackend(req, res, '/api/ugc/user/init');
}

export default withErrorHandler(handler);
