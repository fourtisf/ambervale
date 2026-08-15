/**
 * "Where do I actually do this?"
 *
 * A goal card names a thing to achieve and says nothing about where it
 * happens, which is fine once you know the vale and useless on the first
 * evening. This turns a goal into an action: walk me there, or open the panel
 * where it is done, or — when the goal is impossible right now — say why and
 * take me to the fix instead.
 *
 * Both the daily card and the quest card read from here, because they are the
 * same problem: every goal in the game is measured by one of the counters
 * below, whichever list it came from.
 */

import {
  DAILY_QUESTS,
  NODE_SLOTS,
  PADDOCKS,
  PLOTS,
  QUESTS,
  TILE,
  structureAt,
  type DailyCounter,
  type QuestCounter,
} from '@ambervale/game-config';
import { bridge } from './bridge';
import type { FarmState } from '@/lib/api';

/** Every counter a goal can be measured by, from either list. */
export type GoalCounter = DailyCounter | QuestCounter;

export interface Guidance {
  /** Button text. Says what will happen, not "Go" for everything. */
  label: string;
  /** One line under the goal, when there is something worth warning about. */
  hint?: string;
  /** Runs on click. Closes the sheet it was clicked from first. */
  run: () => void;
}

const px = (t: { x: number; y: number }) => ({
  x: t.x * TILE + TILE / 2,
  y: t.y * TILE + TILE / 2,
});

const centre = (r: { x: number; y: number; w: number; h: number }) =>
  px({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Server-corrected clock, the same one the world uses for countdowns. */
const now = (farm: FarmState) =>
  Date.now() + (farm.serverNow - (farm.__receivedAt ?? farm.serverNow));

const walk = (to: { x: number; y: number }, say?: string): (() => void) => {
  return () => {
    bridge.emit('modal', null);
    bridge.emit('walkTo', to);
    if (say) bridge.toast('info', say);
  };
};

const open = (modal: string): (() => void) => {
  return () => bridge.emit('modal', modal);
};

// ---------------------------------------------------------------------------

const seedCount = (farm: FarmState) => Object.values(farm.seeds).reduce((sum, n) => sum + n, 0);

const bagCount = (farm: FarmState) => Object.values(farm.inventory).reduce((sum, n) => sum + n, 0);

/** A plot to plant in: the first bare one the player owns. */
function barePlot(farm: FarmState) {
  const plot = farm.plots.find((p) => !p.cropKey);
  const slot = PLOTS.find((s) => s.index === plot?.index) ?? PLOTS[0]!;
  return px(slot);
}

/** The crop worth walking to: ready if any, else the one closest to ready. */
function cropToVisit(farm: FarmState): { at: { x: number; y: number }; waitMs: number | null } {
  const planted = farm.plots.filter((p) => p.cropKey && p.readyAt !== null);
  if (planted.length === 0) return { at: barePlot(farm), waitMs: null };

  const t = now(farm);
  const sorted = [...planted].sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0));
  const ready = sorted.find((p) => (p.readyAt ?? 0) <= t);
  const target = ready ?? sorted[0]!;
  const slot = PLOTS.find((s) => s.index === target.index);

  return {
    at: slot ? px(slot) : barePlot(farm),
    waitMs: ready ? null : Math.max(0, (target.readyAt ?? 0) - t),
  };
}

/** The nearest node of a kind that is actually standing, with its wait. */
function nodeToVisit(farm: FarmState, kind: 'oak' | 'rock') {
  const t = now(farm);
  const mine = farm.nodes.filter((n) => n.kind === kind);
  const standing = mine.find((n) => n.hp > 0);
  const soonest = [...mine].sort((a, b) => (a.respawnAt ?? 0) - (b.respawnAt ?? 0))[0];
  const chosen = standing ?? soonest;

  const slot =
    NODE_SLOTS.find((s) => s.index === chosen?.index) ?? NODE_SLOTS.find((s) => s.kind === kind)!;

  return {
    at: px(slot),
    waitMs: standing ? null : Math.max(0, (soonest?.respawnAt ?? 0) - t),
  };
}

const secs = (ms: number) => `${Math.max(1, Math.ceil(ms / 1000))}s`;

// ---------------------------------------------------------------------------

/**
 * What to do about a goal measured by this counter.
 *
 * Every branch that cannot be satisfied right now says so and offers the step
 * before it — no seeds sends you to the market rather than to an empty field,
 * which is the difference between a hint and an errand.
 */
