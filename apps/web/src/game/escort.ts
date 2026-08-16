/**
 * Staying with a task until it is actually finished.
 *
 * `guidance.ts` answers "where do I do this?" once, at the moment a button is
 * clicked, and then lets go. That produced the worst moment in the game: the
 * daily card offered "Go to the cow", walked you there, and toasted "stand by
 * the cow and press the action button" — while the cow's milk was still 1
 * second away, so the action button was blank. Told to press a button that
 * cannot exist, standing in the right place, with nothing on screen to say so.
 *
 * The difference here is that this is asked *every second* rather than once.
 * It reports what to do at this instant and whether it can be done at this
 * instant, so a banner reading from it says "milk ready in 8s" and then
 * "press the action button" on its own, without the player having to guess
 * which of the two is currently true.
 */

import {
  ANIMALS,
  CROWS,
  NODE_SLOTS,
  PADDOCKS,
  PLOTS,
  TILE,
  structureAt,
} from '@ambervale/game-config';
import type { GoalCounter } from './guidance';
import type { FarmState } from '@/lib/api';

/**
 * The interaction each goal is waiting for the player to be standing next to.
 *
 * Null for goals done from a panel. Used to tell "the thing is ready" apart
 * from "the thing is ready and you are close enough to do it" — a distinction
 * that decided, by three pixels, whether the cow goal worked at all.
 */
export const EXPECTED_KIND: Partial<Record<GoalCounter, string>> = {
  plantedCount: 'plant',
  harvestedCount: 'harvest',
  wateredCount: 'water',
  shooedCount: 'shoo',
  choppedCount: 'chop',
  minedCount: 'mine',
  eggCount: 'egg',
  milkCount: 'milk',
  fishCount: 'fish',
  craftCount: 'mill',
};

export interface Escort {
  /** What to do right now, one sentence, rewritten as the world changes. */
  text: string;
  /**
   * Whether the thing can be done this instant.
   *
   * False means waiting is correct — a countdown, a regrowing oak, a hen that
   * has not laid. The banner shows this differently rather than nagging.
   */
  ready: boolean;
  /** Where to stand. Null when the task is done from a panel, not the world. */
  at: { x: number; y: number } | null;
}

const px = (t: { x: number; y: number }) => ({
  x: t.x * TILE + TILE / 2,
  y: t.y * TILE + TILE / 2,
});

const now = (farm: FarmState) =>
  Date.now() + (farm.serverNow - (farm.__receivedAt ?? farm.serverNow));

