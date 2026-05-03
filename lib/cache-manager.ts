import { RedisClientType } from 'redis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  keyPrefix?: string;
}

export class CacheManager {
  private redis: RedisClientType;
  private defaultTTL: number;
  private keyPrefix: string;

  constructor(redis: RedisClientType, options: CacheOptions = {}) {
    this.redis = redis;
    this.defaultTTL = options.ttl || 1800; // 30 minutes default
    this.keyPrefix = options.keyPrefix || 'qcnote:';
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(this.getKey(key));
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const finalTTL = ttl || this.defaultTTL;
      await this.redis.setEx(this.getKey(key), finalTTL, serialized);
    } catch (error) {
      console.warn(`Cache set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(this.getKey(key));
    } catch (error) {
      console.warn(`Cache del error for key ${key}:`, error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}${pattern}`);
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    } catch (error) {
      console.warn(`Cache invalidate pattern error for ${pattern}:`, error);
    }
  }

  // Cache with automatic key generation
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetcher();
    await this.set(key, fresh, ttl);
    return fresh;
  }

  // Multi-get for batch operations
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const redisKeys = keys.map(key => this.getKey(key));
      const values = (await this.redis.mGet(redisKeys)) as Array<string | null>;
      return values.map((value: string | null) => value ? JSON.parse(value) : null);
    } catch (error) {
      console.warn('Cache mget error:', error);
      return new Array(keys.length).fill(null);
    }
  }

  // Multi-set for batch operations
  async mset<T>(keyValuePairs: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.redis.multi();
      keyValuePairs.forEach(({ key, value, ttl }) => {
        const serialized = JSON.stringify(value);
        const finalTTL = ttl || this.defaultTTL;
        pipeline.setEx(this.getKey(key), finalTTL, serialized);
      });
      await pipeline.exec();
    } catch (error) {
      console.warn('Cache mset error:', error);
    }
  }
}

// Create a default cache manager instance
export function createCacheManager(redis: RedisClientType, options?: CacheOptions): CacheManager {
  return new CacheManager(redis, options);
}