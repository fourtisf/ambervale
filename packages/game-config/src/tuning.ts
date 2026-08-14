/**
 * AMBERVALE — shared tuning constants.
 *
 * This package is the single source of truth for every gameplay number. The
 * Phaser client and the Fastify server both import from here so they can never
 * disagree about growth times, prices, XP curves or spawn counts. Keep it
 * framework-free: no Phaser, no Prisma, no Node built-ins.
 */

// ---------------------------------------------------------------------------
// World / rendering
// ---------------------------------------------------------------------------

/** Size of one world tile in pixels. */
export const TILE = 64;

/** World size in tiles. */
export const WORLD = { w: 56, h: 44 } as const;

/** Player movement tuning. `reach` is the interaction radius in pixels. */
export const PLAYER = { speed: 195, reach: 74 } as const;

/** Virtual joystick geometry. Inputs below `minSpeedScale` are clamped up. */
export const JOYSTICK = { radius: 46, minSpeedScale: 0.35 } as const;

/**
 * Day/night cycle. `cycleSec` is a full rotation; the `*End` values are
 * normalised cycle positions (u in [0,1)) marking phase boundaries.
 * A session starts at `sessionStartU` — just after dawn.
 */
export const DAY = {
  cycleSec: 300,
  dayEnd: 0.4,
  duskEnd: 0.5,
  nightEnd: 0.88,
  sessionStartU: 0.085,
} as const;

/** World size in pixels, derived from {@link WORLD} and {@link TILE}. */
export const WORLD_PX = { w: WORLD.w * TILE, h: WORLD.h * TILE } as const;

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

/** Total XP required to advance *from* level `lv` to `lv + 1`. */
export const XP_FOR_LEVEL = (lv: number): number => Math.floor(42 * Math.pow(lv, 1.5));

// ---------------------------------------------------------------------------
// Crops
// ---------------------------------------------------------------------------

export type CropKey = 'sunflower' | 'carrot' | 'pumpkin' | 'starglow';

export interface CropDef {
  /** Seconds from planting to harvestable. */
  growSec: number;
  /** Coin cost of one seed at the market. */
  seedCost: number;
  /** Coin value of one harvested crop. */
  sell: number;
  /** XP granted on harvest. */
  xp: number;
  /** Player level required to buy seeds / plant. */
  unlockLv: number;
  /** Emits a Phaser point light at night. */
  glowsAtNight?: boolean;
}

export const CROPS: Record<CropKey, CropDef> = {
  sunflower: { growSec: 30, seedCost: 5, sell: 12, xp: 6, unlockLv: 1 },
  carrot: { growSec: 70, seedCost: 12, sell: 30, xp: 13, unlockLv: 2 },
  pumpkin: { growSec: 170, seedCost: 32, sell: 100, xp: 34, unlockLv: 4 },
  starglow: { growSec: 360, seedCost: 90, sell: 300, xp: 90, unlockLv: 8, glowsAtNight: true },
};

export const CROP_KEYS = Object.keys(CROPS) as CropKey[];

/**
 * Growth time for a player's very first crop. The tutorial cannot afford to
 * make anyone wait 30 seconds staring at dirt.
 */
export const FIRST_CROP_FAST_SEC = 10;

// ---------------------------------------------------------------------------
// Goods (non-crop items)
// ---------------------------------------------------------------------------

export type GoodKey = 'egg' | 'milk' | 'wood' | 'stone';

export interface GoodDef {
  /** Coin value of one unit. */
  sell: number;
  /** XP granted when picked up, where pickup is an action (eggs, milk). */
  xpOnCollect?: number;
}

export const GOODS: Record<GoodKey, GoodDef> = {
  egg: { sell: 14, xpOnCollect: 5 },
  milk: { sell: 38, xpOnCollect: 10 },
  wood: { sell: 5 },
  stone: { sell: 8 },
};

