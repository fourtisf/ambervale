/**
 * The delivery board — the $AMBER earn layer.
 *
 * Orders are generated server-side only, from a seed stored on the row. That
 * makes every order reproducible: given the seed you can re-derive exactly
 * what a player was asked for and what it paid, without trusting a single
 * byte the client sent. The client is only ever told the result.
 */

import {
  CROPS,
  DELIVERIES,
  DELIVERY_NPCS,
  GOODS,
  mulberry32,
  type DeliveryItemKey,
} from '@ambervale/game-config';
import type { Prisma } from '@prisma/client';

export interface GeneratedOrder {
  itemKey: DeliveryItemKey;
  qty: number;
  amber: number;
  npc: number;
  seed: number;
}

/** Reputation needed to use a given slot. Slot 1 is always available. */
export function repRequiredFor(slot: number): number {
  if (slot === 2) return DELIVERIES.slot2RepReq;
  if (slot === 3) return DELIVERIES.slot3RepReq;
  return 0;
}

export const slotUnlocked = (slot: number, rep: number): boolean => rep >= repRequiredFor(slot);

/**
 * Derives an order from a seed and the player's level.
 *
 * Pure: same seed and level always give the same order, which is what makes
 * the stored seed an audit trail rather than decoration.
 */
export function generateOrder(seed: number, level: number): GeneratedOrder {
  const rng = mulberry32(seed);

  // Crops the player has actually unlocked, minus starglow — a 6-minute crop
  // is not a reasonable thing for a delivery to demand.
  const pool = (Object.keys(CROPS) as (keyof typeof CROPS)[]).filter(
    (key) => key !== 'starglow' && level >= CROPS[key].unlockLv,
  ) as DeliveryItemKey[];

  let itemKey: DeliveryItemKey =
    pool.length > 0 ? pool[Math.floor(rng() * pool.length)]! : 'sunflower';

  // From level 5, some orders ask for eggs instead of crops.
  if (level >= DELIVERIES.eggOrderMinLv && rng() < DELIVERIES.eggOrderChance) {
    itemKey = 'egg';
  }

  const range = DELIVERIES.qty[itemKey];
  const qty = range[0] + Math.floor(rng() * (range[1] - range[0] + 1));

  const unitValue = itemKey === 'egg' ? GOODS.egg.sell : CROPS[itemKey].sell;
  const amber = DELIVERIES.amberFormula(unitValue, qty);

  return {
    itemKey,
    qty,
    amber,
    npc: Math.floor(rng() * DELIVERY_NPCS.length),
    seed,
  };
}

/** A fresh seed. Only ever chosen server-side. */
const newSeed = (): number => Math.floor(Math.random() * 0x7fffffff);

/**
 * Ensures the board exists and is current.
 *
 * Called on every /farm read and before any deliver attempt: slots appear once
 * the player reaches DELIVERIES.unlockLv, and completed slots regenerate once
 * their refill time passes. Lazy, so no scheduler is needed.
 */
export async function ensureDeliverySlots(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.level < DELIVERIES.unlockLv) return;

  const existing = await tx.deliverySlot.findMany({ where: { userId } });
  const bySlot = new Map(existing.map((s) => [s.slot, s]));
  const now = new Date();

  for (let slot = 1; slot <= DELIVERIES.slots; slot++) {
    const row = bySlot.get(slot);

    if (!row) {
      // Locked slots are still generated, so the UI can show what is waiting
      // behind the reputation gate rather than an empty box.
      const order = generateOrder(newSeed(), user.level);
      await tx.deliverySlot.create({
        data: {
          userId,
          slot,
          state: 'open',
          itemKey: order.itemKey,
          qty: order.qty,
          amber: order.amber,
          npc: order.npc,
          seed: order.seed,
        },
      });
      continue;
    }

    if (row.state === 'done' && row.refillAt && row.refillAt <= now) {
      const order = generateOrder(newSeed(), user.level);
      await tx.deliverySlot.update({
        where: { id: row.id },
        data: {
          state: 'open',
          itemKey: order.itemKey,
          qty: order.qty,
          amber: order.amber,
          npc: order.npc,
          seed: order.seed,
          refillAt: null,
        },
      });
    }
  }
}
