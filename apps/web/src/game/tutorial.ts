/**
 * The ten-step guided tutorial.
 *
 * Each step declares where to look, where "Guide me" should walk you, and the
 * condition that completes it. Conditions are read from authoritative farm
 * state — never from a local flag — so refreshing mid-tutorial resumes exactly
 * where you were, and you cannot advance by lying to the client.
 *
 * NOTE: the prototype's TUT array was not available, so the copy here is
 * written from the Phase 5 brief rather than ported. The step order, targets
 * and completion conditions follow it exactly.
 */

import { FIELD_CENTER, NODE_SLOTS, PLOTS, SPAWN, TILE, structureAt } from '@ambervale/game-config';
import type { FarmState } from '@/lib/api';

export const TUTORIAL_DONE = 99;

export interface TutorialStep {
  /** Headline shown in the banner; may read live state. */
  text: (farm: FarmState) => string;
  /** World point the marker sits on, or null for pure text steps. */
  target: (farm: FarmState) => { x: number; y: number } | null;
  /** Where "Guide me" walks the player. Reads state so it can target the
   *  plot or node that is actually relevant right now. */
  approach: (farm: FarmState) => { x: number; y: number };
  /** True once the player has done the thing. */
  done: (farm: FarmState) => boolean;
  /** Text steps get a Next button instead of waiting for an action. */
  textOnly?: boolean;
  /** Force this seed selected while the step is active. */
  forceSeed?: 'sunflower';
}

const px = (tx: number, ty: number) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

const firstBasePlot = (farm: FarmState) => {
  const empty = farm.plots.find((p) => p.zone === 'base' && !p.cropKey);
  const slot = PLOTS.find((s) => s.index === (empty?.index ?? 0));
  return slot ? px(slot.x, slot.y) : px(FIELD_CENTER.x, FIELD_CENTER.y);
};

const growingPlot = (farm: FarmState) => {
  const growing = farm.plots.find((p) => p.cropKey);
  const slot = PLOTS.find((s) => s.index === growing?.index);
  return slot ? px(slot.x, slot.y) : firstBasePlot(farm);
};

const nearestOak = () => {
  const oak = NODE_SLOTS.find((n) => n.kind === 'oak');
  return oak ? px(oak.x, oak.y) : px(SPAWN.x, SPAWN.y);
};

const marketPoint = () => {
  const s = structureAt('market');
  return px(s.x, s.y);
};

const boardPoint = () => {
  const s = structureAt('board');
  return px(s.x, s.y);
};

/**
 * How much of a counter belongs to *this* run through the tutorial.
 *
 * Lifetime totals would make a replay finish itself: someone who has planted
 * a hundred crops already satisfies "plant three" the instant they restart.
 * The server snapshots the counters when the tutorial starts, and the steps
 * read the difference. `tutorialBase` is absent for everyone who never
 * replayed, which is the same as a baseline of zero.
 */
const counter = (farm: FarmState, key: string) =>
  Math.max(0, (farm.user.counters[key] ?? 0) - (farm.user.tutorialBase?.[key] ?? 0));

/** Milliseconds left on the earliest growing crop, or null. */
export function soonestReadyMs(farm: FarmState): number | null {
  const now = Date.now() + (farm.serverNow - (farm.__receivedAt ?? farm.serverNow));
  const times = farm.plots
    .filter((p) => p.readyAt !== null)
    .map((p) => p.readyAt! - now)
    .filter((ms) => ms > 0);
  return times.length > 0 ? Math.min(...times) : null;
}

export const TUTORIAL: TutorialStep[] = [
  {
    // 0 — intro
    text: () => 'Welcome to Ambervale. This little farm is yours; let me show you around.',
    target: () => null,
    approach: () => px(SPAWN.x, SPAWN.y),
    done: () => false,
    textOnly: true,
  },
  {
    // 1 — walk into the field
    text: () => 'Head into the fenced field, just south of you.',
    target: () => px(FIELD_CENTER.x, FIELD_CENTER.y),
    approach: () => px(FIELD_CENTER.x, FIELD_CENTER.y),
    // Proximity is checked by the runner, which knows where the player is.
    done: () => false,
  },
  {
    // 2 — plant a sunflower
    text: () => 'Stand on a bare plot and plant a sunflower.',
    target: firstBasePlot,
    approach: () => px(PLOTS[0]!.x, PLOTS[0]!.y),
    done: (farm) => counter(farm, 'plantedCount') >= 1,
    forceSeed: 'sunflower',
  },
  {
    // 3 — chop an oak while it grows
    text: () => 'It needs a moment. Fell an oak while you wait — three swings.',
    target: nearestOak,
    approach: nearestOak,
    done: (farm) => counter(farm, 'choppedCount') >= 1 || (farm.inventory['wood'] ?? 0) > 0,
  },
  {
    // 4 — harvest the first crop
    text: (farm) => {
      const ms = soonestReadyMs(farm);
      return ms === null
        ? 'Your sunflower is ready — go and harvest it.'
        : `Ready in ${Math.ceil(ms / 1000)}s. Stay close.`;
    },
    target: growingPlot,
    approach: growingPlot,
    done: (farm) => counter(farm, 'harvestedCount') >= 1,
  },
  {
    // 5 — three crops planted
    text: (farm) => `Plant three crops so the field is working. ${counter(farm, 'plantedCount')}/3`,
    target: firstBasePlot,
    approach: () => px(FIELD_CENTER.x, FIELD_CENTER.y),
    done: (farm) => counter(farm, 'plantedCount') >= 3,
    forceSeed: 'sunflower',
  },
  {
    // 6 — sell at the market
    text: () => 'Take your harvest to the market and sell it.',
    target: marketPoint,
    approach: marketPoint,
    done: (farm) => counter(farm, 'soldCount') >= 1,
  },
  {
    // 7 — buy five sunflower seeds
    text: (farm) => `Buy sunflower seeds — five of them. ${counter(farm, 'boughtSeeds')}/5`,
    target: marketPoint,
    approach: marketPoint,
    done: (farm) => counter(farm, 'boughtSeeds') >= 5,
  },
  {
    // 8 — reach level 3
    text: (farm) => `Keep the field turning until you reach level 3. Level ${farm.user.level}/3`,
    target: () => px(FIELD_CENTER.x, FIELD_CENTER.y),
    approach: () => px(FIELD_CENTER.x, FIELD_CENTER.y),
    done: (farm) => farm.user.level >= 3,
  },
  {
    // 9 — complete a delivery
    text: () => 'The delivery board is open. Fill an order to earn your first $AMBER.',
    target: boardPoint,
    approach: boardPoint,
    done: (farm) => counter(farm, 'deliveriesDone') >= 1,
  },
];

/** How close counts as "in the field" for step 1. */
export const FIELD_PROXIMITY = 150;
