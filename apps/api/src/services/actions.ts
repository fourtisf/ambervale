/**
 * Shared mechanics for every mutating action.
 *
 * The rule for this whole file: the client's request says *what* it wants to
 * do, never *what the result should be*. Quantities, prices and XP are always
 * recomputed here from game-config and the database, so a tampered payload
 * changes nothing that matters.
 */

import {
  LEVEL_REWARDS,
  type CropKey,
  type ItemKey,
  type LevelReward,
  sellPrice,
} from '@ambervale/game-config';
import type { Prisma } from '@prisma/client';
import { evaluateDaily, type DailyOutcome } from './daily';
import { applyXp } from './progression';
import { evaluateQuests, type QuestCompletion } from './quests';

/** Adds (or removes, with a negative qty) an inventory item. Never goes below 0. */
export async function addItem(
  tx: Prisma.TransactionClient,
  userId: string,
  itemKey: string,
  qty: number,
): Promise<number> {
  const row = await tx.inventoryItem.upsert({
    where: { userId_itemKey: { userId, itemKey } },
    create: { userId, itemKey, qty: Math.max(0, qty) },
    update: { qty: { increment: qty } },
  });

  if (row.qty < 0) {
    // Should be unreachable — callers check first — but a negative stack would
    // be a duplication bug waiting to happen, so clamp rather than trust.
    const fixed = await tx.inventoryItem.update({
      where: { id: row.id },
      data: { qty: 0 },
    });
    return fixed.qty;
  }
  return row.qty;
}

export async function addSeed(
  tx: Prisma.TransactionClient,
  userId: string,
  cropKey: string,
  qty: number,
): Promise<number> {
  const row = await tx.seedItem.upsert({
    where: { userId_cropKey: { userId, cropKey } },
    create: { userId, cropKey, qty: Math.max(0, qty) },
    update: { qty: { increment: qty } },
  });
  if (row.qty < 0) {
    const fixed = await tx.seedItem.update({ where: { id: row.id }, data: { qty: 0 } });
    return fixed.qty;
  }
  return row.qty;
}

export async function itemQty(
  tx: Prisma.TransactionClient,
  userId: string,
  itemKey: string,
): Promise<number> {
  const row = await tx.inventoryItem.findUnique({
    where: { userId_itemKey: { userId, itemKey } },
  });
  return row?.qty ?? 0;
}

export async function seedQty(
  tx: Prisma.TransactionClient,
  userId: string,
  cropKey: string,
): Promise<number> {
  const row = await tx.seedItem.findUnique({ where: { userId_cropKey: { userId, cropKey } } });
  return row?.qty ?? 0;
}

/** Coin value of a stack, priced from game-config — never from the request. */
export const stackValue = (itemKey: ItemKey, qty: number): number => sellPrice(itemKey) * qty;

export interface GrantOptions {
  xp?: number;
  coins?: number;
  rep?: number;
  /** Counter columns to bump, e.g. { plantedCount: 1 }. */
  counters?: Record<string, number>;
}

export interface LevelRewardGrant {
  level: number;
  reward: LevelReward;
}

export interface GrantResult {
  level: number;
  xp: number;
  coins: number;
  rep: number;
  levelUps: number[];
  /** Payouts for levels crossed by this grant, in order. */
  levelRewards: LevelRewardGrant[];
}

/**
 * Applies XP, coins, rep and counters in one update, and returns the levels
 * crossed so the client can play the celebration.
 *
 * Level rewards are paid here rather than at the call sites: every action that
 * can grant XP funnels through this function, so this is the one place where
 * "crossed a level" is known, and paying anywhere else would mean either
 * duplicating the check or missing a route.
 */
export async function grant(
  tx: Prisma.TransactionClient,
  userId: string,
  options: GrantOptions,
): Promise<GrantResult> {
  const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });

  const xpGrant = applyXp(current.xp, options.xp ?? 0);

  const data: Prisma.UserUpdateInput = {
    xp: xpGrant.xp,
    level: xpGrant.level,
  };
  if (options.coins) data.coins = { increment: options.coins };
  if (options.rep) data.rep = { increment: options.rep };
  for (const [key, amount] of Object.entries(options.counters ?? {})) {
    (data as Record<string, unknown>)[key] = { increment: amount };
  }

  let updated = await tx.user.update({ where: { id: userId }, data });

  const levelRewards = await payLevelRewards(tx, userId, xpGrant.levelUps);
  if (levelRewards.length > 0) {
    // Rewards moved the coin balance after the update above, so re-read rather
    // than report a figure that is already stale.
    updated = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  }

  return {
    level: updated.level,
    xp: updated.xp,
    coins: updated.coins,
    rep: updated.rep,
    levelUps: xpGrant.levelUps,
    levelRewards,
  };
}

/** Pays the one-off reward attached to each level just crossed. */
async function payLevelRewards(
  tx: Prisma.TransactionClient,
  userId: string,
  levelUps: number[],
): Promise<LevelRewardGrant[]> {
  const paid: LevelRewardGrant[] = [];

  for (const level of levelUps) {
    const reward = LEVEL_REWARDS[level];
    if (!reward) continue;

    if (reward.coins) {
      await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: reward.coins } },
      });
    }
    if (reward.amber) {
      await tx.amberLedger.create({
        data: { userId, delta: reward.amber, reason: 'level', refId: String(level) },
      });
    }
    for (const [cropKey, qty] of Object.entries(reward.seeds ?? {}) as [CropKey, number][]) {
      await addSeed(tx, userId, cropKey, qty);
    }

    await tx.eventLog.create({
      data: { userId, kind: 'level.reward', payload: { level, reward: JSON.stringify(reward) } },
    });

    paid.push({ level, reward });
  }

  return paid;
}

/**
 * Everything that has to be re-checked after a mutating action.
 *
 * The quest chain and the daily goals both read the same monotonic counters,
 * so they are always evaluated together — separating them would mean every new
 * endpoint has to remember two calls instead of one, and forgetting the second
 * would silently stop paying dailies.
 */
export async function evaluateProgress(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ questCompleted: QuestCompletion | null; daily: DailyOutcome }> {
  const questCompleted = await evaluateQuests(tx, userId);
  const daily = await evaluateDaily(tx, userId);
  return { questCompleted, daily };
}

export async function logEvent(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await tx.eventLog.create({ data: { userId, kind, payload } });
}
