import { forwardedHeaders } from '../../../lib/backend-proxy';
import { withCsrfProtection } from '../../../lib/csrfProtection';
import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route to handle push subscription
 * Forwards subscription to Render backend
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const backendBase = process.env.BACKEND_URL?.replace(/\/$/, '');
    if (!backendBase) {
      return res.status(503).json({ error: 'Backend service unavailable' });
    }
    const backendUrl = `${backendBase}/api/push/subscribe`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardedHeaders(req),
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      // 后端的原始错误文本不透传给浏览器
      console.error('Push subscribe backend error:', response.status, await response.text());
      return res.status(response.status).json({ error: 'Failed to subscribe' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({
      error: 'Failed to subscribe',
    });
  }
}

export default withCsrfProtection(handler);
