import { NextApiRequest, NextApiResponse } from 'next';
import { UGCService } from '../../../server/ugc-service';
import { getRedisClient, initRedisClient } from '../../../server/redis-client';
import { getPostgresClient, initPostgresClient } from '../../../server/postgres-client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize clients
    await initRedisClient();
    await initPostgresClient();

    const { userId, email, username } = req.body;

    if (!userId || !email || !username) {
      return res.status(400).json({ error: 'Missing required fields: userId, email, username' });
    }

    const ugcService = new UGCService(getRedisClient(), getPostgresClient());

    // Create or update user profile
    const profile = await ugcService.createUserProfile(userId, email, username);

    res.status(200).json({
      success: true,
      profile,
      message: 'User profile initialized successfully'
    });
  } catch (error) {
    console.error('User init error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}