import Redis from 'ioredis';
import { env } from '../env';

declare global {
  var __ambervaleRedis: Redis | undefined;
}

export const redis: Redis =
  globalThis.__ambervaleRedis ??
  new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
  });

if (env.NODE_ENV !== 'production') globalThis.__ambervaleRedis = redis;

/**
 * Connect and PING. Throws if Redis is unreachable — sessions, rate limits and
 * action locks all live here, so booting without it would mean booting an API
 * that cannot enforce its own rules.
 */
export async function pingRedis(): Promise<string> {
  if (redis.status === 'wait' || redis.status === 'end') {
    await redis.connect();
  }
  return redis.ping();
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit().catch(() => redis.disconnect());
}
