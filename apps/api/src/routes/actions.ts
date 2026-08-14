/**
 * The core loop: plant, harvest, chop, mine, sell, buy seeds.
 *
 * Every rule is enforced here, from numbers imported only from game-config.
 * The client may predict any of this optimistically; it is never believed.
 */

import {
  CROPS,
  NODES,
  NODE_HIT_COOLDOWN_MS,
  isCropKey,
  isItemKey,
  nodeSlotAt,
  sellPrice,
  type CropKey,
  type GoodKey,
} from '@ambervale/game-config';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { badRequest, conflict, notFound, rateLimited } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowMutation, allowNodeHit, takeActionLock } from '../lib/rateLimit';
import { parseBody } from '../lib/validate';
import {
  addItem,
  addSeed,
  evaluateProgress,
  grant,
  itemQty,
  logEvent,
  seedQty,
} from '../services/actions';
import type { DailyOutcome } from '../services/daily';
import { getFarmState, growMsFor, plotToDto, repairNodes } from '../services/farm';
import type { QuestCompletion } from '../services/quests';
import { effectsFor } from '../services/upgrades';

/**
 * Every action replies with the whole farm rather than a delta.
 *
 * It costs a few KB, and it removes an entire class of bug: the client can
 * never accumulate a divergent view of its own inventory, because it re-reads
 * the truth after every mutation instead of patching a local copy.
 */
async function reply(
  user: User,
  extra: {
    levelUps: number[];
    questCompleted?: QuestCompletion | null;
    daily?: DailyOutcome;
    gained?: Record<string, number>;
    [key: string]: unknown;
  },
) {
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return { ...extra, farm: await getFarmState(prisma, fresh) };
}

/** Guards shared by every mutating endpoint. */
async function guard(req: FastifyRequest, action: string, entity: string | number = '-') {
  const user = req.requireUser();

  if (!(await allowMutation(user.id))) throw rateLimited();

  if (!(await takeActionLock(user.id, action, entity))) {
    throw conflict('TOO_FAST', 'That action is already in flight.');
  }

  return user;
}