export const GOOD_KEYS = Object.keys(GOODS) as GoodKey[];

/** Anything that can sit in the player's inventory and be sold. */
export type ItemKey = CropKey | GoodKey;

export const ITEM_KEYS: ItemKey[] = [...CROP_KEYS, ...GOOD_KEYS];

export const isCropKey = (key: string): key is CropKey =>
  Object.prototype.hasOwnProperty.call(CROPS, key);

export const isGoodKey = (key: string): key is GoodKey =>
  Object.prototype.hasOwnProperty.call(GOODS, key);

export const isItemKey = (key: string): key is ItemKey => isCropKey(key) || isGoodKey(key);

/** Coin value of one unit of any sellable item. Server-side pricing authority. */
export const sellPrice = (key: ItemKey): number =>
  isCropKey(key) ? CROPS[key].sell : GOODS[key].sell;

// ---------------------------------------------------------------------------
// Resource nodes
// ---------------------------------------------------------------------------

export type NodeKey = 'oak' | 'rock';

export interface NodeDefBase {
  /** Tool hits required to fell/break the node. */
  hits: number;
  /** Items granted when the node is depleted. */
  yield: Partial<Record<GoodKey, number>>;
  /** Seconds until the node regrows after depletion. */
  respawnSec: number;
  /** How many of this node exist in the world. */
  count: number;
}

export interface OakDef extends NodeDefBase {
  xpOnFell: number;
}

export interface RockDef extends NodeDefBase {
  xpOnBreak: number;
}

export const NODES: { oak: OakDef; rock: RockDef } = {
  oak: { hits: 3, yield: { wood: 3 }, xpOnFell: 12, respawnSec: 90, count: 10 },
  rock: { hits: 3, yield: { stone: 2 }, xpOnBreak: 14, respawnSec: 120, count: 8 },
};

export const NODE_KEYS = Object.keys(NODES) as NodeKey[];

/** XP for depleting a node, normalising over oak's `xpOnFell` / rock's `xpOnBreak`. */
export const nodeDepleteXp = (key: NodeKey): number =>
  key === 'oak' ? NODES.oak.xpOnFell : NODES.rock.xpOnBreak;

/** Minimum ms between two hits on the same node by the same user. */
export const NODE_HIT_COOLDOWN_MS = 350;

// ---------------------------------------------------------------------------
// Animals
// ---------------------------------------------------------------------------

export interface ChickenDef {
  count: number;
  layMinSec: number;
  layMaxSec: number;
  /** Uncollected eggs on the ground are capped; laying stalls at the cap. */
  maxGroundEggs: number;
}

export interface CowDef {
  count: number;
  milkIntervalSec: number;
}

export const ANIMALS: { chicken: ChickenDef; cow: CowDef } = {
  chicken: { count: 3, layMinSec: 30, layMaxSec: 60, maxGroundEggs: 4 },
  cow: { count: 1, milkIntervalSec: 90 },
};

export type AnimalKey = keyof typeof ANIMALS;

// ---------------------------------------------------------------------------
// Deliveries ($AMBER earn layer)
// ---------------------------------------------------------------------------

/** Items a delivery order can ask for. */
export type DeliveryItemKey = Exclude<CropKey, 'starglow'> | 'egg';

export const DELIVERIES = {
  /** Player level at which the delivery board becomes usable. */
  unlockLv: 3,
  /** Total order slots on the board. */
  slots: 3,
  /** Reputation required to use slot 2 / slot 3. */
  slot2RepReq: 10,
  slot3RepReq: 25,
  /** Rewards per completed delivery. */
  repPerDelivery: 3,
  xpPerDelivery: 22,
  /** Seconds a completed slot stays empty before a fresh order appears. */
  refillSec: 60,
  /** Egg orders only start appearing at this level, with this probability. */
  eggOrderMinLv: 5,
  eggOrderChance: 0.3,
  /** Inclusive [min, max] quantity range per orderable item. */
  qty: {
    sunflower: [4, 7],
    carrot: [3, 5],
    pumpkin: [2, 3],
    egg: [2, 4],
  } as Record<DeliveryItemKey, readonly [number, number]>,
  /** $AMBER paid for an order, from the item's coin value and quantity. */
  amberFormula: (sellValue: number, qty: number): number =>
    Math.max(1, Math.round((sellValue * qty) / 25)),
} as const;

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

