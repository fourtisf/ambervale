/**
 * XP, levels and the $AMBER balance.
 *
 * Levels are recomputed from total XP by walking the curve, so a level can
 * never disagree with the XP that earned it — and retuning XP_FOR_LEVEL in
 * game-config re-levels everyone consistently without a migration.
 */

import { XP_FOR_LEVEL } from '@ambervale/game-config';
import type { Prisma } from '@prisma/client';

/** Levels are capped so a bug cannot spin the loop forever. */
const MAX_LEVEL = 200;

export interface LevelState {
  level: number;
  /** XP accumulated toward the next level. */
  xpIntoLevel: number;
  /** XP required to leave the current level. */
  xpForNext: number;
}

/** Walks the curve from level 1 to find where `totalXp` lands. */
export function levelFromTotalXp(totalXp: number): LevelState {
  let level = 1;
  let remaining = Math.max(0, totalXp);

  while (level < MAX_LEVEL) {
    const need = XP_FOR_LEVEL(level);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }

  return { level, xpIntoLevel: remaining, xpForNext: XP_FOR_LEVEL(level) };
}

export interface XpGrant {
  xp: number;
  level: number;
  /** Levels crossed by this grant, so the client can play the celebration. */
  levelUps: number[];
}

/**
 * Adds XP to a user's running total and returns the new level, plus every
 * level crossed on the way.
 */
export function applyXp(currentXp: number, gain: number): XpGrant {
  const before = levelFromTotalXp(currentXp).level;
  const xp = currentXp + Math.max(0, gain);
  const after = levelFromTotalXp(xp).level;

  const levelUps: number[] = [];
  for (let lv = before + 1; lv <= after; lv++) levelUps.push(lv);

  return { xp, level: after, levelUps };
}

/**
 * $AMBER balance is SUM(delta) over the append-only ledger — never a stored
 * column, so it cannot drift from its own history.
 */
export async function amberBalance(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const agg = await tx.amberLedger.aggregate({
    where: { userId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}
