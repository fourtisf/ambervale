/**
 * Collecting eggs and milk.
 *
 * Both delete-or-flip a row inside the transaction that grants the item, so a
 * double-tap cannot collect the same egg twice: the second attempt finds
 * nothing to delete and is rejected.
 */

import { ANIMALS, GOODS } from '@ambervale/game-config';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { conflict, notFound, rateLimited } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowMutation, takeActionLock } from '../lib/rateLimit';
import { parseBody } from '../lib/validate';
import { addItem, evaluateProgress, grant, logEvent } from '../services/actions';
import { materialiseAnimalYields, resetCowTimer } from '../services/animals';
import { getFarmState } from '../services/farm';

const EggBody = z.object({ groundItemId: z.string().min(1) });

export async function animalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/act/collectEgg', async (req, res) => {
    const body = parseBody(EggBody, req);
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'collectEgg', body.groundItemId))) {
      throw conflict('TOO_FAST', 'Already picking that up.');
    }

    const result = await prisma.$transaction(async (tx) => {
      // deleteMany scoped to the owner: the delete both authorises and
      // consumes, so a replay finds count === 0 rather than a second egg.
      const removed = await tx.groundItem.deleteMany({
        where: { id: body.groundItemId, userId: user.id, itemKey: 'egg' },
      });
      if (removed.count === 0) throw notFound('That egg is already gone.');

      await addItem(tx, user.id, 'egg', 1);
      const xp = GOODS.egg.xpOnCollect ?? 0;
      const g = await grant(tx, user.id, { xp, counters: { eggCount: 1 } });

      await logEvent(tx, user.id, 'act.collectEgg', { groundItemId: body.groundItemId });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { levelUps: g.levelUps, levelRewards: g.levelRewards, questCompleted, daily, xp };
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return res.send({ ...result, farm: await getFarmState(prisma, fresh) });
  });

  app.post('/act/collectMilk', async (req, res) => {
    const user = req.requireUser();

    if (!(await allowMutation(user.id))) throw rateLimited();
    if (!(await takeActionLock(user.id, 'collectMilk'))) {
      throw conflict('TOO_FAST', 'Already milking.');
    }

    const result = await prisma.$transaction(async (tx) => {
      await materialiseAnimalYields(tx, user.id);

      const cow = await tx.animal.findFirst({ where: { userId: user.id, kind: 'cow' } });
      if (!cow) throw notFound('No cow.');
      if (!cow.ready) {
        throw conflict('NOT_READY', 'She has no milk yet.', {
          remainingMs: Math.max(0, cow.nextYieldAt.getTime() - Date.now()),
          readyAt: cow.nextYieldAt.getTime(),
        });
      }

      await addItem(tx, user.id, 'milk', 1);
      await resetCowTimer(tx, cow.id);

      const xp = GOODS.milk.xpOnCollect ?? 0;
      const g = await grant(tx, user.id, { xp, counters: { milkCount: 1 } });

      await logEvent(tx, user.id, 'act.collectMilk', {
        intervalSec: ANIMALS.cow.milkIntervalSec,
      });
      const { questCompleted, daily } = await evaluateProgress(tx, user.id);

      return { levelUps: g.levelUps, levelRewards: g.levelRewards, questCompleted, daily, xp };
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return res.send({ ...result, farm: await getFarmState(prisma, fresh) });
  });
}
