/**
 * POST /act/deliver and POST /act/expand.
 *
 * Delivering is the only way $AMBER enters the game, so it is the endpoint
 * that most needs to be exactly-once. Idempotency is enforced by a unique
 * (userId, scope, key) row written inside the same transaction that pays out:
 * a retry with the same key cannot pay twice, because the insert that records
 * the payment is what would have to succeed twice for that to happen.
 */

import {
  DELIVERIES,
  EXPANSIONS,
  PLOTS,
  isExpansionZone,
  type ExpansionZone,
} from '@ambervale/game-config';
import type { FastifyInstance } from 'fastify';
import type { Prisma, User } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import { allowMutation, takeActionLock } from '../lib/rateLimit';
import { rateLimited } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { addItem, evaluateProgress, grant, itemQty, logEvent } from '../services/actions';
import { amberBalance } from '../services/progression';
import { ensureDeliverySlots, slotUnlocked, repRequiredFor } from '../services/deliveries';
import { getFarmState } from '../services/farm';

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

      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      const payload = {
        amberGained: row.amber,
        repGained: DELIVERIES.repPerDelivery,
        xp: DELIVERIES.xpPerDelivery,
        levelUps: g.levelUps,
        questCompleted,
        daily,
      };

      // Written inside the payout transaction. A concurrent retry with the same
      // key loses the unique index and rolls back rather than paying twice.
      try {
        await tx.idempotencyKey.create({
          data: {
            userId: user.id,
            scope: 'deliver',
            key: body.idempotencyKey,
            result: payload as unknown as Prisma.InputJsonValue,
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
    // Older clients sent no body at all, when north was the only meadow.
    const body = parseBody(z.object({ zone: z.string().optional() }), req);
    const zone: ExpansionZone = isExpansionZone(body.zone ?? 'north')
      ? ((body.zone ?? 'north') as ExpansionZone)
      : 'north';
    const def = EXPANSIONS[zone];

    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'expand', zone))) {
      throw conflict('TOO_FAST', 'Already expanding.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const expansion = await tx.expansion.findUnique({ where: { userId: user.id } });
      if (expansion?.[zone]) {
        throw conflict('ALREADY_EXPANDED', `The ${zone} meadow is already yours.`);
      }

      // The east meadow is the second purchase, not an alternative to the
      // first: buying it out of order would leave a gap in the map.
      if ('requiresNorth' in def && def.requiresNorth && !expansion?.north) {
        throw conflict('PLOT_LOCKED', 'Claim the north meadow first.');
      }

      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if ('unlockLv' in def && fresh.level < def.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `That meadow opens at level ${def.unlockLv}.`, {
          required: def.unlockLv,
        });
      }

      const wood = await itemQty(tx, user.id, 'wood');
      const stone = await itemQty(tx, user.id, 'stone');
      const amber = await amberBalance(tx, user.id);
      const needAmber = 'amber' in def ? def.amber : 0;

      const missing: Record<string, { have: number; need: number }> = {};
      if (fresh.coins < def.coins) missing['coins'] = { have: fresh.coins, need: def.coins };
      if (wood < def.wood) missing['wood'] = { have: wood, need: def.wood };
      if (stone < def.stone) missing['stone'] = { have: stone, need: def.stone };
      if (needAmber && amber < needAmber) missing['amber'] = { have: amber, need: needAmber };

      if (Object.keys(missing).length > 0) {
        throw conflict('INSUFFICIENT_ITEMS', 'Not enough to claim the meadow yet.', { missing });
      }

      await addItem(tx, user.id, 'wood', -def.wood);
      await addItem(tx, user.id, 'stone', -def.stone);
      if (needAmber) {
        await tx.amberLedger.create({
          data: { userId: user.id, delta: -needAmber, reason: 'expansion', refId: zone },
        });
      }

      // Compare-and-set so two concurrent expands cannot both charge the player.
      const claimed = await tx.expansion.updateMany({
        where: { userId: user.id, [zone]: false },
        data: { [zone]: true },
      });
      if (claimed.count === 0) {
        throw conflict('ALREADY_EXPANDED', `The ${zone} meadow is already yours.`);
      }

      const g = await grant(tx, user.id, { coins: -def.coins, xp: def.xp });

      await logEvent(tx, user.id, 'act.expand', { zone, cost: JSON.stringify(def) });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return {
        levelUps: g.levelUps,
        levelRewards: g.levelRewards,
        questCompleted,
        daily,
        zone,
        plotsAdded: PLOTS.filter((p) => p.zone === zone).length,
      };
    });

    return res.send(await withFarm(user, result));
  });
}
