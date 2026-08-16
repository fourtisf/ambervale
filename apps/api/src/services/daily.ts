/**
 * Daily goals and the streak.
 *
 * The trick that keeps this cheap: progress is "counter now minus counter at
 * the start of the day". Every daily goal leans on a monotonic counter that
 * already existed on the User row, so a day needs exactly one extra row — a
 * baseline snapshot and a claimed bitmask. The goals themselves are derived
 * from the date and never stored.
 *
 * Reset is UTC midnight, which is the one boundary that is the same for
 * everybody and needs no per-player timezone to be right.
 */

import {
  DAILY,
  dailyPicks,
  dayIndex,
  type DailyCounter,
  type DailyQuestDef,
} from '@ambervale/game-config';
import type { Prisma } from '@prisma/client';
import { levelFromTotalXp } from './progression';

/** Counters a daily goal may be measured against. */
const COUNTERS: DailyCounter[] = [
  'plantedCount',
  'harvestedCount',
  'choppedCount',
  'minedCount',
  'soldCount',
  'boughtSeeds',
  'milkCount',
  'eggCount',
  'deliveriesDone',
  'fishCount',
  'craftCount',
  'wateredCount',
  'shooedCount',
  'upgradesBought',
];

type Snapshot = Record<string, number>;

function snapshotOf(user: Record<string, unknown>): Snapshot {
  const snap: Snapshot = {};
  for (const key of COUNTERS) snap[key] = (user[key] as number) ?? 0;
  return snap;
}

/** Next UTC midnight, in epoch ms — what the UI counts down to. */
export const resetAtFor = (day: number): number => (day + 1) * 86_400_000;

// ---------------------------------------------------------------------------

/**
 * Creates the daily row, or rolls it over to today.
 *
 * The streak survives only if yesterday was completed; any other gap resets
 * it. That decision is made here, at rollover, rather than when a goal is
 * finished — so a player who simply never came back loses the streak without
 * anything having to run while they were gone.
 */
export async function ensureDaily(
  tx: Prisma.TransactionClient,
  userId: string,
  now = Date.now(),
): Promise<void> {
  const day = dayIndex(now);
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const row = await tx.dailyState.findUnique({ where: { userId } });

  if (!row) {
    await tx.dailyState.create({
      data: {
        userId,
        day,
        baseline: snapshotOf(user as unknown as Record<string, unknown>),
        claimed: 0,
        streak: 0,
        lastCompleteDay: -1,
      },
    });
    return;
  }

  if (row.day === day) return;

  const streak = row.lastCompleteDay === day - 1 ? row.streak : 0;

  await tx.dailyState.update({
    where: { userId },
    data: {
      day,
      baseline: snapshotOf(user as unknown as Record<string, unknown>),
      claimed: 0,
      streak,
    },
  });
}

// ---------------------------------------------------------------------------

export interface DailyGoalDto {
  id: string;
  text: string;
  target: number;
  current: number;
  reward: { coins?: number; amber?: number };
  done: boolean;
}

export interface DailyDto {
  day: number;
  /** Epoch ms of the next reset, so the HUD can show "resets in 4h". */
  resetAt: number;
  goals: DailyGoalDto[];
  streak: number;
  allDone: boolean;
}

/** Progress toward one goal: how far the counter has moved today. */
function progressFor(
  goal: DailyQuestDef,
  user: Record<string, unknown>,
  baseline: Snapshot,
): number {
  const now = (user[goal.counter] as number) ?? 0;
  const base = baseline[goal.counter] ?? 0;
  return Math.max(0, now - base);
}

