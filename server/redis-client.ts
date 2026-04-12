import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function initRedisClient(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;
  
  if (!redisUrl) {
    throw new Error('REDIS_URL or REDIS_CONNECTION_STRING environment variable is not set');
  }

  redisClient = createClient({ url: redisUrl });

  redisClient.on('error', (err) => {
    console.error('[Redis] Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  await redisClient.connect();
  return redisClient;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedisClient first.');
  }
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
