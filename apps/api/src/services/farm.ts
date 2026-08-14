/**
 * Farm bootstrap and the single /farm read.
 *
 * Positions are never stored: a Plot knows its `index`, and the client looks
 * the coordinate up in game-config's PLOTS. Both sides therefore read the same
 * table, and moving a plot is a config edit rather than a data migration.
 */

import {
  ANIMALS,
  CROPS,
  FIRST_CROP_FAST_SEC,
  NEW_ACCOUNT,
  NODES,
  NODE_SLOTS,
  PADDOCKS,
  PLOTS,
  TILE,
  titleFor,
  type CropKey,
} from '@ambervale/game-config';
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { dailyState, type DailyDto } from './daily';
import { handleFor } from './leaderboard';
import { repRequiredFor, slotUnlocked } from './deliveries';
import { amberBalance, levelFromTotalXp } from './progression';
import { questProgress } from './quests';
import { effectsOf, readUpgrades, upgradesToDto, type UpgradeDto } from './upgrades';

const ms = (sec: number) => sec * 1000;

/** Chickens are indexes 0..n-1, the cow follows them. */
export const COW_INDEX = ANIMALS.chicken.count;

/**
 * Seeds a brand-new farm. Idempotent by the `bootstrapped` flag inside the
 * transaction, so two racing first requests cannot double-seed.
 */
export async function bootstrapFarm(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Compare-and-set the flag first. Read-then-write would let two concurrent
    // first requests both see bootstrapped=false and seed the farm twice; this
    // way exactly one caller wins the update and the loser returns. The whole
    // thing is in a transaction, so a failure below rolls the claim back too.
    const claimed = await tx.user.updateMany({
      where: { id: userId, bootstrapped: false },
      data: {
        bootstrapped: true,
        coins: NEW_ACCOUNT.coins,
        level: NEW_ACCOUNT.level,
      },
    });
    if (claimed.count === 0) return;

    const now = Date.now();

    await tx.plot.createMany({
      data: PLOTS.map((p) => ({ userId, index: p.index, zone: p.zone })),
      skipDuplicates: true,
    });

    await tx.resourceNode.createMany({
      data: NODE_SLOTS.map((n) => ({
        userId,
        index: n.index,
        kind: n.kind,
        hp: NODES[n.kind].hits,
      })),
      skipDuplicates: true,
    });

    const animals: Prisma.AnimalCreateManyInput[] = [];
    for (let i = 0; i < ANIMALS.chicken.count; i++) {
      const { layMinSec, layMaxSec } = ANIMALS.chicken;
      // Stagger the first eggs so all three hens do not lay at once.
      const delay = layMinSec + Math.random() * (layMaxSec - layMinSec);
      animals.push({
        userId,
        index: i,
        kind: 'chicken',
        nextYieldAt: new Date(now + ms(delay)),
      });
    }
    animals.push({
      userId,
      index: COW_INDEX,
      kind: 'cow',
      nextYieldAt: new Date(now + ms(ANIMALS.cow.milkIntervalSec)),
    });
    await tx.animal.createMany({ data: animals, skipDuplicates: true });

    const seeds = Object.entries(NEW_ACCOUNT.seeds) as [CropKey, number][];
    if (seeds.length > 0) {
      await tx.seedItem.createMany({
        data: seeds.map(([cropKey, qty]) => ({ userId, cropKey, qty })),
        skipDuplicates: true,
      });
    }

    await tx.expansion.upsert({
      where: { userId },
      create: { userId, north: false },
      update: {},
    });

    await tx.eventLog.create({
      data: { userId, kind: 'farm.bootstrap', payload: { plots: PLOTS.length } },
    });
  });
}

// ---------------------------------------------------------------------------
// Lazy repair
// ---------------------------------------------------------------------------

/**
 * Restores nodes whose respawn time has passed.
 *
 * Respawns are computed on read rather than on a timer: with no scheduler,
 * a farm that nobody has looked at for a week still comes back correct.
 */
