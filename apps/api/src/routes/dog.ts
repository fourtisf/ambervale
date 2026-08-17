/**
 * POST /act/dogName — name (or rename) the farm dog.
 *
 * Cosmetic and personal, but stored server-side so she answers to the same
 * name on every device — and shown to visitors, so it passes the same
 * cleaning as the guestbook: control characters stripped, whitespace
 * collapsed, length bounded. She is the only thing in the vale the player
 * gets to name, which is exactly why it matters.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, rateLimited } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowMutation } from '../lib/rateLimit';
import { parseBody } from '../lib/validate';
import { logEvent } from '../services/actions';
import { getFarmState } from '../services/farm';

const NameBody = z.object({ name: z.string() });

export async function dogRoutes(app: FastifyInstance): Promise<void> {
  app.post('/act/dogName', async (req, res) => {
    const user = req.requireUser();
    const body = parseBody(NameBody, req);

    const name = body.name
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (name.length < 2) throw badRequest('A name needs at least two letters.');
    if (name.length > 16)
      throw badRequest('Keep it under 16 characters — she has to hear it across the field.');

    if (!(await allowMutation(user.id))) throw rateLimited();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { dogName: name } });
      await logEvent(tx, user.id, 'act.dogName', { name });
    });

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return res.send({ dogName: name, farm: await getFarmState(prisma, fresh) });
  });
}
