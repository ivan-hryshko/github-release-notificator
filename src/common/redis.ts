import { Redis } from 'ioredis';
import { logger } from './logger.js';

let redis: Redis | null = null;
let connectionPromise: Promise<Redis | null> | null = null;

export async function getRedis(): Promise<Redis | null> {
  if (redis) return redis;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const instance = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });

      instance.on('error', (err: Error) => {
        logger.warn({ err }, 'Redis connection error — cache disabled');
      });

      await instance.connect();
      redis = instance;
      return redis;
    } catch {
      logger.warn('Redis unavailable — running without cache');
      connectionPromise = null;
      return null;
    }
  })();

  return connectionPromise;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  connectionPromise = null;
}
