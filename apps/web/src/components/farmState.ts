'use client';

/**
 * Shared plumbing for every sheet that mutates the farm.
 *
 * Lives in its own module rather than in ModalHost so the economy sheets can
 * use it without importing their own host — one authoritative `commit`, so
 * there is exactly one place that decides what a reply is allowed to change.
 */

import { useEffect, useState } from 'react';
import { bridge } from '@/game/bridge';
import { ApiRequestError, type FarmState } from '@/lib/api';
import { audio } from '@/lib/audio';

export interface ActionReply {
  farm: FarmState;
  levelUps?: number[];
  levelRewards?: { level: number; reward: { note?: string; coins?: number; amber?: number } }[];
  coinsGained?: number;
  daily?: {
    completed: { id: string; text: string; reward: { coins?: number; amber?: number } }[];
    dayComplete: { streak: number; amber: number; coins: number } | null;
  };
  [key: string]: unknown;
}

/** Applies a server reply everywhere and plays whatever it earned. */
export function commit(reply: ActionReply): void {
  reply.farm.__receivedAt = Date.now();
  bridge.emit('farm', reply.farm);

  for (const level of reply.levelUps ?? []) {
    audio.levelUp();
    bridge.toast('good', `Level ${level}!`);
  }

  for (const lr of reply.levelRewards ?? []) {
    const parts: string[] = [];
    if (lr.reward.coins) parts.push(`+${lr.reward.coins} coins`);
    if (lr.reward.amber) parts.push(`+${lr.reward.amber} $AMBER`);
    if (lr.reward.note) parts.push(lr.reward.note);
    if (parts.length > 0) bridge.toast('good', `Level ${lr.level}: ${parts.join(' · ')}`);
  }

  for (const goal of reply.daily?.completed ?? []) {
    const reward = goal.reward.amber
      ? `+${goal.reward.amber} $AMBER`
      : `+${goal.reward.coins ?? 0} coins`;
    bridge.toast('good', `Daily done: ${goal.text} ${reward}`);
  }

  if (reply.daily?.dayComplete) {
    const d = reply.daily.dayComplete;
    audio.amber();
    bridge.toast(
      'good',
      `All daily goals cleared — ${d.streak}-day streak, +${d.amber} $AMBER and +${d.coins} coins.`,
    );
  }
}

export function useFarm(): FarmState | null {
  const [farm, setFarm] = useState<FarmState | null>(bridge.farm);
  useEffect(() => bridge.on('farm', setFarm), []);
  return farm;
}

export function reportError(err: unknown): void {
  audio.error();
  bridge.toast('warn', err instanceof ApiRequestError ? err.message : 'Something went wrong.');
}
