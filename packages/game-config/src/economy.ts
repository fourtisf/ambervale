/**
 * The spending half of the economy.
 *
 * Before this file the game only ever added: coins, $AMBER, wood and stone all
 * accumulated and nothing consumed them except one single-use expansion. An
 * economy needs somewhere for value to go, so everything here is a sink or a
 * reason to come back tomorrow — upgrades, recipes, daily goals, level rewards.
 *
 * Like the rest of game-config this is pure data. The server is the only thing
 * allowed to act on it; the client imports the same table purely so it can
 * render prices without a round-trip, and is never believed about them.
 */

import { ANIMALS, CROPS, GOODS, mulberry32, type CropKey, type ItemKey } from './tuning';

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

export type UpgradeKey = 'axe' | 'pick' | 'well' | 'coop' | 'cellar' | 'rod' | 'mill';

export interface UpgradeCost {
  coins?: number;
  amber?: number;
  items?: Partial<Record<ItemKey, number>>;
}

export interface UpgradeTier {
  cost: UpgradeCost;
  /** Player-facing description of what owning this tier does. */
  effect: string;
}

export interface UpgradeDef {
  name: string;
  blurb: string;
  /** Level required before tier 1 can be bought. */
  unlockLv: number;
  tiers: UpgradeTier[];
}

/**
 * $AMBER costs are deliberately small next to coin costs.
 *
 * A delivery pays 1–12 $AMBER, so a 10-$AMBER tier is roughly a day of
 * deliveries. Pricing them like coins would make the token unspendable, which
 * is the exact problem this file exists to fix.
 */
export const UPGRADES: Record<UpgradeKey, UpgradeDef> = {
  axe: {
    name: "Woodcutter's Axe",
    blurb: 'A better head bites deeper, so every oak gives up more timber.',
    unlockLv: 2,
    tiers: [
      { cost: { coins: 180 }, effect: '+1 wood per oak' },
      { cost: { coins: 450, amber: 3 }, effect: '+2 wood per oak' },
      { cost: { coins: 1100, amber: 8 }, effect: '+3 wood per oak' },
    ],
  },
  pick: {
    name: "Miner's Pick",
    blurb: 'Tempered steel splits stone along the grain instead of shattering it.',
    unlockLv: 2,
    tiers: [
      { cost: { coins: 180 }, effect: '+1 stone per rock' },
      { cost: { coins: 450, amber: 3 }, effect: '+2 stone per rock' },
      { cost: { coins: 1100, amber: 8 }, effect: '+3 stone per rock' },
    ],
  },
  well: {
    name: 'Irrigation Well',
    blurb: 'Water on tap. Everything in the ground comes up sooner.',
    unlockLv: 3,
    tiers: [
      { cost: { coins: 260, items: { stone: 6 } }, effect: 'Crops grow 10% faster' },
      { cost: { coins: 600, amber: 4, items: { stone: 14 } }, effect: 'Crops grow 18% faster' },
      { cost: { coins: 1400, amber: 10, items: { stone: 26 } }, effect: 'Crops grow 25% faster' },
    ],
  },
  coop: {
    name: 'Coop Extension',
    blurb: 'More perches, more hens, more eggs on the ground each morning.',
    unlockLv: 4,
    tiers: [
      { cost: { coins: 320, items: { wood: 12 } }, effect: '+1 hen' },
      { cost: { coins: 700, amber: 5, items: { wood: 24 } }, effect: '+2 hens' },
      { cost: { coins: 1500, amber: 12, items: { wood: 40 } }, effect: '+3 hens' },
    ],
  },
  cellar: {
    name: 'Root Cellar',
    blurb: 'Keeps produce fresh, so the market pays a better price for it.',
    unlockLv: 5,
    tiers: [
      { cost: { coins: 240, items: { wood: 8, stone: 4 } }, effect: '+5% market price' },
      {
        cost: { coins: 560, amber: 4, items: { wood: 18, stone: 10 } },
        effect: '+12% market price',
      },
      {
        cost: { coins: 1300, amber: 9, items: { wood: 30, stone: 20 } },
        effect: '+20% market price',
      },
    ],
  },
  rod: {
    name: 'Fishing Rod',
    blurb: 'Unlocks the dock. Cast a line into the lake for fish — and the odd rarity.',
    unlockLv: 2,
    tiers: [{ cost: { coins: 150, items: { wood: 6 } }, effect: 'Fish from the dock' }],
  },
  mill: {
    name: 'Millstone',
    blurb: 'Puts the windmill back to work. Raw produce becomes something worth far more.',
    unlockLv: 4,
    tiers: [
      { cost: { coins: 400, items: { wood: 10, stone: 6 } }, effect: 'Craft at the windmill' },
    ],
  },
};

