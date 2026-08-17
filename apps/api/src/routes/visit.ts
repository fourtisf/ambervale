/**
 * GET /visit/:slug — someone's farm, read-only, plus their guestbook.
 * POST /visit/:slug/sign — leave a note in it.
 *
 * Both require a session like everything else: a visit link is shared between
 * players, not broadcast to the open internet, and keeping the gate in front
 * of it keeps the abuse surface the same as the rest of the API. The text of
 * a note is the only free-form user input in the whole game, so it is trimmed,
 * stripped of control characters, and length-capped here — and rendered as
 * text, never markup, on the way out.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict, notFound, rateLimited } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { allowEvery, allowMutation } from '../lib/rateLimit';
import { parseBody } from '../lib/validate';
import { logEvent } from '../services/actions';
import { GUESTBOOK_CAP, getVisitState } from '../services/visit';

const SignBody = z.object({ text: z.string() });

export async function visitRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string } }>('/visit/:slug', async (req, res) => {
    req.requireUser();

    const owner = await prisma.user.findUnique({ where: { visitSlug: req.params.slug } });
    if (!owner || !owner.bootstrapped) throw notFound('No farm at this address.');

    return res.send(await getVisitState(prisma, owner));
  });

  app.post<{ Params: { slug: string } }>('/visit/:slug/sign', async (req, res) => {
    const user = req.requireUser();
    const body = parseBody(SignBody, req);

    // One pass of cleaning, then judge the result — a note that is 140 chars
    // of newlines should fail the length check, not sneak under it.
    const text = body.text
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < 2) throw badRequest('Write something first.');
    if (text.length > 140) throw badRequest('Keep it under 140 characters.');

    if (!(await allowMutation(user.id))) throw rateLimited();

    // Target checks before the cooldown is consumed: allowEvery is a one-way
    // token take with no refund, and a mistyped slug or an own-book slip
    // should not also burn the writer's minute.
    const owner = await prisma.user.findUnique({ where: { visitSlug: req.params.slug } });
    if (!owner || !owner.bootstrapped) throw notFound('No farm at this address.');
    if (owner.id === user.id) {
      throw conflict('OWN_BOOK', 'It is your book. They write in it, you read it.');
    }

    // A slow verb by design: one note a minute is plenty of neighbourliness.
    if (!(await allowEvery(user.id, 'guestbook', 60_000))) {
      throw conflict('TOO_FAST', 'Give the ink a minute to dry.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.guestbookEntry.create({
        data: { ownerId: owner.id, authorId: user.id, text },
      });
      // Trim the tail past the cap. Under concurrent signs this is a soft
      // bound — two inserts can both count before either trims — which is
      // fine: it exists to stop unbounded growth, not to be exact.
      const stale = await tx.guestbookEntry.findMany({
        where: { ownerId: owner.id },
        orderBy: { createdAt: 'desc' },
        skip: GUESTBOOK_CAP,
        select: { id: true },
      });
      if (stale.length > 0) {
        await tx.guestbookEntry.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      }
      await logEvent(tx, user.id, 'visit.sign', { ownerId: owner.id, chars: text.length });
    });

    return res.send(await getVisitState(prisma, owner));
  });
}
