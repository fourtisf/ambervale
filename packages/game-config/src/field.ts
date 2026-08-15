/**
 * The minute-to-minute half of the game.
 *
 * Everything else in game-config describes what a player *owns*. This file
 * describes what a player *does while waiting*, which until now was nothing:
 * plant, stand still for thirty seconds, harvest. Six systems had been added
 * on top of that loop and none of them touched it.
 *
 * Three mechanics live here, and each exists to answer one complaint:
 *
 * - The market moved nowhere, so the four crops were a list sorted for you
 *   rather than a choice. Prices now sag under supply.
 * - Nothing could go wrong, so nothing demanded attention. Crows arrive.
 * - There was one verb. Watering is a second one, with a real cost.
 *
 * Pure data and pure functions, like the rest of this package. The server is
 * the only thing allowed to act on it.
 */

// ---------------------------------------------------------------------------
// The market
// ---------------------------------------------------------------------------

/**
 * How the price of one good sags as a player floods it.
 *
 * Each unit sold raises that good's *saturation*; saturation decays on its own
 * with a half-life, so a market left alone comes back. The multiplier applied
 * to the list price is `1 / (1 + saturation)`, floored.
 *
 * Per player, not global. A shared order book would be more interesting and is
 * the obvious later move, but it coordinates strangers — one whale could flatten
 * a market for everyone, and grief becomes a strategy. Per player, the mechanic
 * is legible from your own actions alone, which is what a player needs before
 * anything more elaborate is worth building.
 */
export const MARKET = {
  /**
   * Units of one good that raise saturation by 1 (and so halve its price).
   *
   * Sized against the field rather than picked round: nine base plots means a
   * full monoculture harvest is nine of one crop, so 25 lets a player dump a
   * whole field for about 85% of list and a second field straight after for
   * about 65%. Flooding is discouraged, not forbidden.
   */
  softCap: 25,
  /** Saturation halves every this many ms with no sales at all. */
  halfLifeMs: 12 * 60 * 1000,
  /** The worst price a flooded good will ever fetch, as a fraction of list. */
  floor: 0.35,
  /** Saturation below this is treated as zero, so prices settle cleanly at par. */
  epsilon: 0.01,
} as const;

/** Saturation after `elapsedMs` of no sales. */
export function decaySaturation(saturation: number, elapsedMs: number): number {
  if (saturation <= 0 || elapsedMs <= 0) return Math.max(0, saturation);
  const decayed = saturation * Math.pow(0.5, elapsedMs / MARKET.halfLifeMs);
  return decayed < MARKET.epsilon ? 0 : decayed;
}

/** The price multiplier a single unit fetches at this saturation. */
export function priceMultiplier(saturation: number): number {
  return Math.max(MARKET.floor, 1 / (1 + Math.max(0, saturation)));
}

/**
 * The *average* multiplier over a sale of `qty` units, and the saturation left
 * behind.
 *
 * Averaged across the sale rather than charged at the opening price, because
 * otherwise one sale of a hundred beats a hundred sales of one — which would
 * reward exactly the flooding this is here to discourage. The continuous form
 * of that sum is a logarithm, which is also cheap and has no loop to bound.
 */
export function saleQuote(
  saturation: number,
  qty: number,
): { multiplier: number; saturationAfter: number } {
  const start = Math.max(0, saturation);
  const added = qty / MARKET.softCap;
  const after = start + added;
  if (qty <= 0) return { multiplier: priceMultiplier(start), saturationAfter: start };

  // ∫ 1/(1 + s) ds over the sale, divided by the quantity sold.
  const mean = (MARKET.softCap / qty) * Math.log((1 + after) / (1 + start));
  return { multiplier: Math.max(MARKET.floor, mean), saturationAfter: after };
}

// ---------------------------------------------------------------------------
// Crows
// ---------------------------------------------------------------------------

