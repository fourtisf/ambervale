/**
 * Guest-first sessions.
 *
 * The cookie carries only an opaque session id, signed so it cannot be forged.
 * Redis maps that id to a userId. Nothing about the player — not their id, not
 * their balance — is trusted from the client.
 *
 * Losing Redis logs everyone out rather than corrupting anything: the browser
 * still holds its deviceId, so /auth/guest hands the same farm straight back.
 */

import { randomUUID } from 'node:crypto';
import { redis } from './redis';

export const SESSION_COOKIE = 'av_sess';

/** Sessions live 30 days, refreshed on every authenticated request. */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30;

const key = (sessionId: string) => `sess:${sessionId}`;

export async function createSession(userId: string): Promise<string> {
  const sessionId = randomUUID();
  await redis.set(key(sessionId), userId, 'EX', SESSION_TTL_SEC);
  return sessionId;
}

export async function resolveSession(sessionId: string): Promise<string | null> {
  const userId = await redis.get(key(sessionId));
  if (!userId) return null;
  // Sliding expiry: an active player never gets logged out mid-session.
  await redis.expire(key(sessionId), SESSION_TTL_SEC);
  return userId;
}

export async function destroySession(sessionId: string): Promise<void> {
  await redis.del(key(sessionId));
}