export async function repairNodes(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
): Promise<number> {
  const due = await tx.resourceNode.findMany({
    where: { userId, respawnAt: { not: null, lte: now } },
  });
  if (due.length === 0) return 0;

  for (const node of due) {
    const kind = node.kind === 'oak' ? 'oak' : 'rock';
    await tx.resourceNode.update({
      where: { id: node.id },
      data: { hp: NODES[kind].hits, respawnAt: null },
    });
  }

  return due.length;
}

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface FarmPlotDto {
  index: number;
  zone: string;
  cropKey: string | null;
  plantedAt: number | null;
  fast: boolean;
  /** When this crop becomes harvestable, or null if the plot is empty. */
  readyAt: number | null;
}

export interface FarmState {
  serverNow: number;
  user: {
    id: string;
    level: number;
    xp: number;
    xpIntoLevel: number;
    xpForNext: number;
    coins: number;
    rep: number;
    amberBalance: number;
    renown: number;
    /** Cosmetic rank earned from renown, or null below the first threshold. */
    title: string | null;
    handle: string;
    tutorialStep: number;
    questIndex: number;
    firstPlantDone: boolean;
    counters: Record<string, number>;
  };
  expansion: { north: boolean; east: boolean };
  plots: FarmPlotDto[];
  nodes: { index: number; kind: string; hp: number; respawnAt: number | null }[];
  animals: { index: number; kind: string; nextYieldAt: number; ready: boolean }[];
  groundItems: { id: string; itemKey: string; x: number; y: number }[];
  inventory: Record<string, number>;
  seeds: Record<string, number>;
  deliverySlots: {
    slot: number;
    state: string;
    itemKey: string | null;
    qty: number | null;
    amber: number | null;
    npc: number;
    refillAt: number | null;
    unlocked: boolean;
    /** Reputation needed to use this slot, for the locked-slot progress bar. */
    repRequired: number;
  }[];
  /** Current quest and live progress toward it, or null when the chain ends. */
  quest: {
    index: number;
    id: string;
    text: string;
    current: number;
    target: number;
  } | null;
  /** Owned tier per upgrade key, plus what the shop should render. */
  upgrades: Record<string, number>;
  shop: UpgradeDto[];
  /**
   * Derived effects, sent so the UI can show the real numbers — the price the
   * market will actually pay, whether the dock is open — without duplicating
   * the rules. The server still recomputes all of it on every action.
   */
  effects: {
    axeBonus: number;
    pickBonus: number;
    growth: number;
    sell: number;
    hens: number;
    canFish: boolean;
    canCraft: boolean;
  };
  daily: DailyDto;
  /** What happened while the player was away, or null if they were not. */
  away: AwayReport | null;
}

/**
 * A summary of what the farm did on its own.
 *
 * Everything here was already being computed lazily on read — eggs, respawns,
 * growth. The only new thing is telling the player about it, which turns
 * "opening the game" into a payoff rather than a chore.
 */
export interface AwayReport {
  /** Milliseconds the player was gone. */
  awayMs: number;
  eggsLaid: number;
  milkReady: boolean;
  nodesRegrown: number;
  cropsReady: number;
  ordersRefreshed: number;
}

/**
 * Growth duration for a plot, honouring the accelerated first crop and the
 * irrigation well.
 *
 * `growthMul` comes from the player's well tier. It is a parameter rather than
 * a lookup so this stays a pure function — the harvest check and the read model
 * both call it, and they must never disagree about when a crop is ready.
 */
export function growMsFor(cropKey: string, fast: boolean, growthMul = 1): number {
  // The tutorial's first crop is already near-instant; shortening it further
  // would be indistinguishable and just risks a zero.
  if (fast) return ms(FIRST_CROP_FAST_SEC);
  const crop = CROPS[cropKey as CropKey];
  return Math.round(ms(crop ? crop.growSec : 0) * growthMul);
}

export function plotToDto(
  plot: {
    index: number;
    zone: string;
    cropKey: string | null;
    plantedAt: Date | null;
    fast: boolean;
  },
  growthMul = 1,
): FarmPlotDto {
  const plantedAt = plot.plantedAt?.getTime() ?? null;
  return {
    index: plot.index,
    zone: plot.zone,
    cropKey: plot.cropKey,
    plantedAt,
    fast: plot.fast,
    readyAt:
      plantedAt !== null && plot.cropKey
        ? plantedAt + growMsFor(plot.cropKey, plot.fast, growthMul)
        : null,
  };
}

/** Where an egg should land when a hen lays one. */
export function randomCoopPoint(): { x: number; y: number } {
  const p = PADDOCKS.coop;
  return {
    x: (p.x + Math.random() * p.w) * TILE,
    y: (p.y + Math.random() * p.h) * TILE,
  };
}