export async function dailyState(
  tx: Prisma.TransactionClient,
  userId: string,
  now = Date.now(),
): Promise<DailyDto> {
  const row = await tx.dailyState.findUnique({ where: { userId } });

  const user = (await tx.user.findUniqueOrThrow({ where: { id: userId } })) as unknown as Record<
    string,
    unknown
  >;

  // No row yet — the very first read of a new account, before any action has
  // run ensureDaily. Derive the card rather than writing from a read path: the
  // day's goals come from the date, and a player who has done nothing today is
  // at zero anyway. The row appears on their first action.
  const day = row?.day ?? dayIndex(now);
  const baseline = (row?.baseline as Snapshot | undefined) ?? snapshotOf(user);
  const claimedMask = row?.claimed ?? 0;
  const picks = dailyPicks(day, levelFromTotalXp(user['xp'] as number).level);

  const goals = picks.map((goal, i) => ({
    id: goal.id,
    text: goal.text,
    target: goal.target,
    current: Math.min(goal.target, progressFor(goal, user, baseline)),
    reward: goal.reward,
    done: (claimedMask & (1 << i)) !== 0,
  }));

  return {
    day,
    resetAt: resetAtFor(day),
    goals,
    streak: row?.streak ?? 0,
    allDone: goals.every((g) => g.done),
  };
}

// ---------------------------------------------------------------------------

export interface DailyCompletion {
  id: string;
  text: string;
  reward: { coins?: number; amber?: number };
}

export interface DailyOutcome {
  completed: DailyCompletion[];
  /** Set when this call was the one that finished the whole day. */
  dayComplete: { streak: number; amber: number; coins: number } | null;
}

/**
 * Pays out any daily goal whose target has just been met.
 *
 * Called after every mutating action, exactly like the main quest chain. The
 * claimed bitmask is set in the same transaction that pays, so a goal cannot
 * pay twice however many actions land at once.
 */
export async function evaluateDaily(
  tx: Prisma.TransactionClient,
  userId: string,
  now = Date.now(),
): Promise<DailyOutcome> {
  await ensureDaily(tx, userId, now);

  const row = await tx.dailyState.findUniqueOrThrow({ where: { userId } });
  const user = (await tx.user.findUniqueOrThrow({ where: { id: userId } })) as unknown as Record<
    string,
    unknown
  >;
  const baseline = row.baseline as Snapshot;
  const picks = dailyPicks(row.day, levelFromTotalXp(user['xp'] as number).level);

  const completed: DailyCompletion[] = [];
  let claimed = row.claimed;

  for (let i = 0; i < picks.length; i++) {
    const goal = picks[i]!;
    const bit = 1 << i;
    if ((claimed & bit) !== 0) continue;
    if (progressFor(goal, user, baseline) < goal.target) continue;

    claimed |= bit;

    if (goal.reward.coins) {
      await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: goal.reward.coins } },
      });
    }
    if (goal.reward.amber) {
      await tx.amberLedger.create({
        data: { userId, delta: goal.reward.amber, reason: 'daily', refId: `${row.day}:${goal.id}` },
      });
    }

    completed.push({ id: goal.id, text: goal.text, reward: goal.reward });
  }

  if (completed.length === 0) return { completed: [], dayComplete: null };

  const allBits = (1 << picks.length) - 1;
  const finishedToday = claimed === allBits && row.lastCompleteDay !== row.day;

  let dayComplete: DailyOutcome['dayComplete'] = null;

  if (finishedToday) {
    const streak = Math.min(DAILY.streakCap, row.streak + 1);
    const coins = DAILY.streakCoins * streak;

    await tx.amberLedger.create({
      data: {
        userId,
        delta: DAILY.completionAmber,
        reason: 'daily_complete',
        refId: String(row.day),
      },
    });
    await tx.user.update({ where: { id: userId }, data: { coins: { increment: coins } } });
    await tx.dailyState.update({
      where: { userId },
      data: { claimed, streak, lastCompleteDay: row.day },
    });

    dayComplete = { streak, amber: DAILY.completionAmber, coins };
  } else {
    await tx.dailyState.update({ where: { userId }, data: { claimed } });
  }

  await tx.eventLog.create({
    data: {
      userId,
      kind: 'daily.complete',
      payload: { day: row.day, ids: completed.map((c) => c.id), dayComplete: dayComplete !== null },
    },
  });

  return { completed, dayComplete };
}
