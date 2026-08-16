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
    /**
     * Fail fast when Redis is gone, rather than queueing.
     *
     * The default is to hold commands in an offline queue until the connection
     * comes back, and `maxRetriesPerRequest` does not bound that wait — it
     * counts retries of a command already sent. So a stopped redis-server did
     * not produce errors, it produced *silence*: /auth/invite simply never
     * answered, and the site showed a spinner for as long as anyone was
     * willing to look at it. Measured at more than 12 seconds with no reply.
     *
     * Failing immediately turns that into an error the client can show and the
     * deploy checker can name.
     */
    enableOfflineQueue: false,
    connectTimeout: 3000,
    // Keep trying to reconnect, but on a bounded schedule, so a redis that
    // comes back is picked up without a restart.
    retryStrategy: (times) => Math.min(times * 200, 3000),
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
