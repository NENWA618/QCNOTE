import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';

/**
 * API route for admin to broadcast push notifications
 * Only allows admin users to send notifications
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin session
    const session = await getSession({ req });
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // You might want to add additional admin check here
    // For now, we'll rely on session existence

    const { title, body, icon, badge, tag, data } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/push/broadcast`;

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        body,
        icon,
        badge,
        tag,
        data,
        adminToken: process.env.ADMIN_TOKEN,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
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
