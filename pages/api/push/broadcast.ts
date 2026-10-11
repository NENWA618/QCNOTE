import { forwardedHeaders } from '../../../lib/backend-proxy';
import { withCsrfProtection } from '../../../lib/csrfProtection';
import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route for admin to broadcast push notifications
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, icon, badge, tag, data } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const backendBase = process.env.BACKEND_URL?.replace(/\/$/, '');
    if (!backendBase) {
      return res.status(503).json({ error: 'Backend service unavailable' });
    }
    const backendUrl = `${backendBase}/api/push/broadcast`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...forwardedHeaders(req),
      },
      body: JSON.stringify({
        title,
        body,
        icon,
        badge,
        tag,
        data,
      }),
    });

    if (!response.ok) {
      // 后端的原始错误文本不透传给浏览器
      console.error('Push broadcast backend error:', response.status, await response.text());
      return res.status(response.status).json({ error: 'Failed to broadcast notification' });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Push broadcast error:', error);
    return res.status(500).json({
      error: 'Failed to broadcast notification',
    });
  }
}

export default withCsrfProtection(handler);
