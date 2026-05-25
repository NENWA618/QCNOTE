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

  const token = req.body?.token;
  const fingerprint = req.body?.fingerprint;

  if (!token || typeof token !== 'string') {
    return res.status(400).json(createErrorResponse('Token is required', 'VALIDATION_ERROR'));
  }
  if (!fingerprint || typeof fingerprint !== 'string') {
    return res.status(400).json(createErrorResponse('Fingerprint is required', 'VALIDATION_ERROR'));
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return res
      .status(503)
      .json(createErrorResponse('Backend service unavailable', 'BACKEND_URL_NOT_CONFIGURED'));
  }

  const targetUrl = `${backendUrl.replace(/\/$/, '')}/api/device/session/validate`;
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, token, fingerprint }),
  });

  const responseText = await response.text();
  res.status(response.status);

  try {
    return res.json(JSON.parse(responseText));
  } catch {
    return res.send(responseText);
  }
}

export default withErrorHandler(handler);
