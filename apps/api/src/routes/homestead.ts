/**
 * POST /act/homestead — raise the house one tier.
 *
 * The same discipline as /act/build: the request carries nothing but intent,
 * every price comes from game-config inside the transaction that charges it,
 * all costs are checked before any are spent, and the tier compare-and-set is
 * what makes a double-click one purchase instead of two.
 */

import { HOMESTEAD_MAX_TIER, homesteadNext } from '@ambervale/game-config';
import type { FastifyInstance } from 'fastify';
import { conflict, rateLimited } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowMutation, takeActionLock } from '../lib/rateLimit';
import { itemQty, addItem, grant, logEvent } from '../services/actions';
import { amberBalance } from '../services/progression';
import { getFarmState } from '../services/farm';

export async function homesteadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/act/homestead', async (req, res) => {
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'homestead', 'raise'))) {
      throw conflict('TOO_FAST', 'That action is already in flight.');
    }

    let raisedTo = 0;
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });

      const next = homesteadNext(fresh.homesteadTier);
      if (!next) {
        throw conflict('HOMESTEAD_MAX', 'The manor is as grand as the vale allows.', {
          tier: HOMESTEAD_MAX_TIER,
        });
      }
      if (fresh.level < next.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `${next.name} unlocks at level ${next.unlockLv}.`, {
          required: next.unlockLv,
        });
      }

      // Every cost verified before anything is spent — a build that fails
      // halfway must not leave the wood gone and the house unchanged.
      const need = next.cost;
      if (fresh.coins < need.coins) {
        throw conflict('INSUFFICIENT_COINS', 'Not enough coins.', {
          need: need.coins,
          have: fresh.coins,
        });
      }
      if (need.amber) {
        const balance = await amberBalance(tx, user.id);
        if (balance < need.amber) {
          throw conflict('INSUFFICIENT_AMBER', 'Not enough $AMBER.', {
            need: need.amber,
            have: balance,
          });
        }
      }
      for (const item of ['wood', 'stone'] as const) {
        const want = need[item] ?? 0;
        if (want <= 0) continue;
        const have = await itemQty(tx, user.id, item);
        if (have < want) {
          throw conflict('INSUFFICIENT_ITEMS', `Not enough ${item}.`, { need: want, have, item });
        }
      }

      // The compare-and-set: raising FROM the tier we just read means two
      // racing requests cannot both charge for the same storey.
      const claimed = await tx.user.updateMany({
        where: { id: user.id, homesteadTier: fresh.homesteadTier },
        data: {
          homesteadTier: next.tier,
          coins: { decrement: need.coins },
          renown: { increment: next.renown },
        },
      });
      if (claimed.count === 0) {
        throw conflict('TOO_FAST', 'The builders are already at work.');
      }

      for (const item of ['wood', 'stone'] as const) {
        const want = need[item] ?? 0;
        if (want > 0) await addItem(tx, user.id, item, -want);
      }
      if (need.amber) {
        await tx.amberLedger.create({
          data: { userId: user.id, delta: -need.amber, reason: `homestead:${next.tier}` },
        });
      }

      await grant(tx, user.id, { xp: next.renown * 25 });
      await logEvent(tx, user.id, 'act.homestead', {
        tier: next.tier,
        cost: need,
        renown: next.renown,
      });
      raisedTo = next.tier;
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return res.send({
      homesteadTier: raisedTo,
      farm: await getFarmState(prisma, fresh),
    });
  });
}
