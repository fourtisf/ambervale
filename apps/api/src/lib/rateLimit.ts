/**
 * Redis rate limiting and action locks.
 *
 * Two different jobs:
 *
 * - The sliding window caps how fast a player can mutate anything at all. It
 *   is the blunt instrument against a script hammering /act/chop.
 * - The action lock is per (user, endpoint, entity) and short. It kills the
 *   double-submit: a fat-fingered double tap, or a client retrying a request
 *   whose response was lost, must not harvest the same plot twice.
 *
 * Both are Lua/atomic-primitive based, because a read-then-write from Node
 * would race exactly the traffic they exist to stop.
 */

import { redis } from './redis';

/** Max mutating calls per user per window. */
export const MUTATION_LIMIT = 5;
export const MUTATION_WINDOW_MS = 1000;

/** How long a single (user, action, entity) stays locked. */
export const ACTION_LOCK_MS = 250;

/**
 * Sliding-window counter over a sorted set of request timestamps.
 * Returns true when the call is allowed.
 */
const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
if redis.call('ZCARD', key) >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return 1
`;

let slidingWindowSha: string | null = null;

async function evalSlidingWindow(key: string, member: string): Promise<number> {
  const args = [String(Date.now()), String(MUTATION_WINDOW_MS), String(MUTATION_LIMIT), member];

  if (!slidingWindowSha) {
    slidingWindowSha = (await redis.script('LOAD', SLIDING_WINDOW)) as string;
  }

  try {
    return (await redis.evalsha(slidingWindowSha, 1, key, ...args)) as number;
  } catch (err) {
    // A restarted Redis loses its script cache; reload once and retry.
    if (err instanceof Error && err.message.includes('NOSCRIPT')) {
      slidingWindowSha = (await redis.script('LOAD', SLIDING_WINDOW)) as string;
      return (await redis.evalsha(slidingWindowSha, 1, key, ...args)) as number;
    }
    throw err;
  }
}

let counter = 0;

/** True when the user is under their mutation budget. */
export async function allowMutation(userId: string): Promise<boolean> {
  // The member must be unique per call, or two calls in the same millisecond
  // would collapse into one ZSET entry and the second would slip the limit.
  const member = `${Date.now()}-${counter++}`;
  const allowed = await evalSlidingWindow(`rl:mut:${userId}`, member);
  return allowed === 1;
}

/**
 * Takes a short exclusive lock. Returns false when one is already held —
 * meaning this is a duplicate submit and should be rejected, not queued.
 */
export async function takeActionLock(
  userId: string,
  action: string,
  entity: string | number = '-',
): Promise<boolean> {
  const key = `lock:${userId}:${action}:${entity}`;
  const res = await redis.set(key, '1', 'PX', ACTION_LOCK_MS, 'NX');
  return res === 'OK';
}

/** Minimum spacing between hits on the same node, enforced per user. */
export async function allowNodeHit(
  userId: string,
  nodeIndex: number,
  minIntervalMs: number,
): Promise<boolean> {
  const key = `hit:${userId}:${nodeIndex}`;
  const res = await redis.set(key, '1', 'PX', minIntervalMs, 'NX');
  return res === 'OK';
}
