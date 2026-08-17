/**
 * The core loop: plant, harvest, chop, mine, sell, buy seeds.
 *
 * Every rule is enforced here, from numbers imported only from game-config.
 * The client may predict any of this optimistically; it is never believed.
 */

import {
  CROPS,
  CROWS,
  NODES,
  NODE_HIT_COOLDOWN_MS,
  WATERING,
  crowState,
  isCropKey,
  isItemKey,
  nodeDepleteXp,
  nodeSlotAt,
  waterCutMs,
  type CropKey,
  type GoodKey,
  type NodeKey,
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
import {
  CLEARED_PLOT,
  getFarmState,
  plotRuined,
  plotToDto,
  readyAtFor,
  repairNodes,
} from '../services/farm';
import type { QuestCompletion } from '../services/quests';
import { quoteSale, recordSale } from '../services/market';
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

      /**
       * A plot the crows finished with is empty, whatever the row says.
       *
       * The read model hides a ruined crop the moment it is ruined, but the
       * row survives until something clears it — and only `GET /farm` ever
       * did. So between one farm read and the next, a ruined plot showed as
       * bare earth, offered "Plant sunflower", and answered "Something is
       * already growing here" — with no way for the player to see, harvest or
       * clear whatever was supposedly there. The plot was simply lost.
       *
       * Clearing it here rather than refusing is what the player already
       * believes has happened: they are looking at empty ground.
       */
      const effects = await effectsFor(tx, user.id);
      if (plot.cropKey) {
        if (!plotRuined(plot, effects.growth, effects.scarecrowMs)) {
          throw conflict('PLOT_OCCUPIED', 'Something is already growing here.');
        }
        await tx.plot.update({ where: { id: plot.id }, data: { ...CLEARED_PLOT } });
        await logEvent(tx, user.id, 'plot.ruined', {
          plotIndex: plot.index,
          cropKey: plot.cropKey,
          clearedBy: 'plant',
        });
      }

      // Any zone beyond the base field must actually be owned. Checked by
      // zone name rather than a hand-kept list, so a new zone cannot be
      // forgotten here and ship plantable-before-purchase (the east meadow
      // shipped exactly that way).
      if (plot.zone !== 'base') {
        const expansion = await tx.expansion.findUnique({ where: { userId: user.id } });
        const owned =
          expansion !== null &&
          (expansion as unknown as Record<string, unknown>)[plot.zone] === true;
        if (!owned) {
          throw conflict('PLOT_LOCKED', 'That ground is not yours yet.');
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

      // `effects` was read above; the well shortens every grow time, so the
      // plot handed back is dated with the player's own multiplier.
      await addSeed(tx, user.id, cropKey, -1);

      // The very first crop a player ever plants grows in seconds, so the
      // tutorial never asks anyone to watch dirt for half a minute.
      const fast = !fresh.firstPlantDone;
      const updated = await tx.plot.update({
        where: { id: plot.id },
        // A fresh planting starts clean: the previous crop's watering and any
        // leftover guard belong to a crop that no longer exists.
        data: {
          cropKey,
          plantedAt: new Date(),
          fast,
          wateredAt: null,
          waterCutMs: 0,
          guardedUntil: null,
        },
      });

      if (fast) {
        await tx.user.update({ where: { id: user.id }, data: { firstPlantDone: true } });
      }

      const g = await grant(tx, user.id, { counters: { plantedCount: 1 } });
      await logEvent(tx, user.id, 'act.plant', { plotIndex: body.plotIndex, cropKey, fast });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return {
        plot: plotToDto(updated, effects.growth, effects.scarecrowMs),
        g,
        questCompleted,
        daily,
        fast,
      };
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
  // Water — the second verb in the field
  // -------------------------------------------------------------------------
  //
  // Before this the whole game was one gesture: stand next to a thing, press
  // the button. Watering is the same gesture, but it is the first one whose
  // value depends on *when* you do it — the cut is a fraction of the time
  // remaining, so watering the moment you plant is worth the most and watering
  // a nearly-grown crop is worth almost nothing. That is a decision, and the
  // thirty seconds a player used to spend standing still is where it is made.
  app.post('/act/water', async (req, res) => {
    const body = parseBody(PlotBody, req);
    const user = await guard(req, 'water', body.plotIndex);

    const result = await prisma.$transaction(async (tx) => {
      const plot = await tx.plot.findUnique({
        where: { userId_index: { userId: user.id, index: body.plotIndex } },
      });
      if (!plot) throw notFound(`No plot ${body.plotIndex}.`);
      if (!plot.cropKey || !plot.plantedAt) {
        throw conflict('PLOT_EMPTY', 'Nothing is growing here.');
      }
      if (plot.wateredAt) {
        throw conflict('ALREADY_WATERED', 'This one has been watered already.');
      }

      const effects = await effectsFor(tx, user.id);
      const readyAt = readyAtFor(plot, effects.growth);
      const now = Date.now();
      const cut = waterCutMs(now, readyAt ?? now);
      if (cut <= 0) {
        throw conflict('ALREADY_READY', 'This one is ready — pick it instead.');
      }

      const updated = await tx.plot.update({
        where: { id: plot.id },
        // Compare-and-set on wateredAt would be the belt-and-braces version,
        // but the action lock already covers one plot per player and the
        // unique row makes a double-write idempotent in effect.
        data: { wateredAt: new Date(), waterCutMs: plot.waterCutMs + cut },
      });

      const g = await grant(tx, user.id, { xp: WATERING.xp, counters: { wateredCount: 1 } });
      await logEvent(tx, user.id, 'act.water', { plotIndex: body.plotIndex, cutMs: cut });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return {
        g,
        questCompleted,
        daily,
        cut,
        plot: plotToDto(updated, effects.growth, effects.scarecrowMs),
      };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        plot: result.plot,
        cutMs: result.cut,
        xp: WATERING.xp,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Shoo — chasing a crow off
  // -------------------------------------------------------------------------
  app.post('/act/shoo', async (req, res) => {
    const body = parseBody(PlotBody, req);
    const user = await guard(req, 'shoo', body.plotIndex);

    const result = await prisma.$transaction(async (tx) => {
      const plot = await tx.plot.findUnique({
        where: { userId_index: { userId: user.id, index: body.plotIndex } },
      });
      if (!plot) throw notFound(`No plot ${body.plotIndex}.`);
      if (!plot.cropKey || !plot.plantedAt) {
        throw conflict('PLOT_EMPTY', 'Nothing here for a crow to want.');
      }

      const effects = await effectsFor(tx, user.id);
      const now = Date.now();
      const readyAt = readyAtFor(plot, effects.growth);
      const crow = crowState(
        now,
        readyAt,
        plot.guardedUntil?.getTime() ?? null,
        effects.scarecrowMs,
      );
      if (crow.ruined) {
        throw conflict('CROP_RUINED', 'Too late — there is nothing left to save.');
      }

      // Guarding from *now* rather than extending an existing guard: two shoos
      // in a row must not stack into an afternoon of immunity.
      const guardedUntil = new Date(now + CROWS.guardMs);
      const updated = await tx.plot.update({
        where: { id: plot.id },
        data: { guardedUntil },
      });

      // Paid only for chasing a real crow off. Paying for the gesture itself
      // would make an empty field a free XP button.
      // The counter follows the payment: chasing a real crow counts, waving at
      // an empty plot does not, or a daily goal becomes a button to mash.
      const xp = crow.present ? CROWS.shooXp : 0;
      const g = await grant(tx, user.id, crow.present ? { xp, counters: { shooedCount: 1 } } : {});
      await logEvent(tx, user.id, 'act.shoo', {
        plotIndex: body.plotIndex,
        hadCrow: crow.present,
      });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return {
        g,
        questCompleted,
        daily,
        hadCrow: crow.present,
        xp,
        plot: plotToDto(updated, effects.growth, effects.scarecrowMs),
      };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        plot: result.plot,
        hadCrow: result.hadCrow,
        xp: result.xp,
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
      const readyAt = readyAtFor(plot, effects.growth);
      const remainingMs = (readyAt ?? 0) - Date.now();
      if (remainingMs > 0) {
        // The client renders this countdown directly, so it has to be exact.
        throw conflict('NOT_READY', 'Not ready yet.', { remainingMs, readyAt });
      }

      const cropKey = plot.cropKey as CropKey;
      const crop = CROPS[cropKey];

      // A crow does not stop the harvest, it devalues it. Losing the crop
      // outright is what the ruin window is for, and repairPlots has usually
      // already cleared those — this branch is the race where it has not.
      const crow = crowState(
        Date.now(),
        readyAt,
        plot.guardedUntil?.getTime() ?? null,
        effects.scarecrowMs,
      );
      if (crow.ruined) {
        await tx.plot.update({ where: { id: plot.id }, data: { ...CLEARED_PLOT } });
        throw conflict('CROP_RUINED', 'The crows got to this one. Nothing left to harvest.');
      }

      const xp = crow.present ? Math.max(1, Math.round(crop.xp * CROWS.peckedXp)) : crop.xp;

      await addItem(tx, user.id, cropKey, 1);
      await tx.plot.update({
        where: { id: plot.id },
        data: {
          cropKey: null,
          plantedAt: null,
          fast: false,
          wateredAt: null,
          waterCutMs: 0,
          guardedUntil: null,
        },
      });

      const g = await grant(tx, user.id, {
        xp,
        counters: { harvestedCount: 1 },
      });
      await logEvent(tx, user.id, 'act.harvest', {
        plotIndex: body.plotIndex,
        cropKey,
        pecked: crow.present,
      });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { g, questCompleted, daily, cropKey, xp, pecked: crow.present };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        gained: { [result.cropKey]: 1 },
        xp: result.xp,
        pecked: result.pecked,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Chop / mine — same mechanic, different node kind
  // -------------------------------------------------------------------------
  async function doHit(req: FastifyRequest, expectedKinds: readonly NodeKey[], action: string) {
    const body = parseBody(NodeBody, req);
    const user = await guard(req, action, body.nodeIndex);

    const slot = nodeSlotAt(body.nodeIndex);
    if (!slot) throw notFound(`No node ${body.nodeIndex}.`);
    if (!expectedKinds.includes(slot.kind)) {
      throw badRequest(`Node ${body.nodeIndex} is a ${slot.kind}, not a ${expectedKinds[0]}.`);
    }
    const kind = slot.kind;

    // Per-node cooldown on top of the global rate limit: swinging faster than
    // the animation is the cheapest way to farm a node, so it is capped here.
    if (!(await allowNodeHit(user.id, body.nodeIndex, NODE_HIT_COOLDOWN_MS))) {
      throw conflict('TOO_FAST', 'Swinging too fast.');
    }

    const def = NODES[kind];

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
        const primary = kind === 'oak' ? 'wood' : 'stone';
        const bonus = kind === 'oak' ? effects.axeBonus : effects.pickBonus;

        for (const [itemKey, qty] of Object.entries(def.yield) as [GoodKey, number][]) {
          const total = qty + (itemKey === primary ? bonus : 0);
          await addItem(tx, user.id, itemKey, total);
          gained[itemKey] = total;
        }
        // The Amber Deep's bonus roll. Server-side randomness, decided in the
        // same transaction that pays out — a client can neither see it coming
        // nor retry its way into one.
        if (kind === 'vein' && Math.random() < NODES.vein.geodeChance) {
          await addItem(tx, user.id, 'geode', 1);
          gained['geode'] = 1;
        }
        xp = nodeDepleteXp(kind);
      }

      const counters = felled ? { [kind === 'oak' ? 'choppedCount' : 'minedCount']: 1 } : {};

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
    const r = await doHit(req, ['oak'], 'chop');
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
    // One endpoint for both: a vein is mined with the same pick, and the
    // client's optimistic swing plays identically. The server decides yields.
    const r = await doHit(req, ['rock', 'vein'], 'mine');
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

      // Two multipliers, deliberately separate. Saturation is what this
      // player has already done to this good's price; the cellar is what they
      // bought. Deliveries keep paying $AMBER on the base value, so neither
      // one can ever inflate the token.
      const effects = await effectsFor(tx, user.id);
      const quote = await quoteSale(tx, user.id, itemKey, have);
      const coins = Math.round(quote.coins * effects.sell);

      await addItem(tx, user.id, itemKey, -have);
      await recordSale(tx, user.id, itemKey, quote.saturationAfter);

      const g = await grant(tx, user.id, { coins, counters: { soldCount: 1 } });
      await logEvent(tx, user.id, 'act.sell', {
        itemKey,
        qty: have,
        coins,
        marketMul: Number(quote.multiplier.toFixed(3)),
      });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { g, questCompleted, daily, coins, qty: have, multiplier: quote.multiplier };
    });

    return res.send(
      await reply(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        coinsGained: result.coins,
        qtySold: result.qty,
        marketMultiplier: result.multiplier,
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
