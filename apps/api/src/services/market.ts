/**
 * The market that moves.
 *
 * Prices used to be constants, which made the Market screen a vending machine
 * and the four-crop menu a list already sorted for the player: coins per second
 * rose strictly with grow time, so the best crop you had unlocked was always
 * the right answer and there was never anything to decide.
 *
 * Saturation fixes that without adding a screen. Selling one good depresses its
 * own price and nothing else's, so a monoculture pays less than a mixed field,
 * and waiting pays more than dumping. The decision is now real and it is made
 * in the same place it always was.
 *
 * Saturation is stored at a timestamp and decayed on read, never stored
 * decayed. That is the same lazy-repair rule the respawns and egg timers
 * follow: no scheduler exists, and a farm nobody opened for a week must come
 * back correct rather than frozen at the moment it was closed.
 */

import {
  GOODS,
  CROPS,
  MARKET,
  decaySaturation,
  isCropKey,
  priceMultiplier,
  saleQuote,
  sellPrice,
  type ItemKey,
} from '@ambervale/game-config';
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Current saturation for one good, decayed to now. */
export async function saturationOf(db: Db, userId: string, itemKey: string): Promise<number> {
  const row = await db.marketGood.findUnique({
    where: { userId_itemKey: { userId, itemKey } },
  });
  if (!row) return 0;
  return decaySaturation(row.saturation, Date.now() - row.updatedAt.getTime());
}

/**
 * What a sale of `qty` units is worth right now, before the cellar multiplier.
 *
 * Returns the saturation to store as well, so the caller writes exactly the
 * number this quote was priced from — recomputing it after the fact would let
 * the two drift apart by however long the transaction took.
 */
export async function quoteSale(
  db: Db,
  userId: string,
  itemKey: ItemKey,
  qty: number,
): Promise<{ coins: number; multiplier: number; saturationAfter: number }> {
  const saturation = await saturationOf(db, userId, itemKey);
  const { multiplier, saturationAfter } = saleQuote(saturation, qty);
  return {
    coins: Math.round(sellPrice(itemKey) * qty * multiplier),
    multiplier,
    saturationAfter,
  };
}

/** Writes back the saturation a sale left behind. */
export async function recordSale(
  db: Db,
  userId: string,
  itemKey: string,
  saturationAfter: number,
): Promise<void> {
  await db.marketGood.upsert({
    where: { userId_itemKey: { userId, itemKey } },
    create: { userId, itemKey, saturation: saturationAfter },
    update: { saturation: saturationAfter },
  });
}

export interface MarketPriceDto {
  itemKey: string;
  /** List price from game-config, before saturation or the cellar. */
  base: number;
  /** What one unit fetches right now, cellar included. Rounded for display. */
  price: number;
  /** Saturation multiplier alone, so the UI can show why a price moved. */
  multiplier: number;
  /** When this good is worth selling again, or null if it already is. */
  recoversAt: number | null;
}

/**
 * Every sellable good with its current price.
 *
 * Sent with the whole farm rather than fetched when the Market opens, because
 * a price the player cannot see before walking there is a mechanic they will
 * experience only as a number that went wrong.
 */
export async function readPrices(
  db: Db,
  userId: string,
  sellMul: number,
): Promise<MarketPriceDto[]> {
  const rows = await db.marketGood.findMany({ where: { userId } });
  const now = Date.now();
  const bySat = new Map(
    rows.map((r) => [r.itemKey, decaySaturation(r.saturation, now - r.updatedAt.getTime())]),
  );

  const keys: string[] = [...Object.keys(CROPS), ...Object.keys(GOODS)];
  return keys.map((itemKey) => {
    const saturation = bySat.get(itemKey) ?? 0;
    const multiplier = priceMultiplier(saturation);
    const base = sellPrice(itemKey as ItemKey);
    return {
      itemKey,
      base,
      price: Math.round(base * multiplier * sellMul),
      multiplier,
      recoversAt: recoveryMs(saturation) > 0 ? now + recoveryMs(saturation) : null,
    };
  });
}

/**
 * When this good is worth selling again.
 *
 * Deliberately the time to *nearly* recovered rather than to par. Exponential
 * decay approaches par and never arrives, so quoting the last few percent
 * turns a twenty-minute wait into a ninety-minute number and reads as a
 * punishment when it is meant to be advice. A player asking "when is this
 * worth selling again" is answered by 90%, not by 99.9%.
 */
const RECOVERED_AT = 1 / 0.9 - 1;

function recoveryMs(saturation: number): number {
  if (saturation <= RECOVERED_AT) return 0;
  const halves = Math.log(saturation / RECOVERED_AT) / Math.log(2);
  return Math.round(halves * MARKET.halfLifeMs);
}

/** True for keys the market will actually buy, for validation at the edge. */
export const isSellable = (key: string): boolean =>
  isCropKey(key) || Object.prototype.hasOwnProperty.call(GOODS, key);