export const UPGRADE_KEYS = Object.keys(UPGRADES) as UpgradeKey[];

export const isUpgradeKey = (key: string): key is UpgradeKey =>
  Object.prototype.hasOwnProperty.call(UPGRADES, key);

/** Highest tier a given upgrade can reach. */
export const maxTier = (key: UpgradeKey): number => UPGRADES[key].tiers.length;

/** Cost of moving from `tier` to `tier + 1`, or null when fully upgraded. */
export function nextTierCost(key: UpgradeKey, tier: number): UpgradeCost | null {
  return UPGRADES[key].tiers[tier]?.cost ?? null;
}

// ---------------------------------------------------------------------------
// What owning a tier actually does
//
// One function per effect, so both sides compute it identically and no rule
// ever lives in two places.
// ---------------------------------------------------------------------------

/** Extra units yielded when a node is felled, from the axe/pick tier. */
export const bonusNodeYield = (tier: number): number => Math.max(0, Math.min(3, tier));

/** Multiplier applied to every crop's grow time by the well. */
export function growthMultiplier(tier: number): number {
  const table = [1, 0.9, 0.82, 0.75];
  return table[Math.max(0, Math.min(table.length - 1, tier))]!;
}

/** Multiplier applied to market sale prices by the root cellar. */
export function sellMultiplier(tier: number): number {
  const table = [1, 1.05, 1.12, 1.2];
  return table[Math.max(0, Math.min(table.length - 1, tier))]!;
}

/** How many hens the coop holds at a given coop tier. */
export const henCount = (tier: number): number =>
  ANIMALS.chicken.count + Math.max(0, Math.min(3, tier));

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------

export type RecipeKey = 'flour' | 'butter' | 'pie' | 'cake';

export interface RecipeDef {
  /** Item produced, one unit per craft. */
  output: ItemKey;
  inputs: Partial<Record<ItemKey, number>>;
  xp: number;
  /** Level required, on top of owning the millstone. */
  unlockLv: number;
}

export const RECIPES: Record<RecipeKey, RecipeDef> = {
  flour: { output: 'flour', inputs: { sunflower: 3 }, xp: 6, unlockLv: 4 },
  butter: { output: 'butter', inputs: { milk: 2 }, xp: 8, unlockLv: 4 },
  pie: { output: 'pie', inputs: { pumpkin: 1, flour: 1 }, xp: 18, unlockLv: 6 },
  cake: { output: 'cake', inputs: { flour: 2, butter: 1, egg: 2 }, xp: 40, unlockLv: 8 },
};

export const RECIPE_KEYS = Object.keys(RECIPES) as RecipeKey[];

export const isRecipeKey = (key: string): key is RecipeKey =>
  Object.prototype.hasOwnProperty.call(RECIPES, key);

