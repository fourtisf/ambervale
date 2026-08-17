/**
 * GET /farm — the whole world state in one payload.
 *
 * Also the place where lazily-repaired state is materialised: node respawns
 * (Phase 3), egg laying (Phase 6) and delivery refills (Phase 4) are all
 * computed from timestamps when someone looks, rather than by a scheduler.
 *
 * Because this read is already the moment the farm catches up with real time,
 * it is also where the "while you were away" report is assembled — the numbers
 * are a by-product of repairs that were happening anyway.
 */

import {
  AWAY,
  HOMESTEAD_GIFT_SEEDS,
  conditionsFor,
  homesteadGiftCoins,
  isCropKey,
} from '@ambervale/game-config';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { materialiseAnimalYields } from '../services/animals';
import { ensureDaily } from '../services/daily';
import { ensureDeliverySlots } from '../services/deliveries';
import {
  bootstrapFarm,
  ensureWorldRows,
  getFarmState,
  growMsFor,
  repairNodes,
  repairPlots,
  type AwayReport,
} from '../services/farm';
import { effectsFor } from '../services/upgrades';
import { ensureVisitSlug } from '../services/visit';

export async function farmRoutes(app: FastifyInstance): Promise<void> {
  app.get('/farm', async (req, reply) => {
    const user = req.requireUser();

    // A session can outlive a failed bootstrap; make sure the farm exists.
    if (!user.bootstrapped) await bootstrapFarm(user.id);

    const now = Date.now();
    const lastSeen = user.lastSeenAt.getTime();
    const awayMs = Math.max(0, now - lastSeen);
    const reportable = awayMs >= AWAY.minGapSec * 1000;

    // Lazy repair: node respawns and delivery refills are materialised when
    // someone looks, so no scheduler is needed for a farm left alone for days.
    // The public address of this farm, minted on first read. Outside the
    // transaction below on purpose: claiming a slug retries through unique
    // violations, and a P2002 inside an open Postgres transaction poisons
    // every statement after it. Each attempt here is its own tiny write.
    await ensureVisitSlug(prisma, user);

    const away = await prisma.$transaction(async (tx) => {
      // World rows the config has grown since this account was seeded — the
      // Far Shore's plots and stands appear here for pre-island farms.
      await ensureWorldRows(tx, user.id);

      // Crops are counted before the repairs, but from timestamps, so ordering
      // does not matter — what matters is that a crop which came ready during
      // the gap is counted even though nobody was there to see it.
      const cropsReady = reportable ? await countCropsReadyDuring(tx, user.id, lastSeen, now) : 0;

      const nodesRegrown = await repairNodes(tx, user.id);
      // Crops the crows finished off while nobody was watching. Same lazy
      // rule, and reported rather than silently vanished: a field that is
      // three plots emptier than you left it needs to say why.
      const effects = await effectsFor(tx, user.id);
      // Ruins that would have happened while nobody was here are forgiven —
      // the crop waits, ripe, for the player who comes back.
      const plotRepair = await repairPlots(
        tx,
        user.id,
        effects.growth,
        effects.scarecrowMs,
        reportable ? lastSeen : null,
      );
      const yields = await materialiseAnimalYields(tx, user.id);
      const ordersRefreshed = await ensureDeliverySlots(tx, user.id);
      await ensureDaily(tx, user.id, now);

      // The Farmhouse perk: a neighbour minds the place. Coins scaled by the
      // absence (capped at a day — a welcome, not an income) plus a couple of
      // seeds of whatever the market wants today, so the gift points at the
      // day's decision as well as warming the return.
      let gift: AwayReport['gift'] = null;
      const giftCoins = reportable ? homesteadGiftCoins(awayMs, user.homesteadTier) : 0;
      if (giftCoins > 0) {
        const sought = conditionsFor(now).market.sought;
        const seedKey = isCropKey(sought) ? sought : null;
        await tx.user.update({
          where: { id: user.id },
          data: { coins: { increment: giftCoins } },
        });
        if (seedKey) {
          await tx.seedItem.upsert({
            where: { userId_cropKey: { userId: user.id, cropKey: seedKey } },
            create: { userId: user.id, cropKey: seedKey, qty: HOMESTEAD_GIFT_SEEDS },
            update: { qty: { increment: HOMESTEAD_GIFT_SEEDS } },
          });
        }
        await tx.eventLog.create({
          data: {
            userId: user.id,
            kind: 'homestead.gift',
            payload: { coins: giftCoins, seedKey, seeds: seedKey ? HOMESTEAD_GIFT_SEEDS : 0 },
          },
        });
        gift = { coins: giftCoins, seedKey, seeds: seedKey ? HOMESTEAD_GIFT_SEEDS : 0 };
      }

      await tx.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date(now) } });

      if (!reportable) return null;

      const report: AwayReport = {
        awayMs,
        eggsLaid: yields.eggsLaid,
        milkReady: yields.milkReady,
        nodesRegrown,
        cropsReady,
        cropsRuined: plotRepair.ruined,
        cropsSpared: plotRepair.spared,
        ordersRefreshed,
        gift,
      };

      // Nothing happened worth a card. Say nothing rather than open a modal
      // that reports zeroes.
      const anything =
        report.eggsLaid > 0 ||
        report.milkReady ||
        report.nodesRegrown > 0 ||
        report.cropsReady > 0 ||
        report.cropsRuined > 0 ||
        report.cropsSpared > 0 ||
        report.gift !== null ||
        report.ordersRefreshed > 0;

      return anything ? report : null;
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return reply.send(await getFarmState(prisma, fresh, away));
  });
}

/**
 * How many crops finished growing during the gap.
 *
 * Derived from `plantedAt` rather than stored, like everything else that
 * depends on elapsed time: there is no "became ready" event to miss.
 */
async function countCropsReadyDuring(
  tx: Parameters<typeof repairNodes>[0],
  userId: string,
  from: number,
  to: number,
): Promise<number> {
  const effects = await effectsFor(tx, userId);
  const plots = await tx.plot.findMany({ where: { userId, NOT: { cropKey: null } } });

  let count = 0;
  for (const plot of plots) {
    if (!plot.cropKey || !plot.plantedAt) continue;
    const readyAt = plot.plantedAt.getTime() + growMsFor(plot.cropKey, plot.fast, effects.growth);
    if (readyAt > from && readyAt <= to) count += 1;
  }
  return count;
}
