/**
 * The closed-beta gate.
 *
 * A gate that only exists in the browser is not a gate: the bundle is public,
 * and anyone can skip the screen by calling the API directly. So the code is
 * checked here, and the pass it grants is a signed cookie that the API itself
 * demands before it will create or resume any account.
 *
 * The code is short, which means it is guessable — 1990 is one of ten
 * thousand. The only thing standing between that and a scripted sweep is the
 * attempt limiter below, so it is not optional decoration.
 */

import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env, isProd } from '../env';
import { redis } from './redis';

export const INVITE_COOKIE = 'av_inv';

/** A pass lasts a month; long enough that a beta tester types it once. */
export const INVITE_TTL_SEC = 60 * 60 * 24 * 30;

/**
 * Wrong guesses allowed per IP, and the window they expire over.
 *
 * The budget gates the comparison itself, not just the answer — checking the
 * code first and only then charging for it would let someone locked out keep
 * testing codes forever, which is the whole thing this is here to stop. The
 * cost is that ten typos means a five-minute wait, so ten is chosen to be well
 * clear of honest fumbling.
 *
 * Ten per five minutes is 2,880 a day. A four-digit code is 10,000
 * possibilities, so this makes a sweep take days rather than minutes. It does
 * not make it impossible: a short code is a soft lock, and a longer
 * INVITE_CODE is the only real fix.
 */
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_SEC = 300;

/**
 * A second ceiling on wrong guesses across every IP at once.
 *
 * The per-IP budget assumes the attacker has one address. Anyone with a few
 * hundred — a botnet, a proxy pool, a phone toggling airplane mode — walks
 * straight through it, and ten thousand combinations at that rate is minutes.
 * This bounds the whole door: sixty failures a minute means a full sweep of a
 * four-digit code cannot finish in under about three hours no matter how many
 * addresses it comes from.
 *
 * The cost is honest and worth stating: someone hammering the gate can
 * inconvenience real invitees, since the ceiling is shared. That is why the
 * window is a single minute — the lockout drains on its own while an attack is
 * still nowhere near finishing — and why sixty is far above any plausible
 * rate of genuine typing.
 */
const GLOBAL_MAX = 60;
const GLOBAL_WINDOW_SEC = 60;
const GLOBAL_KEY = 'invite:all';

/** True when no code is configured, i.e. the game is open to everyone. */
export const inviteRequired = (): boolean => env.INVITE_CODE.length > 0;

/**
 * Constant-time compare, so the failure time cannot be used to learn the code
 * one character at a time. Lengths are compared first because
 * timingSafeEqual throws on a mismatch.
 */
function codeMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(env.INVITE_CODE);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Counts a *failed* attempt against the caller's IP.
 *
 * Only failures count, and a success clears the tally. Charging for correct
 * entries too would mean a household, an office or anyone behind one NAT
 * burning each other's budget just by arriving — and it buys nothing: a
 * correct guess ends the attack whether or not it was counted.
 */
export async function takeFailure(ip: string): Promise<number> {
  const [mine, all] = await Promise.all([
    bump(`invite:${ip}`, ATTEMPT_WINDOW_SEC),
    bump(GLOBAL_KEY, GLOBAL_WINDOW_SEC),
  ]);
  return Math.max(0, Math.min(MAX_ATTEMPTS - mine, GLOBAL_MAX - all));
}

/** Increments a counter, setting its expiry only on the first hit of a window. */
async function bump(key: string, ttlSec: number): Promise<number> {
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, ttlSec);
  return used;
}

/**
 * Forgets this IP's tally once someone gets it right.
 *
 * The global ceiling is deliberately not cleared: one person typing the right
 * code says nothing about the thousand wrong guesses that came from elsewhere
 * in the same minute, and letting a correct entry reset it would hand an
 * attacker a free reset for the price of one known-good code.
 */
export const clearAttempts = (ip: string): Promise<number> => redis.del(`invite:${ip}`);

export async function attemptsLeft(ip: string): Promise<number> {
  const [mine, all] = await redis.mget(`invite:${ip}`, GLOBAL_KEY);
  return Math.max(
    0,
    Math.min(MAX_ATTEMPTS - Number(mine ?? 0), GLOBAL_MAX - Number(all ?? 0), MAX_ATTEMPTS),
  );
}

export function checkCode(given: string): boolean {
  return inviteRequired() && codeMatches(given.trim());
}

/** True when this request already carries a valid, signed pass. */
export function hasPass(req: FastifyRequest): boolean {
  if (!inviteRequired()) return true;

  const raw = req.cookies[INVITE_COOKIE];
  if (!raw) return false;

  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return false;

  // The pass carries the code's own fingerprint, so rotating INVITE_CODE
  // invalidates every pass issued under the old one without touching Redis.
  return unsigned.value === passValue();
}

/** What a valid pass cookie contains. Never the code itself. */
function passValue(): string {
  let h = 2166136261;
  for (let i = 0; i < env.INVITE_CODE.length; i++) {
    h ^= env.INVITE_CODE.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `v1.${(h >>> 0).toString(36)}`;
}

export function grantPass(reply: FastifyReply): void {
  reply.setCookie(INVITE_COOKIE, passValue(), {
    httpOnly: true,
    signed: true,
    // Same cross-site constraints as the session cookie: the game is served
    // from a different origin than the API.
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    path: '/',
    maxAge: INVITE_TTL_SEC,
  });
}
