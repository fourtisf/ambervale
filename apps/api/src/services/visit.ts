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

import type { Prisma, PrismaClient, User } from '@prisma/client';
import { getFarmState, type FarmState } from './farm';
import { handleFor } from './leaderboard';

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

/**
 * Mints the user's visit slug if they do not have one. Handles are hashed
 * from the id and can collide across users; on a taken slug the id's tail is
 * appended, which is ugly exactly as often as it is necessary.
 */
export async function ensureVisitSlug(tx: Prisma.TransactionClient, user: User): Promise<string> {
  if (user.visitSlug) return user.visitSlug;

  const base = slugify(handleFor(user.id));
  for (const candidate of [base, `${base}-${user.id.slice(-4)}`]) {
    const taken = await tx.user.findUnique({ where: { visitSlug: candidate } });
    if (taken) continue;
    await tx.user.update({ where: { id: user.id }, data: { visitSlug: candidate } });
    return candidate;
  }
  // Both taken — the id itself cannot collide.
  await tx.user.update({ where: { id: user.id }, data: { visitSlug: user.id } });
  return user.id;
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
    daily: { day: 0, resetAt: 0, goals: [], streak: farm.daily.streak, allDone: false },
    away: null,
  };
}