/** "8s", "3m 20s" — a wait a person can act on rather than a millisecond count. */
export function countdown(ms: number): string {
  const total = Math.max(1, Math.ceil(ms / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

const seedCount = (farm: FarmState) => Object.values(farm.seeds).reduce((sum, n) => sum + n, 0);
const bagCount = (farm: FarmState) => Object.values(farm.inventory).reduce((sum, n) => sum + n, 0);

const plotAt = (index: number) => {
  const slot = PLOTS.find((s) => s.index === index);
  return slot ? px(slot) : null;
};

/**
 * Where the cow's interaction actually sits.
 *
 * Not the middle of the paddock: the cow stands at a fixed offset inside it,
 * and Interactions.ts computes that offset from the herd size. Walking someone
 * to the paddock centre and telling them to press a button is how this whole
 * thing went wrong once already, so the two formulas have to agree.
 */
export function cowSpot(): { x: number; y: number } {
  const p = PADDOCKS.cow;
  const t = (ANIMALS.chicken.count + 1) / 5;
  return { x: (p.x + p.w * t) * TILE, y: (p.y + p.h * (0.3 + 0.4 * t)) * TILE };
}

/** What to do about this counter, right now. Called once a second. */
export function escortFor(counter: GoalCounter, farm: FarmState): Escort {
  const t = now(farm);

  switch (counter) {
    case 'plantedCount': {
      if (seedCount(farm) === 0) {
        return { text: 'Your seed bag is empty. Buy seeds at the market.', ready: false, at: null };
      }
      const bare = farm.plots.find((p) => !p.cropKey);
      if (!bare) return { text: 'Every plot is full. Harvest one first.', ready: false, at: null };
      return {
        text: 'Stand on the bare plot and press the action button.',
        ready: true,
        at: plotAt(bare.index),
      };
    }

    case 'harvestedCount': {
      const planted = farm.plots.filter((p) => p.cropKey && p.readyAt !== null);
      if (planted.length === 0) {
        return seedCount(farm) === 0
          ? {
              text: 'Nothing is planted and you have no seeds. Buy some first.',
              ready: false,
              at: null,
            }
          : { text: 'Nothing is growing yet. Plant something first.', ready: false, at: null };
      }
      const sorted = [...planted].sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0));
      const ready = sorted.find((p) => (p.readyAt ?? 0) <= t);
      if (ready) {
        return {
          text: 'Stand on the ripe crop and press the action button.',
          ready: true,
          at: plotAt(ready.index),
        };
      }
      const soonest = sorted[0]!;
      return {
        text: `Wait here — the crop ripens in ${countdown((soonest.readyAt ?? 0) - t)}.`,
        ready: false,
        at: plotAt(soonest.index),
      };
    }

    case 'choppedCount':
    case 'minedCount': {
      const kind = counter === 'choppedCount' ? 'oak' : 'rock';
      const mine = farm.nodes.filter((n) => n.kind === kind);
      const standing = mine.find((n) => n.hp > 0);
      const noun = kind === 'oak' ? 'oak' : 'rock';
      if (standing) {
        const slot = NODE_SLOTS.find((s) => s.index === standing.index);
        return {
          text: `Stand by the ${noun} and press the action button until it falls.`,
          ready: true,
          at: slot ? px(slot) : null,
        };
      }
      const soonest = [...mine].sort((a, b) => (a.respawnAt ?? 0) - (b.respawnAt ?? 0))[0];
      const slot = NODE_SLOTS.find((s) => s.index === soonest?.index);
      return {
        text: `All cleared — the first ${noun} returns in ${countdown((soonest?.respawnAt ?? 0) - t)}.`,
        ready: false,
        at: slot ? px(slot) : null,
      };
    }

    case 'soldCount': {
      if (bagCount(farm) === 0) {
        return {
          text: 'Your bag is empty. Harvest or gather something first.',
          ready: false,
          at: null,
        };
      }
      return { text: 'Open the market and sell anything in your bag.', ready: true, at: null };
    }

    case 'eggCount': {
      const hens = farm.animals.filter((a) => a.kind === 'chicken');
      const ready = hens.filter((h) => h.ready || h.nextYieldAt <= t).length;
      const spot = px({
        x: PADDOCKS.coop.x + PADDOCKS.coop.w / 2,
        y: PADDOCKS.coop.y + PADDOCKS.coop.h / 2,
      });
      if (ready > 0) {
        return {
          text: `${ready} egg${ready > 1 ? 's' : ''} waiting. Stand by a hen and press the action button.`,
          ready: true,
          at: spot,
        };
      }
      const next = [...hens].sort((a, b) => a.nextYieldAt - b.nextYieldAt)[0];
      return {
        text: next
          ? `Wait by the coop — the next egg is laid in ${countdown(next.nextYieldAt - t)}.`
          : 'No hens yet.',
        ready: false,
        at: spot,
      };
    }

    case 'milkCount': {
      const cow = farm.animals.find((a) => a.kind === 'cow');
      const spot = cowSpot();
      if (!cow) return { text: 'No cow yet.', ready: false, at: null };
      // Same clock the interaction uses, for the same reason: the server's
      // `ready` flag is only as fresh as the last action, and this banner is
      // the thing telling the player whether to press or to wait.
      if (cow.ready || cow.nextYieldAt <= t) {
        return { text: 'Stand by the cow and press the action button.', ready: true, at: spot };
      }
      // The exact case that started all this. Standing here is correct; the
      // banner just has to say so instead of demanding a press.
      return {
        text: `Wait by the cow — she can be milked again in ${countdown(cow.nextYieldAt - t)}.`,
        ready: false,
        at: spot,
      };
    }

    case 'wateredCount': {
      const thirsty = farm.plots.filter((p) => p.cropKey && !p.watered);
      if (thirsty.length === 0) {
        return seedCount(farm) === 0
          ? {
              text: 'Nothing to water, and no seeds to plant. Buy seeds first.',
              ready: false,
              at: null,
            }
          : {
              text: 'Nothing is growing that still wants water. Plant something.',
              ready: false,
              at: null,
            };
      }
      return {
        text: 'Stand on the growing crop and press the action button to water it.',
        ready: true,
        at: plotAt(thirsty[0]!.index),
      };
    }

    case 'shooedCount': {
      const withCrow = farm.plots.find((p) => p.crow);
      if (withCrow) {
        return {
          text: 'A crow is on that plot. Get close and press the action button.',
          ready: true,
          at: plotAt(withCrow.index),
        };
      }
      // Crows come for crops left ripe, so the honest instruction is to leave
      // one standing — not to hunt for a bird that has no reason to arrive.
      const ripe = farm.plots.find((p) => p.cropKey && (p.readyAt ?? Infinity) <= t);
      const soonest = farm.plots
        .filter((p) => p.cropKey && (p.readyAt ?? 0) > t)
        .sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0))[0];
      if (ripe) {
        return {
          text: `No crow yet. Leave the ripe crop standing — one lands within ${countdown(CROWS.graceMs)}.`,
          ready: false,
          at: plotAt(ripe.index),
        };
      }
      return {
        text: soonest
          ? `Crows only come for ripe crops. One ripens in ${countdown((soonest.readyAt ?? 0) - t)}.`
          : 'Crows only come for ripe crops. Plant something and let it stand.',
        ready: false,
        at: soonest ? plotAt(soonest.index) : null,
      };
    }

    case 'boughtSeeds':
      return { text: 'Open the market and buy any seed.', ready: true, at: null };

    case 'deliveriesDone': {
      const ready = farm.deliverySlots.some((s) => s.unlocked && s.itemKey);
      return ready
        ? { text: 'Open Orders and fill any order you have the goods for.', ready: true, at: null }
        : { text: 'No order is waiting yet. Reputation opens more slots.', ready: false, at: null };
    }

    case 'fishCount': {
      if (!farm.effects.canFish) {
        return { text: 'Fishing needs a rod — the market sells one.', ready: false, at: null };
      }
      return {
        text: 'Stand on the dock and press the action button to cast.',
        ready: true,
        at: px(structureAt('dock')),
      };
    }

    case 'craftCount': {
      if (!farm.effects.canCraft) {
        return {
          text: 'Crafting needs a millstone — buy one at the market.',
          ready: false,
          at: null,
        };
      }
      return {
        text: 'Stand at the mill and press the action button to craft.',
        ready: true,
        at: px(structureAt('windmill')),
      };
    }

    case 'upgradesBought':
      return { text: 'Open the market’s Upgrades tab and buy any tier.', ready: true, at: null };

    case 'expansionNorth':
      return { text: 'Open the expansion sheet and buy the north meadow.', ready: true, at: null };

    case 'renown':
      return { text: 'Renown comes from the Vale Fund and from building.', ready: true, at: null };

    case 'level':
      return {
        text: 'Every action pays experience. The field is the fastest.',
        ready: true,
        at: null,
      };

    default:
      return { text: 'Keep going.', ready: true, at: null };
  }
}
