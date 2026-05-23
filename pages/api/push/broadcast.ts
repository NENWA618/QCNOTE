import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route for admin to broadcast push notifications
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, icon, badge, tag, data } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/push/broadcast`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
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
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error('Push broadcast error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to broadcast notification',
    });
  }
}
