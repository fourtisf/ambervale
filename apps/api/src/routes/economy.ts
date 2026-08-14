/**
 * POST /act/upgrade, /act/fish, /act/craft.
 *
 * These three exist to give the game somewhere for value to go and something
 * to do with the buildings that were previously scenery. The same rule as
 * everywhere else applies: the request names a key, and every price, yield and
 * probability is decided here from game-config and the database.
 */

import {
  FISHING,
  GOODS,
  PATRONAGE,
  RECIPES,
  UPGRADES,
  isRecipeKey,
  isUpgradeKey,
  nextTierCost,
  rollFish,
  titleFor,
  type ItemKey,
  type RecipeKey,
  type UpgradeKey,
} from '@ambervale/game-config';
import type { FastifyInstance } from 'fastify';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { badRequest, conflict, rateLimited } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowEvery, allowMutation, takeActionLock } from '../lib/rateLimit';
import { parseBody } from '../lib/validate';
import { addItem, addSeed, evaluateProgress, grant, itemQty, logEvent } from '../services/actions';
import { getFarmState } from '../services/farm';
import { readLeaderboard, standingFor } from '../services/leaderboard';
import { amberBalance } from '../services/progression';
import { purchaseTier, readUpgrades, shortfallFor, tierOf } from '../services/upgrades';

async function withFarm(user: User, extra: Record<string, unknown>) {
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  return { ...extra, farm: await getFarmState(prisma, fresh) };
}

const UpgradeBody = z.object({ key: z.string().min(1) });
const CraftBody = z.object({
  recipe: z.string().min(1),
  // Batch crafting, capped so one request can never be an unbounded loop.
  times: z.number().int().min(1).max(10).optional(),
});