/**
 * The first thing in this game that can take something away from you.
 *
 * A crop left standing after it is ready attracts a crow. The crop is not gone
 * the moment one lands — that would punish a player for closing a tab — but it
 * stops being worth full value, and left long enough it is lost outright.
 *
 * The windows are deliberately generous against the crops they guard: the
 * longest crop takes six minutes to grow and the ruin window is ten, so
 * nothing is ever lost by a player who is playing. It is lost by a player who
 * walked away from a ready field, which is the behaviour this is aimed at.
 */
export const CROWS = {
  /** Quiet time after a crop is ready before a crow finds it. */
  graceMs: 90 * 1000,
  /** How long a crow must sit on a ready crop before the crop is destroyed. */
  ruinMs: 10 * 60 * 1000,
  /** Fraction of the usual XP a crop pays when harvested from under a crow. */
  peckedXp: 0.5,
  /** XP for chasing one off, so paying attention is worth something. */
  shooXp: 3,
  /** How long a plot stays clear after a shoo, before a crow may return. */
  guardMs: 3 * 60 * 1000,
} as const;

/**
 * When a crow lands on a plot, or null if one never will.
 *
 * `guardedUntil` is when a shoo expires. A plot shooed *before* its crop was
 * even ready still counts — the guard is a stretch of protected time, not a
 * one-shot token, so a player walking their field pre-emptively is rewarded
 * rather than told they were too early.
 */
export function crowLandsAt(
  readyAt: number | null,
  guardedUntil: number | null,
  scarecrowGraceMs = 0,
): number | null {
  if (readyAt === null) return null;
  const earliest = readyAt + CROWS.graceMs + scarecrowGraceMs;
  return guardedUntil !== null && guardedUntil > earliest ? guardedUntil : earliest;
}

export interface CrowState {
  /** A crow is on this plot right now. */
  present: boolean;
  /** When one lands (or landed). Null when the plot is empty or unplanted. */
  landsAt: number | null;
  /** When the crop is destroyed if nothing is done. Null when no crow is coming. */
  ruinsAt: number | null;
  /** True once the crop is gone and only the empty plot remains. */
  ruined: boolean;
}

export function crowState(
  now: number,
  readyAt: number | null,
  guardedUntil: number | null,
  scarecrowGraceMs = 0,
): CrowState {
  const landsAt = crowLandsAt(readyAt, guardedUntil, scarecrowGraceMs);
  if (landsAt === null) return { present: false, landsAt: null, ruinsAt: null, ruined: false };

  const ruinsAt = landsAt + CROWS.ruinMs;
  return {
    present: now >= landsAt,
    landsAt,
    ruinsAt,
    ruined: now >= ruinsAt,
  };
}

// ---------------------------------------------------------------------------
// Watering
// ---------------------------------------------------------------------------

/**
 * The second verb.
 *
 * A growing crop can be watered once, which takes a slice off its remaining
 * time. The reward is deliberately proportional to what is *left*: watering
 * the moment you plant is worth the most, which gives a player something to do
 * with the thirty seconds they were previously spending doing nothing, and
 * watering a crop that is nearly ready is worth almost nothing, so there is a
 * right moment rather than a chore to repeat.
 *
 * It costs a walk back across the field, and that is the whole cost. Charging
 * coins for it as well would turn a thing to do into a thing to budget.
 */
export const WATERING = {
  /** Fraction of the crop's *remaining* time removed by watering it. */
  cut: 0.3,
  /** Never below this, so watering a nearly-grown crop cannot round to nothing. */
  minCutMs: 2000,
  /** XP for tending a plot. Small: the time saved is the real reward. */
  xp: 2,
} as const;

/** Milliseconds taken off a crop watered now. Zero when it is already ready. */
export function waterCutMs(now: number, readyAt: number): number {
  const remaining = readyAt - now;
  if (remaining <= 0) return 0;
  return Math.min(remaining, Math.max(WATERING.minCutMs, Math.round(remaining * WATERING.cut)));
}
