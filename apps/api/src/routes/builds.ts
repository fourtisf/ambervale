/**
 * Building things that stay built.
 *
 * The only sink past the third hour was a title beside your name, so coins
 * stopped meaning anything the moment the upgrade tree was finished. These
 * cost far more than upgrades do and grant nothing but renown and a shape in
 * the world — which is the point: a farm should show what has been done to it.
 *
 * Everything is checked here. The request names a key and nothing else; the
 * price, the level gate and the renown all come from game-config, and the
 * unique index on (userId, key) is what makes a double-click harmless.
 */

import { BUILDS, isBuildKey } from '@ambervale/game-config';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict, rateLimited } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowMutation, takeActionLock } from '../lib/rateLimit';
import { parseBody } from '../lib/validate';
import { itemQty, addItem, grant, logEvent } from '../services/actions';
import { amberBalance } from '../services/progression';
import { getFarmState } from '../services/farm';

const BuildBody = z.object({ key: z.string().min(1) });

export async function buildRoutes(app: FastifyInstance): Promise<void> {
  app.post('/act/build', async (req, res) => {
    const body = parseBody(BuildBody, req);
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'build', body.key))) {
      throw conflict('TOO_FAST', 'That action is already in flight.');
    }

    if (!isBuildKey(body.key)) throw badRequest(`Unknown build "${body.key}".`);
    const key = body.key;
    const def = BUILDS[key];

    await prisma.$transaction(async (tx) => {
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });

      const already = await tx.build.findUnique({
        where: { userId_key: { userId: user.id, key } },
      });
      if (already) throw conflict('ALREADY_BUILT', `${def.name} is already standing.`);

      if (fresh.level < def.unlockLv) {
        throw conflict('LEVEL_TOO_LOW', `${def.name} unlocks at level ${def.unlockLv}.`, {
          required: def.unlockLv,
        });
      }

      // Every cost is checked before anything is spent, so a build that fails
      // halfway cannot leave the wood gone and the landmark unbuilt.
      const need = def.cost;
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

      // Spend.
      await tx.user.update({
        where: { id: user.id },
        data: { coins: { decrement: need.coins }, renown: { increment: def.renown } },
      });
      for (const item of ['wood', 'stone'] as const) {
        const want = need[item] ?? 0;
        if (want > 0) await addItem(tx, user.id, item, -want);
      }
      if (need.amber) {
        await tx.amberLedger.create({
          data: { userId: user.id, delta: -need.amber, reason: `build:${key}` },
        });
      }

      await tx.build.create({ data: { userId: user.id, key } });
      await grant(tx, user.id, { xp: def.renown * 25 });
      await logEvent(tx, user.id, 'act.build', { key, cost: need, renown: def.renown });
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return res.send({
      built: key,
      renown: def.renown,
      farm: await getFarmState(prisma, fresh),
    });
  });
}