export async function economyRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Buy the next tier of an upgrade
  // -------------------------------------------------------------------------
  app.post('/act/upgrade', async (req, res) => {
    const body = parseBody(UpgradeBody, req);
    const user = req.requireUser();

    if (!isUpgradeKey(body.key)) throw badRequest(`Unknown upgrade "${body.key}".`);
    const key: UpgradeKey = body.key;

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'upgrade', key))) {
      throw conflict('TOO_FAST', 'That purchase is already in flight.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const def = UPGRADES[key];

      if (fresh.level < def.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `${def.name} unlocks at level ${def.unlockLv}.`, {
          required: def.unlockLv,
        });
      }

      const tiers = await readUpgrades(tx, user.id);
      const tier = tierOf(tiers, key);
      const cost = nextTierCost(key, tier);
      if (!cost) throw conflict('MAX_TIER', `${def.name} is already fully upgraded.`);

      const missing = await shortfallFor(tx, user.id, cost);
      if (Object.keys(missing).length > 0) {
        throw conflict('INSUFFICIENT_ITEMS', `Not enough to buy ${def.name} yet.`, { missing });
      }

      const purchase = await purchaseTier(tx, user.id, key, tier, cost);

      await logEvent(tx, user.id, 'act.upgrade', {
        key,
        tier: purchase.tier,
        cost: JSON.stringify(cost),
      });
      const progress = await evaluateProgress(tx, user.id);

      return { purchase, ...progress };
    });

    return res.send(
      await withFarm(user, {
        upgrade: result.purchase,
        levelUps: [],
        questCompleted: result.questCompleted,
        daily: result.daily,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Fish from the dock
  // -------------------------------------------------------------------------
  app.post('/act/fish', async (req, res) => {
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();

    // The cast itself is paced, separately from the global mutation budget:
    // fishing is meant to be a slow verb, not something to spam.
    if (!(await allowEvery(user.id, 'fish', FISHING.cooldownMs))) {
      throw conflict('TOO_FAST', 'Give the line a moment.', {
        remainingMs: FISHING.cooldownMs,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const tiers = await readUpgrades(tx, user.id);
      if (tierOf(tiers, FISHING.requires) < 1) {
        throw conflict('NEEDS_UPGRADE', 'You need a fishing rod first.', {
          upgrade: FISHING.requires,
        });
      }

      // Rolled server-side. A client-supplied roll would be the single easiest
      // thing in this codebase to cheat.
      const outcome = rollFish(Math.random());

      const gained: Record<string, number> = { fish: outcome.fish };
      await addItem(tx, user.id, 'fish', outcome.fish);
      if (outcome.seed) await addSeed(tx, user.id, outcome.seed, 1);

      const g = await grant(tx, user.id, {
        xp: FISHING.xp,
        counters: { fishCount: outcome.fish },
      });

      await logEvent(tx, user.id, 'act.fish', { fish: outcome.fish, seed: outcome.seed ?? null });
      const progress = await evaluateProgress(tx, user.id);

      return { g, gained, outcome, ...progress };
    });

    return res.send(
      await withFarm(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        gained: result.gained,
        seedGained: result.outcome.seed ?? null,
        catchLabel: result.outcome.label,
        xp: FISHING.xp,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Craft at the windmill
  // -------------------------------------------------------------------------
  app.post('/act/craft', async (req, res) => {
    const body = parseBody(CraftBody, req);
    const user = req.requireUser();

    if (!isRecipeKey(body.recipe)) throw badRequest(`Unknown recipe "${body.recipe}".`);
    const recipeKey: RecipeKey = body.recipe;
    const times = body.times ?? 1;

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'craft', recipeKey))) {
      throw conflict('TOO_FAST', 'The mill is already turning.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const tiers = await readUpgrades(tx, user.id);
      if (tierOf(tiers, 'mill') < 1) {
        throw conflict('NEEDS_UPGRADE', 'The windmill needs a millstone first.', {
          upgrade: 'mill',
        });
      }

      const recipe = RECIPES[recipeKey];
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.level < recipe.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `${recipeKey} unlocks at level ${recipe.unlockLv}.`, {
          required: recipe.unlockLv,
        });
      }

      // Check the whole batch before consuming any of it, so a partly-affordable
      // request fails cleanly instead of half-crafting.
      const missing: Record<string, { have: number; need: number }> = {};
      for (const [item, qty] of Object.entries(recipe.inputs) as [ItemKey, number][]) {
        const have = await itemQty(tx, user.id, item);
        const need = qty * times;
        if (have < need) missing[item] = { have, need };
      }
      if (Object.keys(missing).length > 0) {
        throw conflict('INSUFFICIENT_ITEMS', 'Not enough to mill that.', { missing });
      }

      for (const [item, qty] of Object.entries(recipe.inputs) as [ItemKey, number][]) {
        await addItem(tx, user.id, item, -qty * times);
      }
      await addItem(tx, user.id, recipe.output, times);

      const g = await grant(tx, user.id, {
        xp: recipe.xp * times,
        counters: { craftCount: times },
      });

      await logEvent(tx, user.id, 'act.craft', { recipe: recipeKey, times });
      const progress = await evaluateProgress(tx, user.id);

      return { g, times, output: recipe.output, xp: recipe.xp * times, ...progress };
    });

    return res.send(
      await withFarm(user, {
        levelUps: result.g.levelUps,
        levelRewards: result.g.levelRewards,
        questCompleted: result.questCompleted,
        daily: result.daily,
        gained: { [result.output]: result.times },
        xp: result.xp,
      }),
    );
  });

  // -------------------------------------------------------------------------
  // The Vale Fund — buy a point of renown
  // -------------------------------------------------------------------------
  app.post('/act/patronage', async (req, res) => {
    const body = parseBody(
      z.object({ currency: z.union([z.literal('coins'), z.literal('amber')]) }),
      req,
    );
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'patronage'))) {
      throw conflict('TOO_FAST', 'That gift is already in flight.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (fresh.level < PATRONAGE.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `The Vale Fund opens at level ${PATRONAGE.unlockLv}.`, {
          required: PATRONAGE.unlockLv,
        });
      }

      // Priced from the renown already owned, read inside this transaction —
      // two concurrent gifts therefore cannot both buy the cheap next point.
      const owned = fresh.renown;

      if (body.currency === 'coins') {
        const cost = PATRONAGE.coinCost(owned);
        if (fresh.coins < cost) {
          throw conflict('INSUFFICIENT_COINS', 'Not enough coins.', {
            have: fresh.coins,
            need: cost,
          });
        }
        const moved = await tx.user.updateMany({
          where: { id: user.id, renown: owned },
          data: { coins: { decrement: cost }, renown: { increment: 1 } },
        });
        if (moved.count === 0) throw conflict('TOO_FAST', 'That gift is already in flight.');
        await logEvent(tx, user.id, 'act.patronage', {
          currency: 'coins',
          cost,
          renown: owned + 1,
        });
      } else {
        const cost = PATRONAGE.amberCost(owned);
        const balance = await amberBalance(tx, user.id);
        if (balance < cost) {
          throw conflict('INSUFFICIENT_ITEMS', 'Not enough $AMBER.', {
            missing: { amber: { have: balance, need: cost } },
          });
        }
        const moved = await tx.user.updateMany({
          where: { id: user.id, renown: owned },
          data: { renown: { increment: 1 } },
        });
        if (moved.count === 0) throw conflict('TOO_FAST', 'That gift is already in flight.');
        await tx.amberLedger.create({
          data: { userId: user.id, delta: -cost, reason: 'patronage', refId: String(owned + 1) },
        });
        await logEvent(tx, user.id, 'act.patronage', {
          currency: 'amber',
          cost,
          renown: owned + 1,
        });
      }

      const progress = await evaluateProgress(tx, user.id);
      return { renown: owned + 1, ...progress };
    });

    return res.send(
      await withFarm(user, {
        levelUps: [],
        questCompleted: result.questCompleted,
        daily: result.daily,
        renown: result.renown,
        title: titleFor(result.renown),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Leaderboard
  // -------------------------------------------------------------------------
  app.get('/leaderboard', async (req, res) => {
    const user = req.requireUser();
    const [board, you] = await Promise.all([readLeaderboard(prisma), standingFor(prisma, user.id)]);

    // Mark the asking player's own rows so the UI can highlight them.
    for (const list of [board.renown, board.level, board.streak]) {
      for (const row of list) if (row.handle === you.handle) row.you = true;
    }

    return res.send({ ...board, you });
  });

  // A tiny read used by the crafting sheet to price the margin without the
  // client having to know how goods are valued.
  app.get('/economy/prices', async (_req, res) =>
    res.send({
      goods: Object.fromEntries(Object.entries(GOODS).map(([k, v]) => [k, v.sell])),
    }),
  );
}
