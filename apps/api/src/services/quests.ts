/**
 * The quest chain.
 *
 * Every quest is satisfied by a monotonic counter on the User row, so the
 * whole chain can be re-evaluated after any action without storing per-quest
 * progress. `questIndex` is the single cursor, and it only moves forward.
 *
 * NOTE: the quest text and reward amounts in game-config are a reconstruction
 * — handoff §4 was not available. The mechanism here is independent of those
 * numbers; reconciling them is a config edit.
 */

import { QUESTS, type QuestDef } from '@ambervale/game-config';
import type { Prisma } from '@prisma/client';

export interface QuestCompletion {
  id: string;
  text: string;
  reward: { coins?: number; amber?: number };
  /** Index of the next quest, or null when the chain is finished. */
  nextIndex: number | null;
}

export interface QuestProgress {
  index: number;
  quest: QuestDef | null;
  current: number;
  target: number;
}

/** Resolves a quest's counter against the player's current state. */
async function counterValue(
  tx: Prisma.TransactionClient,
  userId: string,
  quest: QuestDef,
): Promise<number> {
  if (quest.counter === 'expansionNorth') {
    const expansion = await tx.expansion.findUnique({ where: { userId } });
    return expansion?.north ? 1 : 0;
  }

  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (quest.counter === 'level') return user.level;

  const counters = user as unknown as Record<string, number>;
  return counters[quest.counter] ?? 0;
}

/**
 * Advances the chain as far as the player's counters allow and returns the
 * last quest completed, if any.
 *
 * Called after every mutating action. Rewards are granted exactly once because
 * questIndex advances in the same transaction that pays them.
 */
export async function evaluateQuests(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<QuestCompletion | null> {
  let completed: QuestCompletion | null = null;

  // A single action can finish more than one quest (selling can complete both
  // "sell once" and a level goal), so keep walking until one is unmet.
  for (;;) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const index = user.questIndex;
    const quest = QUESTS[index];
    if (!quest) break;

    const current = await counterValue(tx, userId, quest);
    if (current < quest.target) break;

    if (quest.reward.coins) {
      await tx.user.update({
        where: { id: userId },
        data: { coins: { increment: quest.reward.coins } },
      });
    }
    if (quest.reward.amber) {
      await tx.amberLedger.create({
        data: {
          userId,
          delta: quest.reward.amber,
          reason: 'quest',
          refId: quest.id,
        },
      });
    }

    await tx.user.update({ where: { id: userId }, data: { questIndex: index + 1 } });
    await tx.eventLog.create({
      data: { userId, kind: 'quest.complete', payload: { id: quest.id, index } },
    });

    completed = {
      id: quest.id,
      text: quest.text,
      reward: quest.reward,
      nextIndex: QUESTS[index + 1] ? index + 1 : null,
    };
  }

  return completed;
}

/** Current quest and its progress, for the HUD card. */
export async function questProgress(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<QuestProgress> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const quest = QUESTS[user.questIndex] ?? null;

  if (!quest) return { index: user.questIndex, quest: null, current: 0, target: 0 };

  return {
    index: user.questIndex,
    quest,
    current: await counterValue(tx, userId, quest),
    target: quest.target,
  };
}
