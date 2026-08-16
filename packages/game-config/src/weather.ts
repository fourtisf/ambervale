/**
 * What makes today different from yesterday.
 *
 * The farm had no decisions in it. Profit per second per plot ran 0.23 for
 * sunflower, 0.26 carrot, 0.40 pumpkin, 0.58 starglow — every crop strictly
 * beaten by the next one, forever. Once starglow unlocked there was no reason
 * to plant anything else, ever, so the player never chose anything; they only
 * executed the obvious. And every day was the same day.
 *
 * Two things rotate here, both derived from the day number alone so there is
 * nothing to schedule and everyone alive on the same date sees the same world:
 *
 *   - The SKY changes how the farm works today, and can be seen out the
 *     window. It never does harm retroactively — see the note on `growth`.
 *   - DEMAND changes what is worth growing. One good is sought after, one is
 *     glutted. A 1.6x bounty on pumpkin lifts it to 0.64/sec, which genuinely
 *     beats starglow: that single number is what turns an automatic answer
 *     back into a choice.
 */

import { dayIndex } from './economy';
import { ITEM_KEYS, type ItemKey } from './tuning';

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

export type SkyKey = 'clear' | 'rain' | 'mist' | 'golden';

export interface SkyDef {
  name: string;
  /** One line, said the way someone looking out of a window would say it. */
  blurb: string;
  /**
   * Multiplier on crop growing time. Below 1 is faster.
   *
   * Only ever <= 1. Ready-at is recomputed from plantedAt on every read rather
   * than stored, so a multiplier above 1 would drag a crop that was already
   * ready back to unready the moment the date rolled over — a player logging
   * in to find yesterday's finished harvest un-finished. Bad weather pays less
   * (see DEMAND); it does not take work back.
   */
  growth: number;
  /**
   * Extra quiet time before a crow lands, in ms — added, not multiplied.
   *
   * The scarecrow's effect is itself a bonus on top of CROWS.graceMs, so
   * scaling it would hand a player with no scarecrow two times nothing. Base
   * grace is 90s; 90s here doubles the peace for everybody.
   */
  crowGraceMs: number;
  /** Multiplier on every sale today, before saturation and the cellar. */
  sell: number;
}

export const SKIES: Record<SkyKey, SkyDef> = {
  clear: {
    name: 'Clear Skies',
    blurb: 'Nothing in the way of a day’s work.',
    growth: 1,
    crowGraceMs: 0,
    sell: 1,
  },
  rain: {
    name: 'Rain',
    blurb: 'Steady and warm. Everything in the ground is drinking.',
    growth: 0.85,
    crowGraceMs: 0,
    sell: 1,
  },
  mist: {
    name: 'Morning Mist',
    blurb: 'You cannot see the treeline. Neither can the crows.',
    growth: 1,
    crowGraceMs: 90_000,
    sell: 1,
  },
  golden: {
    name: 'Golden Day',
    blurb: 'Light like syrup, and buyers in a good mood.',
    growth: 1,
    crowGraceMs: 0,
    sell: 1.1,
  },
};

export const SKY_KEYS = Object.keys(SKIES) as SkyKey[];

export const isSkyKey = (key: string): key is SkyKey =>
  Object.prototype.hasOwnProperty.call(SKIES, key);

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------

export const DEMAND = {
  /**
   * What the sought-after good pays.
   *
   * Sized by measurement, not taste. At 1.6x only a pumpkin day actually
   * reordered anything: sunflower rose to 0.47/sec against starglow's 0.58, so
   * a level-8 farmer could ignore three days in four and still be playing
   * optimally — a rotating headline that changes nothing. At 2x every crop's
   * day genuinely makes that crop the best thing in the ground (sunflower
   * 0.63, carrot 0.69, pumpkin 0.99, starglow 1.42), so "today, plant this" is
   * always a real instruction rather than a suggestion for beginners.
   */
  soughtMul: 2,
  /** What the glutted good pays. A dent, not a punishment. */
  glutMul: 0.7,
} as const;