/**
 * The whole farm in one payload. The client hydrates from this and never has
 * to stitch state together from multiple round-trips.
 */
export async function getFarmState(
  db: PrismaClient | Prisma.TransactionClient,
  user: User,
  away: AwayReport | null = null,
): Promise<FarmState> {
  const userId = user.id;

  const [
    plots,
    nodes,
    animals,
    groundItems,
    inventory,
    seeds,
    slots,
    expansion,
    amber,
    quest,
    tiers,
    daily,
  ] = await Promise.all([
    db.plot.findMany({ where: { userId }, orderBy: { index: 'asc' } }),
    db.resourceNode.findMany({ where: { userId }, orderBy: { index: 'asc' } }),
    db.animal.findMany({ where: { userId }, orderBy: { index: 'asc' } }),
    db.groundItem.findMany({ where: { userId } }),
    db.inventoryItem.findMany({ where: { userId } }),
    db.seedItem.findMany({ where: { userId } }),
    db.deliverySlot.findMany({ where: { userId }, orderBy: { slot: 'asc' } }),
    db.expansion.findUnique({ where: { userId } }),
    amberBalance(db as Prisma.TransactionClient, userId),
    questProgress(db as Prisma.TransactionClient, userId),
    readUpgrades(db as Prisma.TransactionClient, userId),
    dailyState(db as Prisma.TransactionClient, userId),
  ]);

  const effects = effectsOf(tiers);
  const lv = levelFromTotalXp(user.xp);

  return {
    serverNow: Date.now(),
    user: {
      id: user.id,
      level: lv.level,
      xp: user.xp,
      xpIntoLevel: lv.xpIntoLevel,
      xpForNext: lv.xpForNext,
      coins: user.coins,
      rep: user.rep,
      amberBalance: amber,
      renown: user.renown,
      title: titleFor(user.renown),
      handle: handleFor(user.id),
      tutorialStep: user.tutorialStep,
      questIndex: user.questIndex,
      firstPlantDone: user.firstPlantDone,
      counters: {
        plantedCount: user.plantedCount,
        harvestedCount: user.harvestedCount,
        choppedCount: user.choppedCount,
        minedCount: user.minedCount,
        soldCount: user.soldCount,
        boughtSeeds: user.boughtSeeds,
        milkCount: user.milkCount,
        eggCount: user.eggCount,
        deliveriesDone: user.deliveriesDone,
        fishCount: user.fishCount,
        craftCount: user.craftCount,
        upgradesBought: user.upgradesBought,
        renown: user.renown,
      },
    },
    expansion: { north: expansion?.north ?? false, east: expansion?.east ?? false },
    plots: plots.map((p) => plotToDto(p, effects.growth)),
    nodes: nodes.map((n) => ({
      index: n.index,
      kind: n.kind,
      hp: n.hp,
      respawnAt: n.respawnAt?.getTime() ?? null,
    })),
    animals: animals.map((a) => ({
      index: a.index,
      kind: a.kind,
      nextYieldAt: a.nextYieldAt.getTime(),
      ready: a.ready,
    })),
    groundItems: groundItems.map((g) => ({ id: g.id, itemKey: g.itemKey, x: g.x, y: g.y })),
    inventory: Object.fromEntries(inventory.map((i) => [i.itemKey, i.qty])),
    seeds: Object.fromEntries(seeds.map((s) => [s.cropKey, s.qty])),
    deliverySlots: slots.map((s) => ({
      slot: s.slot,
      state: s.state,
      itemKey: s.itemKey,
      qty: s.qty,
      amber: s.amber,
      npc: s.npc,
      refillAt: s.refillAt?.getTime() ?? null,
      // Locked slots are still generated and shown, so the player can see what
      // is waiting behind the reputation gate rather than an empty box.
      unlocked: slotUnlocked(s.slot, user.rep),
      repRequired: repRequiredFor(s.slot),
    })),
    quest: quest.quest
      ? {
          index: quest.index,
          id: quest.quest.id,
          text: quest.quest.text,
          current: quest.current,
          target: quest.target,
        }
      : null,
    upgrades: { ...tiers },
    shop: upgradesToDto(tiers),
    effects,
    daily,
    away,
  };
}
