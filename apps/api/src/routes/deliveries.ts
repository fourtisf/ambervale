/**
 * POST /act/deliver and POST /act/expand.
 *
 * Delivering is the only way $AMBER enters the game, so it is the endpoint
 * that most needs to be exactly-once. Idempotency is enforced by a unique
 * (userId, scope, key) row written inside the same transaction that pays out:
 * a retry with the same key cannot pay twice, because the insert that records
 * the payment is what would have to succeed twice for that to happen.
 */

import { DELIVERIES, EXPANSION_NORTH, PLOTS } from '@ambervale/game-config';
import type { FastifyInstance } from 'fastify';
import type { Prisma, User } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import { allowMutation, takeActionLock } from '../lib/rateLimit';
import { rateLimited } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { addItem, grant, itemQty, logEvent } from '../services/actions';
import { ensureDeliverySlots, slotUnlocked, repRequiredFor } from '../services/deliveries';
import { getFarmState } from '../services/farm';
import { evaluateQuests } from '../services/quests';

const DeliverBody = z.object({
  slot: z.number().int().min(1).max(DELIVERIES.slots),
  idempotencyKey: z.string().min(8).max(128),
});

async function withFarm(user: User, extra: Record<string, unknown>) {
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return { ...extra, farm: await getFarmState(prisma, fresh) };
}

/** Replays a previous result for a repeated idempotency key, if one exists. */
async function replay(
  tx: Prisma.TransactionClient,
  userId: string,
  scope: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const row = await tx.idempotencyKey.findUnique({
    where: { userId_scope_key: { userId, scope, key } },
  });
  return row ? (row.result as Record<string, unknown>) : null;
}

export async function deliveryRoutes(app: FastifyInstance): Promise<void> {
  app.post('/act/deliver', async (req, res) => {
    const body = parseBody(DeliverBody, req);
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'deliver', body.slot))) {
      throw conflict('TOO_FAST', 'That delivery is already in flight.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const cached = await replay(tx, user.id, 'deliver', body.idempotencyKey);
      if (cached) return { ...cached, replayed: true };

      await ensureDeliverySlots(tx, user.id);

      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.level < DELIVERIES.unlockLv) {
        throw conflict('SLOT_LOCKED', `Deliveries unlock at level ${DELIVERIES.unlockLv}.`, {
          required: DELIVERIES.unlockLv,
        });
      }

      if (!slotUnlocked(body.slot, fresh.rep)) {
        throw conflict('SLOT_LOCKED', 'Not enough reputation for this slot.', {
          have: fresh.rep,
          need: repRequiredFor(body.slot),
        });
      }

      const row = await tx.deliverySlot.findUnique({
        where: { userId_slot: { userId: user.id, slot: body.slot } },
      });
      if (!row) throw notFound(`No delivery slot ${body.slot}.`);
      if (row.state !== 'open' || !row.itemKey || !row.qty || row.amber === null) {
        throw conflict('SLOT_NOT_OPEN', 'That order has already been filled.', {
          refillAt: row.refillAt?.getTime() ?? null,
        });
      }

      const have = await itemQty(tx, user.id, row.itemKey);
      if (have < row.qty) {
        throw conflict('INSUFFICIENT_ITEMS', `Not enough ${row.itemKey}.`, {
          have,
          need: row.qty,
        });
      }

      // Everything below is one atomic unit: goods out, $AMBER in, slot closed.
      await addItem(tx, user.id, row.itemKey, -row.qty);

      await tx.amberLedger.create({
        data: { userId: user.id, delta: row.amber, reason: 'delivery', refId: row.id },
      });

      await tx.deliverySlot.update({
        where: { id: row.id },
        data: {
          state: 'done',
          refillAt: new Date(Date.now() + DELIVERIES.refillSec * 1000),
        },
      });

      const g = await grant(tx, user.id, {
        xp: DELIVERIES.xpPerDelivery,
        rep: DELIVERIES.repPerDelivery,
        counters: { deliveriesDone: 1 },
      });

      await logEvent(tx, user.id, 'act.deliver', {
        slot: body.slot,
        itemKey: row.itemKey,
        qty: row.qty,
        amber: row.amber,
        seed: row.seed,
      });

      const questCompleted = await evaluateQuests(tx, user.id);

      const payload = {
        amberGained: row.amber,
        repGained: DELIVERIES.repPerDelivery,
        xp: DELIVERIES.xpPerDelivery,
        levelUps: g.levelUps,
        questCompleted,
      };

      // Written inside the payout transaction. A concurrent retry with the same
      // key loses the unique index and rolls back rather than paying twice.
      try {
        await tx.idempotencyKey.create({
          data: {
            userId: user.id,
            scope: 'deliver',
            key: body.idempotencyKey,
            result: payload as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw conflict('CONFLICT', 'That delivery is already being processed.');
        }
        throw err;
      }

      return { ...payload, replayed: false };
    });

    return res.send(await withFarm(user, result));
  });

  // -------------------------------------------------------------------------

  app.post('/act/expand', async (req, res) => {
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'expand'))) {
      throw conflict('TOO_FAST', 'Already expanding.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const expansion = await tx.expansion.findUnique({ where: { userId: user.id } });
      if (expansion?.north)
        throw conflict('ALREADY_EXPANDED', 'The north meadow is already yours.');

      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const wood = await itemQty(tx, user.id, 'wood');
      const stone = await itemQty(tx, user.id, 'stone');

      const missing: Record<string, { have: number; need: number }> = {};
      if (fresh.coins < EXPANSION_NORTH.coins) {
        missing['coins'] = { have: fresh.coins, need: EXPANSION_NORTH.coins };
      }
      if (wood < EXPANSION_NORTH.wood) missing['wood'] = { have: wood, need: EXPANSION_NORTH.wood };
      if (stone < EXPANSION_NORTH.stone) {
        missing['stone'] = { have: stone, need: EXPANSION_NORTH.stone };
      }
      if (Object.keys(missing).length > 0) {
        throw conflict('INSUFFICIENT_ITEMS', 'Not enough to claim the meadow yet.', { missing });
      }

      await addItem(tx, user.id, 'wood', -EXPANSION_NORTH.wood);
      await addItem(tx, user.id, 'stone', -EXPANSION_NORTH.stone);

      // Compare-and-set so two concurrent expands cannot both charge the player.
      const claimed = await tx.expansion.updateMany({
        where: { userId: user.id, north: false },
        data: { north: true },
      });
      if (claimed.count === 0) {
        throw conflict('ALREADY_EXPANDED', 'The north meadow is already yours.');
      }

      const g = await grant(tx, user.id, {
        coins: -EXPANSION_NORTH.coins,
        xp: EXPANSION_NORTH.xp,
      });

      await logEvent(tx, user.id, 'act.expand', { cost: EXPANSION_NORTH });
      const questCompleted = await evaluateQuests(tx, user.id);

      return {
        levelUps: g.levelUps,
        questCompleted,
        plotsAdded: PLOTS.filter((p) => p.zone === 'north').length,
      };
    });

    return res.send(await withFarm(user, result));
  });
}
