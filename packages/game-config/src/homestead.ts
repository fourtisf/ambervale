/**
 * The Homestead: the one big upgrade.
 *
 * Landmarks answered "what do coins buy" with things that stand apart from
 * you. This answers a different wish — the house you already live in growing
 * under your feet. Cottage to Farmhouse to Manor, each tier a large, visible
 * change to the one building every screenshot contains, priced like the major
 * project it is.
 *
 * Unlike landmarks (which deliberately do nothing), each tier carries one
 * homely perk. The rule that keeps the token economy safe still holds: no
 * perk touches yields, prices, or $AMBER — they are comforts, not multipliers.
 * The Farmhouse makes coming back warmer; the Manor makes it warmer still and
 * burns gold in its windows at night.
 */

export interface HomesteadTier {
  tier: number;
  name: string;
  /** One line in the panel, said like a builder describing the work. */
  blurb: string;
  /** What this tier does for you, in words a player reads once and keeps. */
  perk: string;
  unlockLv: number;
  cost: { coins: number; amber?: number; wood?: number; stone?: number };
  renown: number;
}

export const HOMESTEAD: readonly HomesteadTier[] = [
  {
    tier: 1,
    name: 'Cottage',
    blurb: 'Where you started. One room, one chimney, and the door you came in by.',
    perk: 'Home.',
    unlockLv: 1,
    cost: { coins: 0 },
    renown: 0,
  },
  {
    tier: 2,
    name: 'Farmhouse',
    blurb: 'A second storey, a porch, and a roof that stops arguing with the rain.',
    perk: 'A neighbour minds the place while you are gone — coming back after a while, you find a note, a few coins, and seeds of whatever the market wants today.',
    unlockLv: 6,
    cost: { coins: 14000, wood: 90, stone: 50 },
    renown: 10,
  },
  {
    tier: 3,
    name: 'Manor',
    blurb: 'Gables, a stone wing, and windows that burn gold at night.',
    perk: 'The neighbour leaves twice the gift, and the manor is lit after dark — the one farm in the vale you can find at midnight.',
    unlockLv: 9,
    cost: { coins: 34000, amber: 8, wood: 180, stone: 130 },
    renown: 22,
  },
] as const;

export const HOMESTEAD_MAX_TIER = HOMESTEAD[HOMESTEAD.length - 1]!.tier;

/** The definition for a tier number, clamped to something that exists. */
export function homesteadTier(tier: number): HomesteadTier {
  return HOMESTEAD.find((t) => t.tier === tier) ?? HOMESTEAD[0]!;
}

/** The next tier up from this one, or null at the top. */
export function homesteadNext(tier: number): HomesteadTier | null {
  return HOMESTEAD.find((t) => t.tier === tier + 1) ?? null;
}

/**
 * The returning gift, sized by absence.
 *
 * Grows with time away but caps at a day — the gift is a welcome, not an
 * income, and a week away must not out-earn a week of playing. Coins only;
 * the seed half of the gift is chosen from the day's sought good at the call
 * site, because what the neighbour leaves depends on what the market wants.
 */
export function homesteadGiftCoins(awayMs: number, tier: number): number {
  if (tier < 2) return 0;
  const hours = Math.min(24, awayMs / 3_600_000);
  const base = Math.round(25 + hours * 9);
  return tier >= 3 ? base * 2 : base;
}

/** Seeds in the gift: enough to feel seen, not enough to skip the market. */
export const HOMESTEAD_GIFT_SEEDS = 2;
