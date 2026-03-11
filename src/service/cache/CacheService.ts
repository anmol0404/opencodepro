import Redis from 'ioredis';

export class CacheService {
  private redis: Redis;
  private readonly DEFAULT_TTL_SECONDS = 3600; // 1 Hour
  public connected = false;

  constructor() {
    // Attempt to connect to Redis using REDIS_URL from env, or default to localhost
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      // Error handling to prevent the app from crashing if Redis is down
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.slice(0, targetError.length) === targetError) {
          return true; // Reconnect on readonly error
        }
        return false;
      }
    });

    this.redis.on('error', (err) => {
      if (this.connected) {
        console.warn('[CacheService] Redis connection lost:', err.message, '- caching disabled until reconnect');
      }
      this.connected = false;
    });

    this.redis.on('connect', () => {
      this.connected = true;
      console.log('[CacheService] Connected to Redis successfully');
    });
  }

  /**
   * Store data in cache with a key.
   * @param key Unique identifier
   * @param data Data to store
   * @param ttlSeconds Optional TTL in seconds (overrides default)
   */
  public async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    try {
      const value = JSON.stringify(data);
      const ttl = ttlSeconds !== undefined ? ttlSeconds : this.DEFAULT_TTL_SECONDS;
      await this.redis.set(key, value, 'EX', ttl);
    } catch (error) {
      console.error('[CacheService] Failed to set cache key:', key, error);
    }
  }

  /**
   * Retrieve data from cache if it exists and is not expired.
   */
  public async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('[CacheService] Failed to get cache key:', key, error);
      return null;
    }
  }

  /**
   * Clear the entire cache.
   */
  public async clear(): Promise<void> {
    try {
      await this.redis.flushall();
      console.log('[CacheService] Cache cleared');
    } catch (error) {
       console.error('[CacheService] Failed to clear cache', error);
    }
  }

  /**
   * Generate a unique cache key from a query and options.
   */
  public generateKey(prefix: string, ...args: any[]): string {
    return `${prefix}:${JSON.stringify(args)}`;
  }

  /**
   * Check if Redis is currently connected.
   */
  public getConnected(): boolean {
    return this.connected;
  }


  /**
   * Close the Redis connection (useful for testing scripts).
   */
  public async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

// Export singleton instance
export const cacheService: CacheService = new CacheService();
