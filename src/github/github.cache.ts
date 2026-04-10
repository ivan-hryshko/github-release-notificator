import { getRedis } from '../common/redis.js';
import { logger } from '../common/logger.js';
import { env } from '../config/env.js';

const PREFIX = 'github:';

interface CacheEntry {
  body: string;
  etag: string | null;
}

export async function getCached(path: string): Promise<CacheEntry | null> {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(PREFIX + path);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCache(
  path: string,
  body: string,
  etag: string | null,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  try {
    const entry: CacheEntry = { body, etag };
    await redis.set(PREFIX + path, JSON.stringify(entry), 'EX', env.GITHUB_CACHE_TTL);
  } catch (err) {
    logger.warn({ err, path }, 'Failed to write GitHub cache');
  }
}