export interface DayMarket {
  /** The good buyers are asking for today. */
  sought: ItemKey;
  /** The good there is too much of today. */
  glut: ItemKey;
}

/**
 * Goods eligible to be sought or glutted.
 *
 * Wood and stone are left out on purpose: they are the currency of building,
 * not of trade, and a day that made stone lucrative would just mean a day of
 * hitting rocks. Crafted goods are left in — a cake day is worth planning for.
 */
const TRADED: ItemKey[] = ITEM_KEYS.filter((key) => key !== 'wood' && key !== 'stone');

/**
 * A small integer hash of the day, so consecutive days do not walk the list in
 * order. Same shape as the daily-quest seed: cheap, stable, no state.
 */
function seed(day: number, salt: number): number {
  let h = (day * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/**
 * Picks from `list`, thinning out runs of the same answer.
 *
 * Weighting Clear twice and leaving it at that gave nine clear days in a
 * fortnight, with two identical days back to back — the correct output for
 * that wheel (repeats run at the sum of the squared weights, 28%) and still
 * reads to a player as a feature that is not there. So the fix is a design
 * one, not a hash one: equal weights, and a day that draws what yesterday drew
 * steps one along instead.
 *
 * This thins repeats rather than forbidding them: measured over 1000 days it
 * takes the sky from 28% repeats down to 12%. The comparison is against
 * yesterday's *raw* draw, and yesterday's own answer may itself have been
 * stepped, so two equal days can still slip through. That is deliberate —
 * forbidding them outright needs the previous *answer*, which recurses back to
 * day zero, and two days of rain in a row is weather, not a bug. What it does
 * guarantee is what actually matters: no long runs, and a pure function of the
 * day number with exactly one day of lookback.
 */
function distinctPick<T>(list: readonly T[], day: number, salt: number): T {
  const raw = (d: number) => seed(d, salt) % list.length;
  const today = raw(day);
  const index = today === raw(day - 1) ? (today + 1) % list.length : today;
  return list[index]!;
}

/** The sky for a given day. */
export function skyFor(day: number): SkyKey {
  return distinctPick(SKY_KEYS, day, 11);
}

/** What the market wants, and what it is sick of, on a given day. */
export function marketFor(day: number): DayMarket {
  const sought = distinctPick(TRADED, day, 23);
  // Drawn from the remainder, so the same good is never both at once.
  const rest = TRADED.filter((key) => key !== sought);
  const glut = rest[seed(day, 37) % rest.length]!;
  return { sought, glut };
}

/** Everything about today, in one object. */
export interface DayConditions {
  day: number;
  sky: SkyKey;
  market: DayMarket;
}

export function conditionsFor(nowMs: number): DayConditions {
  const day = dayIndex(nowMs);
  return { day, sky: skyFor(day), market: marketFor(day) };
}

/**
 * Tomorrow, shown a day early on purpose.
 *
 * Hiding it would make holding stock a gamble; showing it makes holding stock
 * a plan, and a plan is the better game. Starglow takes six minutes to grow,
 * so "buyers want starglow tomorrow" is an instruction a player can act on
 * tonight — which is the difference between a rotating headline you react to
 * and an economy you can actually work.
 *
 * Only one day ahead. Two would let a player schedule the whole week in one
 * sitting and turn the vale into a spreadsheet.
 */
export function forecastFor(nowMs: number): DayConditions {
  return conditionsFor(nowMs + 86_400_000);
}

/** The sale multiplier today puts on one good, sky and demand together. */
export function demandMultiplier(conditions: DayConditions, itemKey: ItemKey): number {
  const sky = SKIES[conditions.sky].sell;
  if (itemKey === conditions.market.sought) return sky * DEMAND.soughtMul;
  if (itemKey === conditions.market.glut) return sky * DEMAND.glutMul;
  return sky;
}