export const EXPANSION_NORTH = {
  coins: 220,
  wood: 18,
  stone: 8,
  plotsAdded: 6,
  xp: 60,
} as const;

// ---------------------------------------------------------------------------
// New accounts
// ---------------------------------------------------------------------------

export const NEW_ACCOUNT = {
  coins: 40,
  seeds: { sunflower: 3 } as Partial<Record<CropKey, number>>,
  level: 1,
} as const;

// ---------------------------------------------------------------------------
// Quest chain
// ---------------------------------------------------------------------------

/**
 * Every quest is satisfied by a monotonic counter on the User row reaching a
 * target, so the server can re-evaluate the whole chain after any mutating
 * action without storing per-quest progress.
 */
export type QuestCounter =
  | 'plantedCount'
  | 'harvestedCount'
  | 'soldCount'
  | 'choppedCount'
  | 'level'
  | 'deliveriesDone'
  | 'milkCount'
  | 'expansionNorth';

export interface QuestDef {
  id: string;
  text: string;
  counter: QuestCounter;
  target: number;
  reward: { coins?: number; amber?: number };
}

export const QUESTS: QuestDef[] = [
  {
    id: 'plant3',
    text: 'Plant 3 crops',
    counter: 'plantedCount',
    target: 3,
    reward: { coins: 15 },
  },
  {
    id: 'harvest3',
    text: 'Harvest 3 crops',
    counter: 'harvestedCount',
    target: 3,
    reward: { coins: 25 },
  },
  {
    id: 'sell1',
    text: 'Sell your harvest at the market',
    counter: 'soldCount',
    target: 1,
    reward: { coins: 30 },
  },
  {
    id: 'chop1',
    text: 'Fell an oak for timber',
    counter: 'choppedCount',
    target: 1,
    reward: { coins: 25 },
  },
  {
    id: 'level3',
    text: 'Reach level 3',
    counter: 'level',
    target: 3,
    reward: { coins: 60 },
  },
  {
    id: 'deliver1',
    text: 'Complete a delivery order',
    counter: 'deliveriesDone',
    target: 1,
    reward: { amber: 1 },
  },
  {
    id: 'milk1',
    text: 'Milk the cow',
    counter: 'milkCount',
    target: 1,
    reward: { coins: 40 },
  },
  {
    id: 'expandNorth',
    text: 'Claim the north meadow',
    counter: 'expansionNorth',
    target: 1,
    reward: { amber: 1 },
  },
];

// ---------------------------------------------------------------------------
// Shared deterministic RNG
// ---------------------------------------------------------------------------

/**
 * Small seedable PRNG, shared so the server and client agree.
 *
 * The client uses it for world generation; the server uses it to generate
 * delivery orders from a seed stored on the row, which makes every order
 * reproducible for audit — you can always re-derive what a player was asked
 * for, without trusting anything the client said.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The five traders who post orders on the delivery board.
 *
 * NOTE: names and tints are invented — the prototype was not available.
 * Reconcile against it when it lands; nothing depends on these but the UI.
 */
export const DELIVERY_NPCS: readonly { name: string; tint: number }[] = [
  { name: 'Maren', tint: 0xd0674a },
  { name: 'Tobias', tint: 0x4a86b8 },
  { name: 'Wren', tint: 0x6fd08c },
  { name: 'Odell', tint: 0xd98cb3 },
  { name: 'Sable', tint: 0xf4b942 },
];
