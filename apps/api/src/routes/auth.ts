/**
 * Guest-first authentication.
 *
 * A player never signs up: the first call to /auth/guest mints an account
 * bound to the browser's deviceId. Email can be attached later without a
 * schema change (User.email is nullable and unique).
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prismaErrors';
import { createSession, destroySession } from '../lib/session';
import { parseBody } from '../lib/validate';
import { bootstrapFarm, getFarmState } from '../services/farm';

const GuestBody = z.object({
  /** Client-generated uuid, persisted in localStorage. */
  deviceId: z.string().uuid().optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/guest', async (req, reply) => {
    const body = parseBody(GuestBody, req);
    const headerDevice = req.headers['x-device-id'];
    const deviceId = body.deviceId ?? (typeof headerDevice === 'string' ? headerDevice : undefined);

    if (!deviceId) {
      throw badRequest('A deviceId is required, in the body or the x-device-id header.');
    }

    // One account per device. A player who cleared their cookies lands back on
    // the same farm; a genuinely new browser gets a new one.
    let user = await prisma.user.findUnique({ where: { deviceId } });
    let created = false;

    if (!user) {
      try {
        user = await prisma.user.create({ data: { deviceId } });
        created = true;
      } catch (err) {
        // Two calls can race here — React Strict Mode alone fires the effect
        // twice — and the unique index on deviceId is what keeps one account
        // per device. The loser reads back the winner's row rather than 500ing.
        if (!isUniqueViolation(err)) throw err;
        user = await prisma.user.findUniqueOrThrow({ where: { deviceId } });
      }
    }

    await bootstrapFarm(user.id);

    const sessionId = await createSession(user.id);
    reply.setSessionCookie(sessionId);

    await prisma.eventLog.create({
      data: { userId: user.id, kind: created ? 'auth.guest.create' : 'auth.guest.resume' },
    });

    // Re-read: bootstrap has just written coins, level and the starting seeds.
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return reply.send({ created, farm: await getFarmState(prisma, fresh) });
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.sessionId) await destroySession(req.sessionId);
    reply.clearSessionCookie();
    return reply.send({ ok: true });
  });

  app.get('/auth/me', async (req, reply) => {
    const user = req.requireUser();
    return reply.send({ id: user.id, level: user.level, createdAt: user.createdAt.getTime() });
  });
}