/** Coin value of a recipe's inputs, for showing the margin in the UI. */
export function recipeInputValue(key: RecipeKey): number {
  let total = 0;
  for (const [item, qty] of Object.entries(RECIPES[key].inputs) as [ItemKey, number][]) {
    const base =
      item in CROPS ? CROPS[item as CropKey].sell : GOODS[item as keyof typeof GOODS].sell;
    total += base * qty;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Fishing
// ---------------------------------------------------------------------------

export interface FishOutcome {
  /** Relative weight within the table. */
  weight: number;
  fish: number;
  /** Occasionally the lake gives up something better than a fish. */
  seed?: CropKey;
  label: string;
}

export const FISHING = {
  /** Requires this upgrade at tier 1 or better. */
  requires: 'rod' as UpgradeKey,
  /** Minimum gap between casts, enforced server-side. */
  cooldownMs: 6000,
  xp: 9,
  table: [
    { weight: 58, fish: 1, label: 'a perch' },
    { weight: 28, fish: 2, label: 'a good haul' },
    { weight: 10, fish: 3, label: 'a shoal' },
    { weight: 4, fish: 1, seed: 'starglow' as CropKey, label: 'a starglow seed, tangled in weed' },
  ] as FishOutcome[],
} as const;

/** Picks an outcome from the weighted table. `roll` is in [0, 1). */
export function rollFish(roll: number): FishOutcome {
  const total = FISHING.table.reduce((sum, o) => sum + o.weight, 0);
  let cursor = roll * total;
  for (const outcome of FISHING.table) {
    cursor -= outcome.weight;
    if (cursor < 0) return outcome;
  }
  return FISHING.table[0]!;
}

// ---------------------------------------------------------------------------
// Daily goals
// ---------------------------------------------------------------------------

export type DailyCounter =
  | 'plantedCount'
  | 'harvestedCount'
  | 'choppedCount'
  | 'minedCount'
  | 'soldCount'
  | 'milkCount'
  | 'eggCount'
  | 'deliveriesDone'
  | 'fishCount'
  | 'craftCount';

export interface DailyQuestDef {
  id: string;
  text: string;
  counter: DailyCounter;
  target: number;
  reward: { coins?: number; amber?: number };
}

/**
 * The pool the day's goals are drawn from.
 *
 * Progress is measured as "counter now minus counter at the start of the day",
 * which is why every one of these leans on a counter that only ever goes up.
 * No new bookkeeping, and a goal can never be gamed by losing progress.
 */
export const DAILY_QUESTS: DailyQuestDef[] = [
  {
    id: 'd_harvest',
    text: 'Harvest 8 crops',
    counter: 'harvestedCount',
    target: 8,
    reward: { coins: 90 },
  },
  {
    id: 'd_plant',
    text: 'Plant 8 crops',
    counter: 'plantedCount',
    target: 8,
    reward: { coins: 70 },
  },
  { id: 'd_chop', text: 'Fell 4 oaks', counter: 'choppedCount', target: 4, reward: { coins: 110 } },
  { id: 'd_mine', text: 'Break 4 rocks', counter: 'minedCount', target: 4, reward: { coins: 110 } },
  {
    id: 'd_sell',
    text: 'Make 3 sales at the market',
    counter: 'soldCount',
    target: 3,
    reward: { coins: 80 },
  },
  { id: 'd_eggs', text: 'Collect 6 eggs', counter: 'eggCount', target: 6, reward: { coins: 100 } },
  {
    id: 'd_milk',
    text: 'Milk the cow twice',
    counter: 'milkCount',
    target: 2,
    reward: { coins: 95 },
  },
  {
    id: 'd_deliver',
    text: 'Complete 2 delivery orders',
    counter: 'deliveriesDone',
    target: 2,
    reward: { amber: 2 },
  },
  { id: 'd_fish', text: 'Land 5 fish', counter: 'fishCount', target: 5, reward: { coins: 120 } },
  {
    id: 'd_craft',
    text: 'Craft 3 goods at the mill',
    counter: 'craftCount',
    target: 3,
    reward: { coins: 140 },
  },
];

export const DAILY = {
  /** How many goals are drawn each day. */
  picks: 3,
  /** $AMBER paid the first time all of a day's goals are finished. */
  completionAmber: 2,
  /** Extra coins per consecutive day, capped. */
  streakCoins: 40,
  streakCap: 7,
} as const;

/** Days elapsed since the Unix epoch, UTC. The daily reset boundary. */
export const dayIndex = (nowMs: number): number => Math.floor(nowMs / 86_400_000);

/**
 * The goals for a given day.
 *
 * Seeded from the day alone, so everybody playing on the same date gets the
 * same three — which is deliberate: shared goals are something players can
 * talk to each other about.
 */
export function dailyPicks(day: number): DailyQuestDef[] {
  const rng = mulberry32(day * 2654435761);
  const pool = [...DAILY_QUESTS];

  // Fisher-Yates, then take the first `picks`. Shuffling rather than sampling
  // guarantees three *distinct* goals.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, DAILY.picks);
}

// ---------------------------------------------------------------------------
// Level rewards
// ---------------------------------------------------------------------------

export interface LevelReward {
  coins?: number;
  amber?: number;
  seeds?: Partial<Record<CropKey, number>>;
  /** Shown in the level-up toast, e.g. "Pumpkin seeds unlocked". */
  note?: string;
}

/**
 * Levelling used to be a number that went up and unlocked almost nothing.
 * Each of these is paid once, the first time the level is crossed.
 */
export const LEVEL_REWARDS: Record<number, LevelReward> = {
  2: { coins: 40, seeds: { carrot: 2 }, note: 'Carrot seeds and a starter pair' },
  3: { coins: 70, note: 'The delivery board is open' },
  4: { coins: 110, seeds: { pumpkin: 1 }, note: 'Pumpkins, and the mill can be bought' },
  5: { coins: 150, amber: 1, note: 'The root cellar is available' },
  6: { coins: 200, seeds: { pumpkin: 2 } },
  7: { coins: 260, amber: 1 },
  8: { coins: 340, seeds: { starglow: 1 }, note: 'Starglow — it shines at night' },
  9: { coins: 420, amber: 2 },
  10: { coins: 520, seeds: { starglow: 2 }, amber: 2 },
  12: { coins: 700, amber: 3 },
  15: { coins: 1000, amber: 5 },
  20: { coins: 1600, amber: 8 },
};

// ---------------------------------------------------------------------------
// Away report
// ---------------------------------------------------------------------------

export const AWAY = {
  /** Below this gap the report is skipped — it would just be noise. */
  minGapSec: 180,
} as const;
