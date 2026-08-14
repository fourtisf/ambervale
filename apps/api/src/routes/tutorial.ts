/**
 * Tutorial progress and the destructive run reset.
 *
 * Tutorial position lives on the server so it survives a refresh, a new
 * device, or a browser that lost its localStorage. The step may only move
 * forward — or jump to SKIPPED — because a client that could rewind it could
 * replay whatever the tutorial hands out.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { parseBody } from '../lib/validate';
import { bootstrapFarm, getFarmState } from '../services/farm';

/** Sentinel meaning "finished or skipped". */
export const TUTORIAL_DONE = 99;

const StepBody = z.object({
  step: z.number().int().min(0).max(TUTORIAL_DONE),
});

export async function tutorialRoutes(app: FastifyInstance): Promise<void> {
  app.patch('/tutorial/step', async (req, reply) => {
    const body = parseBody(StepBody, req);
    const user = req.requireUser();

    if (body.step !== TUTORIAL_DONE && body.step <= user.tutorialStep) {
      throw badRequest('The tutorial only moves forward.', {
        current: user.tutorialStep,
        requested: body.step,
      });
    }

    // Conditional update, so two racing PATCHes cannot move it backwards.
    await prisma.user.updateMany({
      where:
        body.step === TUTORIAL_DONE
          ? { id: user.id }
          : { id: user.id, tutorialStep: { lt: body.step } },
      data: { tutorialStep: body.step },
    });

    await prisma.eventLog.create({
      data: { userId: user.id, kind: 'tutorial.step', payload: { step: body.step } },
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return reply.send({ tutorialStep: fresh.tutorialStep });
  });

  /**
   * Wipes the player's farm back to a brand-new account.
   *
   * Destructive and irreversible, so it deletes only rows owned by the caller,
   * inside one transaction, and the client is expected to confirm first.
   */
  app.post('/run/reset', async (req, reply) => {
    const user = req.requireUser();

    await prisma.$transaction(async (tx) => {
      const where = { userId: user.id };
      await tx.plot.deleteMany({ where });
      await tx.resourceNode.deleteMany({ where });
      await tx.animal.deleteMany({ where });
      await tx.groundItem.deleteMany({ where });
      await tx.inventoryItem.deleteMany({ where });
      await tx.seedItem.deleteMany({ where });
      await tx.deliverySlot.deleteMany({ where });
      await tx.amberLedger.deleteMany({ where });
      await tx.idempotencyKey.deleteMany({ where });
      await tx.expansion.deleteMany({ where });

      await tx.user.update({
        where: { id: user.id },
        data: {
          level: 1,
          xp: 0,
          coins: 0,
          rep: 0,
          tutorialStep: 0,
          questIndex: 0,
          firstPlantDone: false,
          bootstrapped: false,
          plantedCount: 0,
          harvestedCount: 0,
          choppedCount: 0,
          minedCount: 0,
          soldCount: 0,
          boughtSeeds: 0,
          milkCount: 0,
          eggCount: 0,
          deliveriesDone: 0,
        },
      });

      await tx.eventLog.create({ data: { userId: user.id, kind: 'run.reset' } });
    });

    await bootstrapFarm(user.id);

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return reply.send({ ok: true, farm: await getFarmState(prisma, fresh) });
  });
}
