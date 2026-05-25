import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/authConfig';
import {
  withErrorHandler,
  createSuccessResponse,
  createErrorResponse,
} from '../../../lib/api-utils';

type SessionUserWithId = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return res
      .status(503)
      .json(createErrorResponse('Backend service unavailable', 'BACKEND_URL_NOT_CONFIGURED'));
  }

  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as SessionUserWithId | undefined)?.id;

  if (!userId) {
    return res.status(401).json(createErrorResponse('Authentication required', 'AUTH_REQUIRED'));
  }

  if (req.method !== 'POST') {
    return res.status(405).json(createErrorResponse('Method not allowed', 'METHOD_NOT_ALLOWED'));
  }

  const targetUrl = `${backendUrl.replace(/\/$/, '')}/api/device/reset`;

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
    },
    body: JSON.stringify({}),
  });

  const responseText = await response.text();
  res.status(response.status);

  try {
    const jsonBody = JSON.parse(responseText);
    return res.json(jsonBody);
  } catch {
    return res.send(responseText);
  }
}

export default withErrorHandler(handler);
