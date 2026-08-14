/**
 * The leaderboard.
 *
 * The game had no way of showing a player that anyone else existed, which for
 * something with a token in it is a strange omission — a score nobody can be
 * compared against is not a score. This is the cheapest possible fix: three
 * ranked reads and a count of who played today.
 *
 * Nobody has a name, and asking for one is a signup form by another route. So
 * a handle is derived from the account id — stable, unique enough to talk
 * about, and impossible to use to impersonate anyone since it is never input.
 */

import { titleFor } from '@ambervale/game-config';
import type { PrismaClient } from '@prisma/client';
import { redis } from '../lib/redis';

/** How long a board stays cached. Long enough to absorb a crowd refreshing. */
const CACHE_SEC = 30;
const CACHE_KEY = 'leaderboard:v1';

const ADJECTIVES = [
  'Amber',
  'Quiet',
  'Golden',
  'Wandering',
  'Hollow',
  'Bright',
  'Northern',
  'Patient',
  'Windy',
  'Copper',
  'Silver',
  'Morning',
  'Restless',
  'Kindly',
  'Distant',
  'Autumn',
];

const NOUNS = [
  'Harvest',
  'Meadow',
  'Furrow',
  'Lantern',
  'Orchard',
  'Thicket',
  'Brook',
  'Barrow',
  'Hollow',
  'Acre',
  'Millstone',
  'Hedgerow',
  'Bramble',
  'Fallow',
  'Pasture',
  'Grange',
];

/** Stable, deterministic handle for an account id. */
export function handleFor(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ADJECTIVES[Math.abs(h) % ADJECTIVES.length]!;
  const n = NOUNS[Math.abs(h >>> 8) % NOUNS.length]!;
  // Two digits keep collisions rare without turning the handle into an id.
  const tag = String(Math.abs(h >>> 16) % 100).padStart(2, '0');
  return `${a} ${n} ${tag}`;
}

export interface BoardRow {
  handle: string;
  title: string | null;
  level: number;
  renown: number;
  deliveries: number;
  streak: number;
  /** True for the row belonging to the player who asked. */
  you?: boolean;
}

export interface Leaderboard {
  renown: BoardRow[];
  level: BoardRow[];
  streak: BoardRow[];
  /** Distinct farms that opened the game since UTC midnight. */
  activeToday: number;
  totalFarms: number;
  /** Where the asking player sits, even when they are off the boards. */
  you: { handle: string; renown: number; level: number; renownRank: number | null };
}

type UserRow = {
  id: string;
  level: number;
  renown: number;
  deliveriesDone: number;
  daily: { streak: number } | null;
};

const toRow = (u: UserRow): BoardRow => ({
  handle: handleFor(u.id),
  title: titleFor(u.renown),
  level: u.level,
  renown: u.renown,
  deliveries: u.deliveriesDone,
  streak: u.daily?.streak ?? 0,
});

/**
 * Builds all three boards.
 *
 * Cached as one blob rather than per-board: they are read together, and a
 * single key keeps the three consistent with each other and with the counts.
 */
export async function readLeaderboard(
  db: PrismaClient,
  limit = 15,
): Promise<Omit<Leaderboard, 'you'>> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) return JSON.parse(cached) as Omit<Leaderboard, 'you'>;

  const select = {
    id: true,
    level: true,
    renown: true,
    deliveriesDone: true,
    daily: { select: { streak: true } },
  } as const;

  // Guests who never got past the title screen would otherwise pad every
  // board with identical level-1 rows.
  const played = { bootstrapped: true, plantedCount: { gt: 0 } };

  const startOfDay = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000);

  const [renown, level, streakRows, activeToday, totalFarms] = await Promise.all([
    db.user.findMany({
      where: { ...played, renown: { gt: 0 } },
      orderBy: [{ renown: 'desc' }, { xp: 'desc' }],
      take: limit,
      select,
    }),
    db.user.findMany({
      where: played,
      orderBy: [{ xp: 'desc' }],
      take: limit,
      select,
    }),
    db.user.findMany({
      where: { ...played, daily: { streak: { gt: 0 } } },
      orderBy: { daily: { streak: 'desc' } },
      take: limit,
      select,
    }),
    db.user.count({ where: { ...played, lastSeenAt: { gte: startOfDay } } }),
    db.user.count({ where: played }),
  ]);

  const board = {
    renown: renown.map(toRow),
    level: level.map(toRow),
    streak: streakRows.map(toRow),
    activeToday,
    totalFarms,
  };

  await redis.set(CACHE_KEY, JSON.stringify(board), 'EX', CACHE_SEC);
  return board;
}

/** The asking player's own standing, which is never cached. */
export async function standingFor(db: PrismaClient, userId: string): Promise<Leaderboard['you']> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, level: true, renown: true },
  });

  // Rank is "how many are strictly ahead, plus one" — cheap on the renown
  // index and correct without materialising the whole table.
  const ahead =
    user.renown > 0
      ? await db.user.count({
          where: { bootstrapped: true, plantedCount: { gt: 0 }, renown: { gt: user.renown } },
        })
      : null;

  return {
    handle: handleFor(user.id),
    renown: user.renown,
    level: user.level,
    renownRank: ahead === null ? null : ahead + 1,
  };
}