const PlantBody = z.object({
  plotIndex: z.number().int().min(0),
  cropKey: z.string().min(1),
});
const PlotBody = z.object({ plotIndex: z.number().int().min(0) });
const NodeBody = z.object({ nodeIndex: z.number().int().min(0) });
const SellBody = z.object({
  itemKey: z.string().min(1),
  // "all" is the only accepted quantity: the server decides how many that is.
  // Numeric quantities would just be a number to tamper with.
  qty: z.literal('all'),
});
const BuySeedBody = z.object({
  cropKey: z.string().min(1),
  qty: z.union([z.literal(1), z.literal(5)]),
});

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Plant
  // -------------------------------------------------------------------------
  app.post('/act/plant', async (req, res) => {
    const body = parseBody(PlantBody, req);
    const user = await guard(req, 'plant', body.plotIndex);

    if (!isCropKey(body.cropKey)) throw badRequest(`Unknown crop "${body.cropKey}".`);
    const cropKey: CropKey = body.cropKey;
    const crop = CROPS[cropKey];

    const result = await prisma.$transaction(async (tx) => {
      const plot = await tx.plot.findUnique({
        where: { userId_index: { userId: user.id, index: body.plotIndex } },
      });
      if (!plot) throw notFound(`No plot ${body.plotIndex}.`);
      if (plot.cropKey) throw conflict('PLOT_OCCUPIED', 'Something is already growing here.');

      if (plot.zone === 'north') {
        const expansion = await tx.expansion.findUnique({ where: { userId: user.id } });
        if (!expansion?.north) {
          throw conflict('PLOT_LOCKED', 'The north meadow is not yours yet.');
        }
      }

      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.level < crop.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `${cropKey} unlocks at level ${crop.unlockLv}.`, {
          required: crop.unlockLv,
        });
      }

      const have = await seedQty(tx, user.id, cropKey);
      if (have < 1) throw conflict('NO_SEEDS', `No ${cropKey} seeds left.`);

      // The well shortens every grow time, so the plot we hand back has to be
      // dated with the player's own multiplier — not the base one.
      const effects = await effectsFor(tx, user.id);

      await addSeed(tx, user.id, cropKey, -1);

      // The very first crop a player ever plants grows in seconds, so the
      // tutorial never asks anyone to watch dirt for half a minute.
      const fast = !fresh.firstPlantDone;
      const updated = await tx.plot.update({
        where: { id: plot.id },
        data: { cropKey, plantedAt: new Date(), fast },
      });

      if (fast) {
        await tx.user.update({ where: { id: user.id }, data: { firstPlantDone: true } });
      }

      const g = await grant(tx, user.id, { counters: { plantedCount: 1 } });
      await logEvent(tx, user.id, 'act.plant', { plotIndex: body.plotIndex, cropKey, fast });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { plot: plotToDto(updated, effects.growth), g, questCompleted, daily, fast };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        plot: result.plot,
        fast: result.fast,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Harvest
  // -------------------------------------------------------------------------
  app.post('/act/harvest', async (req, res) => {
    const body = parseBody(PlotBody, req);
    const user = await guard(req, 'harvest', body.plotIndex);

    const result = await prisma.$transaction(async (tx) => {
      const plot = await tx.plot.findUnique({
        where: { userId_index: { userId: user.id, index: body.plotIndex } },
      });
      if (!plot) throw notFound(`No plot ${body.plotIndex}.`);
      if (!plot.cropKey || !plot.plantedAt) {
        throw conflict('PLOT_EMPTY', 'Nothing is growing here.');
      }

      const effects = await effectsFor(tx, user.id);
      const readyAt = plot.plantedAt.getTime() + growMsFor(plot.cropKey, plot.fast, effects.growth);
      const remainingMs = readyAt - Date.now();
      if (remainingMs > 0) {
        // The client renders this countdown directly, so it has to be exact.
        throw conflict('NOT_READY', 'Not ready yet.', { remainingMs, readyAt });
      }

      const cropKey = plot.cropKey as CropKey;
      const crop = CROPS[cropKey];

      await addItem(tx, user.id, cropKey, 1);
      await tx.plot.update({
        where: { id: plot.id },
        data: { cropKey: null, plantedAt: null, fast: false },
      });

      const g = await grant(tx, user.id, {
        xp: crop.xp,
        counters: { harvestedCount: 1 },
      });
      await logEvent(tx, user.id, 'act.harvest', { plotIndex: body.plotIndex, cropKey });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { g, questCompleted, daily, cropKey, xp: crop.xp };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        gained: { [result.cropKey]: 1 },
        xp: result.xp,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Chop / mine — same mechanic, different node kind
  // -------------------------------------------------------------------------
  async function doHit(req: FastifyRequest, expectedKind: 'oak' | 'rock', action: string) {
    const body = parseBody(NodeBody, req);
    const user = await guard(req, action, body.nodeIndex);

    const slot = nodeSlotAt(body.nodeIndex);
    if (!slot) throw notFound(`No node ${body.nodeIndex}.`);
    if (slot.kind !== expectedKind) {
      throw badRequest(`Node ${body.nodeIndex} is a ${slot.kind}, not a ${expectedKind}.`);
    }

    // Per-node cooldown on top of the global rate limit: swinging faster than
    // the animation is the cheapest way to farm a node, so it is capped here.
    if (!(await allowNodeHit(user.id, body.nodeIndex, NODE_HIT_COOLDOWN_MS))) {
      throw conflict('TOO_FAST', 'Swinging too fast.');
    }

    const def = NODES[expectedKind];

    return prisma.$transaction(async (tx) => {
      // Lazy respawn: a node whose timer elapsed is restored before we judge it.
      await repairNodes(tx, user.id);

      const node = await tx.resourceNode.findUnique({
        where: { userId_index: { userId: user.id, index: body.nodeIndex } },
      });
      if (!node) throw notFound(`No node ${body.nodeIndex}.`);
      if (node.hp <= 0) {
        throw conflict('NODE_DEPLETED', 'Nothing left here yet.', {
          respawnAt: node.respawnAt?.getTime() ?? null,
        });
      }

      const hp = node.hp - 1;
      const felled = hp <= 0;

      await tx.resourceNode.update({
        where: { id: node.id },
        data: {
          hp: Math.max(0, hp),
          respawnAt: felled ? new Date(Date.now() + def.respawnSec * 1000) : null,
        },
      });

      const gained: Record<string, number> = {};
      let xp = 0;

      if (felled) {
        // A better tool means more from the same tree. The bonus lands on the
        // node's primary drop only, so a pick cannot conjure wood.
        const effects = await effectsFor(tx, user.id);
        const primary = expectedKind === 'oak' ? 'wood' : 'stone';
        const bonus = expectedKind === 'oak' ? effects.axeBonus : effects.pickBonus;

        for (const [itemKey, qty] of Object.entries(def.yield) as [GoodKey, number][]) {
          const total = qty + (itemKey === primary ? bonus : 0);
          await addItem(tx, user.id, itemKey, total);
          gained[itemKey] = total;
        }
        xp = expectedKind === 'oak' ? NODES.oak.xpOnFell : NODES.rock.xpOnBreak;
      }

      const counters = felled
        ? { [expectedKind === 'oak' ? 'choppedCount' : 'minedCount']: 1 }
        : {};

      const g = await grant(tx, user.id, { xp, counters });
      await logEvent(tx, user.id, `act.${action}`, {
        nodeIndex: body.nodeIndex,
        hp: Math.max(0, hp),
        felled,
      });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { g, questCompleted, daily, gained, felled, hp: Math.max(0, hp), xp };
    });
  }

  app.post('/act/chop', async (req, res) => {
    const user = req.requireUser();
    const r = await doHit(req, 'oak', 'chop');
    return res.send(
      await reply(user, {
        levelUps: r.g.levelUps,
        levelRewards: r.g.levelRewards,
        questCompleted: r.questCompleted,
        daily: r.daily,
        gained: r.gained,
        felled: r.felled,
        hp: r.hp,
        xp: r.xp,
      }),
    );
  });

  app.post('/act/mine', async (req, res) => {
    const user = req.requireUser();
    const r = await doHit(req, 'rock', 'mine');
    return res.send(
      await reply(user, {
        levelUps: r.g.levelUps,
        levelRewards: r.g.levelRewards,
        questCompleted: r.questCompleted,
        daily: r.daily,
        gained: r.gained,
        felled: r.felled,
        hp: r.hp,
        xp: r.xp,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Sell
  // -------------------------------------------------------------------------
  app.post('/act/sell', async (req, res) => {
    const body = parseBody(SellBody, req);
    const user = await guard(req, 'sell', body.itemKey);

    if (!isItemKey(body.itemKey)) throw badRequest(`Cannot sell "${body.itemKey}".`);
    const itemKey = body.itemKey;

    const result = await prisma.$transaction(async (tx) => {
      // Quantity and price both come from the database and game-config. The
      // request contributes nothing but the item name.
      const have = await itemQty(tx, user.id, itemKey);
      if (have <= 0) {
        throw conflict('INSUFFICIENT_ITEMS', `No ${itemKey} to sell.`, { have, need: 1 });
      }

      // The cellar's multiplier is applied here and nowhere else: deliveries
      // deliberately keep paying $AMBER on the base value, so a coin upgrade
      // can never inflate the token.
      const effects = await effectsFor(tx, user.id);
      const coins = Math.round(sellPrice(itemKey) * have * effects.sell);
      await addItem(tx, user.id, itemKey, -have);

      const g = await grant(tx, user.id, { coins, counters: { soldCount: 1 } });
      await logEvent(tx, user.id, 'act.sell', { itemKey, qty: have, coins });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { g, questCompleted, daily, coins, qty: have };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        coinsGained: result.coins,
        qtySold: result.qty,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Buy seeds
  // -------------------------------------------------------------------------
  app.post('/act/buySeed', async (req, res) => {
    const body = parseBody(BuySeedBody, req);
    const user = await guard(req, 'buySeed', body.cropKey);

    if (!isCropKey(body.cropKey)) throw badRequest(`Unknown crop "${body.cropKey}".`);
    const cropKey: CropKey = body.cropKey;
    const crop = CROPS[cropKey];

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.level < crop.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `${cropKey} seeds unlock at level ${crop.unlockLv}.`, {
          required: crop.unlockLv,
        });
      }

      const cost = crop.seedCost * body.qty;
      if (fresh.coins < cost) {
        throw conflict('INSUFFICIENT_COINS', 'Not enough coins.', {
          have: fresh.coins,
          need: cost,
        });
      }

      await addSeed(tx, user.id, cropKey, body.qty);
      const g = await grant(tx, user.id, {
        coins: -cost,
        counters: { boughtSeeds: body.qty },
      });
      await logEvent(tx, user.id, 'act.buySeed', { cropKey, qty: body.qty, cost });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { g, questCompleted, daily, cost };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        coinsSpent: result.cost,
      }),
    );
  });
}
