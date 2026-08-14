/**
 * GET /farm — the whole world state in one payload.
 *
 * Also the place where lazily-repaired state is materialised: node respawns
 * (Phase 3), egg laying (Phase 6) and delivery refills (Phase 4) are all
 * computed from timestamps when someone looks, rather than by a scheduler.
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { materialiseAnimalYields } from '../services/animals';
import { ensureDeliverySlots } from '../services/deliveries';
import { bootstrapFarm, getFarmState, repairNodes } from '../services/farm';

export async function farmRoutes(app: FastifyInstance): Promise<void> {
  app.get('/farm', async (req, reply) => {
    const user = req.requireUser();

    // A session can outlive a failed bootstrap; make sure the farm exists.
    if (!user.bootstrapped) await bootstrapFarm(user.id);

    // Lazy repair: node respawns and delivery refills are materialised when
    // someone looks, so no scheduler is needed for a farm left alone for days.
    await prisma.$transaction(async (tx) => {
      await repairNodes(tx, user.id);
      await materialiseAnimalYields(tx, user.id);
      await ensureDeliverySlots(tx, user.id);
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return reply.send(await getFarmState(prisma, fresh));
  });
}
