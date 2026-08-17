/**
 * Visiting: someone else's farm, read-only, plus the guestbook.
 *
 * The visit payload is built FROM the real farm state and then sanitized,
 * rather than assembled field by field — the client renders a visited farm
 * through the exact same scene and view code as its own, so the shape must
 * never drift. What gets zeroed here is everything that is nobody's business:
 * coins, inventory, seeds, prices, orders, dailies, upgrades, the lot. What
 * survives is what you could see standing at the fence: the land, the house,
 * the crops, the animals, the landmarks, and the name over the gate.
 */

import { randomBytes } from 'node:crypto';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { getFarmState, type FarmState } from './farm';
import { handleFor } from './leaderboard';
import { effectsWithSky, type UpgradeTiers } from './upgrades';

/** How many notes the visit page shows, newest first. */
export const GUESTBOOK_SHOWN = 12;

/** Hard cap per farm; the oldest fall off so a book cannot grow unbounded. */
export const GUESTBOOK_CAP = 100;

/** "Amber Grange 42" → "amber-grange-42". */
export function slugify(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** True when a Prisma error is the unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * Mints the user's visit slug if they do not have one.
 *
 * Handles are hashed from the id into a small space, so base-slug collisions
 * are expected at modest scale. Claiming is claim-then-catch rather than
 * check-then-claim: two users racing the same candidate both pass a read
 * check, and the loser's unique violation must move them to the next
 * candidate, not 500 their /farm read. The last-resort candidate is random —
 * never the user id, which is internal everywhere else and must not become a
 * shareable URL by accident.
 */
export async function ensureVisitSlug(tx: Prisma.TransactionClient, user: User): Promise<string> {
  if (user.visitSlug) return user.visitSlug;

  const base = slugify(handleFor(user.id)) || 'farm';
  const candidates = [
    base,
    `${base}-${user.id.slice(-4)}`,
    `${base}-${randomBytes(4).toString('hex')}`,
    `${base}-${randomBytes(8).toString('hex')}`,
  ];
  for (const candidate of candidates) {
    try {
      await tx.user.update({ where: { id: user.id }, data: { visitSlug: candidate } });
      return candidate;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  // Four candidates including 8 random bytes all taken: not a slug problem.
  throw new Error('Could not mint a visit slug.');
}

export interface GuestbookDto {
  author: string;
  text: string;
  at: number;
}

export interface VisitState extends FarmState {
  /** Always true on this payload; the client uses it to disable every verb. */
  spectator: true;
  guestbook: GuestbookDto[];
}

export async function getVisitState(db: PrismaClient, owner: User): Promise<VisitState> {
  const farm = await getFarmState(db, owner);

  const entries = await db.guestbookEntry.findMany({
    where: { ownerId: owner.id },
    orderBy: { createdAt: 'desc' },
    take: GUESTBOOK_SHOWN,
  });

  return {
    ...farm,
    spectator: true,
    guestbook: entries.map((e) => ({
      author: handleFor(e.authorId),
      text: e.text,
      at: e.createdAt.getTime(),
    })),
    // Everything below is private to the owner. Zeroed, not omitted, so the
    // payload keeps the FarmState shape the whole client is built against.
    user: {
      ...farm.user,
      id: '',
      xp: 0,
      xpIntoLevel: 0,
      xpForNext: 1,
      coins: 0,
      rep: 0,
      amberBalance: 0,
      tutorialStep: 99,
      tutorialBase: {},
      questIndex: 0,
      firstPlantDone: true,
      counters: {},
    },
    inventory: {},
    seeds: {},
    prices: [],
    deliverySlots: [],
    quest: null,
    upgrades: {},
    shop: [],
    // Zeroing `upgrades` while sending `effects` would be a leak with extra
    // steps — effects is a 1:1 reconstruction of the owner's upgrade tiers.
    // The visitor gets the no-upgrade baseline; nothing on a visit reads it.
    // effectsOf reads every tier through `?? 0`, so an empty record is the
    // canonical "no upgrades" loadout despite the nominal type.
    effects: effectsWithSky({} as UpgradeTiers),
    // Egg positions are arguably fence-visible; their database row ids are
    // not, and nothing on a visit renders them anyway.
    groundItems: [],
    daily: { day: 0, resetAt: 0, goals: [], streak: farm.daily.streak, allDone: false },
    away: null,
  };
}
