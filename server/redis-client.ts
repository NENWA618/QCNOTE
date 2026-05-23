import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function initRedisClient(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;

  if (!redisUrl) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        'REDIS_URL or REDIS_CONNECTION_STRING environment variable is not set, using mock Redis client',
      );
      redisClient = {
        get: async () => null,
        set: async () => 'OK',
        setEx: async () => 'OK',
        del: async () => 1,
        quit: async () => 'OK',
        on: () => {},
        connect: async () => {},
        isOpen: true,
      } as any;
      return redisClient!;
    }
    throw new Error(
      `REDIS_URL or REDIS_CONNECTION_STRING environment variable is required in non-development environments. NODE_ENV=${process.env.NODE_ENV}`,
    );
  }

  redisClient = createClient({
    url: redisUrl,
    // Connection settings
    socket: {
      connectTimeout: 5000,
      keepAlive: true,
    },
    // Performance settings
    commandsQueueMaxLength: 1000,
    disableOfflineQueue: false,
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  try {
    await redisClient.connect();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Redis connection failed, using mock Redis client:', error);
      redisClient = {
        get: async () => null,
        set: async () => 'OK',
        setEx: async () => 'OK',
        del: async () => 1,
        quit: async () => 'OK',
        on: () => {},
        connect: async () => {},
        isOpen: true,
      } as any;
      return redisClient!;
    }
    throw new Error(`Redis connection failed: ${error}`);
  }

  return redisClient!;
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