export function guidanceFor(counter: GoalCounter, farm: FarmState): Guidance {
  switch (counter) {
    case 'plantedCount': {
      if (seedCount(farm) === 0) {
        return {
          label: 'Buy seeds',
          hint: 'Your seed bag is empty — the market sells them.',
          run: open('market'),
        };
      }
      return {
        label: 'Go to the field',
        run: walk(barePlot(farm), 'Stand on a bare plot and press the action button.'),
      };
    }

    case 'harvestedCount': {
      const crop = cropToVisit(farm);
      if (crop.waitMs === null && farm.plots.every((p) => !p.cropKey)) {
        return seedCount(farm) === 0
          ? {
              label: 'Buy seeds',
              hint: 'Nothing is planted, and you have no seeds.',
              run: open('market'),
            }
          : {
              label: 'Plant first',
              hint: 'Nothing is growing yet.',
              run: walk(barePlot(farm), 'Plant something — it can be harvested once it is ready.'),
            };
      }
      return {
        label: 'Go to the crop',
        hint: crop.waitMs === null ? undefined : `Nearest crop is ready in ${secs(crop.waitMs)}.`,
        run: walk(crop.at, 'Stand on the crop and press the action button.'),
      };
    }

    case 'choppedCount': {
      const oak = nodeToVisit(farm, 'oak');
      return {
        label: 'Go to the oaks',
        hint:
          oak.waitMs === null
            ? undefined
            : `All felled — the first regrows in ${secs(oak.waitMs)}.`,
        run: walk(oak.at, 'Three swings fells an oak.'),
      };
    }

    case 'minedCount': {
      const rock = nodeToVisit(farm, 'rock');
      return {
        label: 'Go to the rocks',
        hint:
          rock.waitMs === null
            ? undefined
            : `All broken — the first returns in ${secs(rock.waitMs)}.`,
        run: walk(rock.at, 'Swing at the rock to break it.'),
      };
    }

    case 'soldCount': {
      if (bagCount(farm) === 0) {
        return {
          label: 'Go to the field',
          hint: 'Your bag is empty — harvest something to sell.',
          run: walk(cropToVisit(farm).at, 'Harvest a crop, then sell it at the market.'),
        };
      }
      return { label: 'Open the market', run: open('market') };
    }

    case 'eggCount': {
      const ready = farm.animals.some((a) => a.kind === 'chicken' && a.ready);
      const next = farm.animals
        .filter((a) => a.kind === 'chicken')
        .sort((a, b) => a.nextYieldAt - b.nextYieldAt)[0];
      return {
        label: 'Go to the coop',
        hint:
          ready || !next
            ? undefined
            : `Next egg in ${secs(Math.max(0, next.nextYieldAt - now(farm)))}.`,
        run: walk(centre(PADDOCKS.coop), 'Stand by a hen and press the action button.'),
      };
    }

    case 'milkCount': {
      const cow = farm.animals.find((a) => a.kind === 'cow');
      return {
        label: 'Go to the cow',
        hint:
          !cow || cow.ready
            ? undefined
            : `Ready in ${secs(Math.max(0, cow.nextYieldAt - now(farm)))}.`,
        run: walk(centre(PADDOCKS.cow), 'Stand by the cow and press the action button.'),
      };
    }

    case 'deliveriesDone': {
      const open_ = farm.deliverySlots.some((s) => s.unlocked);
      if (!open_) {
        return {
          label: 'Go to the board',
          hint: 'No order slot is open yet — reputation unlocks them.',
          run: walk(px(structureAt('board')), 'Orders open as your reputation grows.'),
        };
      }
      return { label: 'Open orders', run: open('deliveries') };
    }

    case 'fishCount': {
      if (!farm.effects.canFish) {
        return {
          label: 'Buy a rod',
          hint: 'Fishing needs a rod — the market sells one.',
          run: open('market'),
        };
      }
      return {
        label: 'Go to the dock',
        run: walk(px(structureAt('dock')), 'Cast from the dock with the action button.'),
      };
    }

    case 'craftCount': {
      return {
        label: 'Go to the mill',
        run: walk(px(structureAt('windmill')), 'At the mill, press the action button to craft.'),
      };
    }

    // The quest chain measures four things the daily list never does.

    case 'level': {
      return {
        label: 'Go to the field',
        hint: 'Levels come from doing anything at all — planting, chopping, selling.',
        run: walk(barePlot(farm), 'Every action pays experience. The field is the fastest.'),
      };
    }

    case 'expansionNorth': {
      return { label: 'Open expansion', run: open('expand') };
    }

    case 'upgradesBought': {
      return { label: 'Open upgrades', run: open('market:upgrades') };
    }

    case 'renown': {
      return {
        label: 'Open the fund',
        hint: 'Renown is bought from the Vale Fund, on the upgrades tab.',
        run: open('market:upgrades'),
      };
    }

    default:
      return { label: 'Show me', run: walk(px(structureAt('house'))) };
  }
}

/**
 * The counter behind a goal id, from either list.
 *
 * The API sends the id and the progress but not the counter — it does not need
 * to, since both goal tables ship in game-config and the client already has
 * them.
 */
export function counterForGoal(id: string): GoalCounter | null {
  const daily = DAILY_QUESTS.find((q) => q.id === id);
  if (daily) return daily.counter;
  return QUESTS.find((q) => q.id === id)?.counter ?? null;
}

/** Guidance for a goal id, or null when the id is not one we can place. */
export function guidanceForGoal(id: string, farm: FarmState): Guidance | null {
  const counter = counterForGoal(id);
  return counter ? guidanceFor(counter, farm) : null;
}
