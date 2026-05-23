import { NextApiRequest, NextApiResponse } from 'next';

/**
 * API route to handle push subscription
 * Forwards subscription to Render backend
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/push/subscribe`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Push subscribe error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to subscribe',
    });
  }
}
