/**
 * Upgrades — the coin and $AMBER sink.
 *
 * A missing row means tier 0, so "buy the first tier" and "buy the fourth" are
 * the same code path and there is nothing to seed at bootstrap. Every price is
 * read from game-config inside the transaction that charges it; the request
 * carries an upgrade key and nothing else.
 */

import {
  ANIMALS,
  UPGRADES,
  bonusNodeYield,
  growthMultiplier,
  henCount,
  maxTier,
  nextTierCost,
  sellMultiplier,
  type UpgradeCost,
  type UpgradeKey,
  type ItemKey,
} from '@ambervale/game-config';
import type { Prisma } from '@prisma/client';
import { amberBalance } from './progression';
import { itemQty } from './actions';

export type UpgradeTiers = Record<UpgradeKey, number>;

/** Every upgrade's owned tier, defaulting to 0. */
export async function readUpgrades(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<UpgradeTiers> {
  const rows = await tx.upgrade.findMany({ where: { userId } });
  const tiers = {} as UpgradeTiers;
  for (const key of Object.keys(UPGRADES) as UpgradeKey[]) tiers[key] = 0;
  for (const row of rows) {
    if (row.key in UPGRADES) tiers[row.key as UpgradeKey] = row.tier;
  }
  return tiers;
}

export const tierOf = (tiers: UpgradeTiers, key: UpgradeKey): number => tiers[key] ?? 0;

/** The derived numbers every other service asks for. */
export interface UpgradeEffects {
  /** Extra wood per oak felled. */
  axeBonus: number;
  /** Extra stone per rock broken. */
  pickBonus: number;
  /** Multiplier on crop grow time — below 1 is faster. */
  growth: number;
  /** Multiplier on market sale prices. */
  sell: number;
  hens: number;
  canFish: boolean;
  canCraft: boolean;
}

export function effectsOf(tiers: UpgradeTiers): UpgradeEffects {
  return {
    axeBonus: bonusNodeYield(tierOf(tiers, 'axe')),
    pickBonus: bonusNodeYield(tierOf(tiers, 'pick')),
    growth: growthMultiplier(tierOf(tiers, 'well')),
    sell: sellMultiplier(tierOf(tiers, 'cellar')),
    hens: henCount(tierOf(tiers, 'coop')),
    canFish: tierOf(tiers, 'rod') >= 1,
    canCraft: tierOf(tiers, 'mill') >= 1,
  };
}

export async function effectsFor(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<UpgradeEffects> {
  return effectsOf(await readUpgrades(tx, userId));
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

export interface Shortfall {
  [resource: string]: { have: number; need: number };
}

/**
 * Checks a cost against what the player actually holds.
 *
 * Returns everything that is missing rather than the first failure, so the UI
 * can show "you still need 4 stone and 2 $AMBER" in one go.
 */
export async function shortfallFor(
  tx: Prisma.TransactionClient,
  userId: string,
  cost: UpgradeCost,
): Promise<Shortfall> {
  const missing: Shortfall = {};

  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (cost.coins && user.coins < cost.coins) {
    missing['coins'] = { have: user.coins, need: cost.coins };
  }

  if (cost.amber) {
    const balance = await amberBalance(tx, userId);
    if (balance < cost.amber) missing['amber'] = { have: balance, need: cost.amber };
  }

  for (const [item, need] of Object.entries(cost.items ?? {}) as [ItemKey, number][]) {
    const have = await itemQty(tx, userId, item);
    if (have < need) missing[item] = { have, need };
  }

  return missing;
}

export interface PurchaseResult {
  key: UpgradeKey;
  tier: number;
  effect: string;
  spent: UpgradeCost;
  /** Hens added, when this purchase was a coop extension. */
  hensAdded: number;
}

/**
 * Charges for and applies the next tier of an upgrade.
 *
 * Assumes the caller has already checked affordability and the level gate; it
 * re-reads the tier under the same transaction and compare-and-sets it, so two
 * concurrent buys cannot both charge for the same tier.
 */
export async function purchaseTier(
  tx: Prisma.TransactionClient,
  userId: string,
  key: UpgradeKey,
  currentTier: number,
  cost: UpgradeCost,
): Promise<PurchaseResult> {
  // Compare-and-set on the tier. Without this a double-submit that slipped
  // past the action lock would pay twice for one step.
  if (currentTier === 0) {
    await tx.upgrade.create({ data: { userId, key, tier: 1 } });
  } else {
    const moved = await tx.upgrade.updateMany({
      where: { userId, key, tier: currentTier },
      data: { tier: currentTier + 1 },
    });
    if (moved.count === 0) {
      throw new Error('UPGRADE_RACE');
    }
  }

  const tier = currentTier + 1;

  if (cost.coins) {
    await tx.user.update({ where: { id: userId }, data: { coins: { decrement: cost.coins } } });
  }
  if (cost.amber) {
    // Spending is a negative ledger row, never an edit to a balance column —
    // the balance stays SUM(delta) and the purchase stays auditable.
    await tx.amberLedger.create({
      data: { userId, delta: -cost.amber, reason: 'upgrade', refId: `${key}:${tier}` },
    });
  }
  for (const [item, qty] of Object.entries(cost.items ?? {}) as [ItemKey, number][]) {
    await tx.inventoryItem.update({
      where: { userId_itemKey: { userId, itemKey: item } },
      data: { qty: { decrement: qty } },
    });
  }

  const hensAdded = key === 'coop' ? await growCoop(tx, userId, tier) : 0;

  return {
    key,
    tier,
    effect: UPGRADES[key].tiers[tier - 1]?.effect ?? '',
    spent: cost,
    hensAdded,
  };
}

/**
 * Adds hens until the coop holds as many as the tier allows.
 *
 * Written as "top up to the target" rather than "add one" so a tier bought
 * while a previous one somehow failed still lands on the right number.
 */
async function growCoop(
  tx: Prisma.TransactionClient,
  userId: string,
  tier: number,
): Promise<number> {
  const target = henCount(tier);
  const existing = await tx.animal.findMany({ where: { userId, kind: 'chicken' } });
  if (existing.length >= target) return 0;

  const { layMinSec, layMaxSec } = ANIMALS.chicken;
  // Indexes must not collide with the cow, which sits at ANIMALS.chicken.count
  // on a starting farm; new hens are appended above every existing index.
  const highest = (await tx.animal.findFirst({ where: { userId }, orderBy: { index: 'desc' } }))
    ?.index;
  let next = (highest ?? -1) + 1;

  const created: Prisma.AnimalCreateManyInput[] = [];
  for (let i = existing.length; i < target; i++) {
    const delay = layMinSec + Math.random() * (layMaxSec - layMinSec);
    created.push({
      userId,
      index: next++,
      kind: 'chicken',
      nextYieldAt: new Date(Date.now() + delay * 1000),
    });
  }

  await tx.animal.createMany({ data: created, skipDuplicates: true });
  return created.length;
}

/** Shape the client renders the shop from. */
export interface UpgradeDto {
  key: UpgradeKey;
  name: string;
  blurb: string;
  tier: number;
  maxTier: number;
  unlockLv: number;
  /** Effect of the tier currently owned, or null at tier 0. */
  effect: string | null;
  /** Effect and cost of the next tier, or null when fully upgraded. */
  next: { effect: string; cost: UpgradeCost } | null;
}

export function upgradesToDto(tiers: UpgradeTiers): UpgradeDto[] {
  return (Object.keys(UPGRADES) as UpgradeKey[]).map((key) => {
    const def = UPGRADES[key];
    const tier = tierOf(tiers, key);
    const cost = nextTierCost(key, tier);

    return {
      key,
      name: def.name,
      blurb: def.blurb,
      tier,
      maxTier: maxTier(key),
      unlockLv: def.unlockLv,
      effect: tier > 0 ? (def.tiers[tier - 1]?.effect ?? null) : null,
      next: cost ? { effect: def.tiers[tier]!.effect, cost } : null,
    };
  });
}
