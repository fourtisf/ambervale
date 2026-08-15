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
import { bootstrapFarm, counterSnapshot, getFarmState } from '../services/farm';

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
   * Runs the tutorial again from the top, without touching the farm.
   *
   * The step may only move forward, which is right — but it left anyone who
   * tapped Skip with no way back, and "where is the tutorial?" is a fair
   * question to ask of a game that has one. This is the deliberate rewind, and
   * it is safe to expose because the tutorial hands out nothing: every reward
   * it points at comes from the action itself, which the player still has to
   * perform.
   *
   * The counters are snapshotted on the way in. Without that, a player who has
   * already planted a hundred crops would watch the guide race to the last
   * step in about four frames, which is not a tutorial.
   */
  app.post('/tutorial/restart', async (req, reply) => {
    const user = req.requireUser();

    await prisma.user.update({
      where: { id: user.id },
      data: { tutorialStep: 0, tutorialBase: counterSnapshot(user) },
    });
    await prisma.eventLog.create({ data: { userId: user.id, kind: 'tutorial.restart' } });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return reply.send({ ok: true, farm: await getFarmState(prisma, fresh) });
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
          // Counters below go back to zero, so any replay baseline taken
          // against the old ones would put every step permanently out of reach.
          tutorialBase: {},
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
