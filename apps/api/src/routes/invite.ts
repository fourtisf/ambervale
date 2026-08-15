/**
 * The invite gate's two endpoints.
 *
 * Deliberately the only routes that answer before a pass exists — everything
 * else is refused by the hook in app.ts.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { rateLimited, unauthorized } from '../lib/errors';
import {
  attemptsLeft,
  checkCode,
  clearAttempts,
  hasPass,
  inviteRequired,
  passToken,
  takeFailure,
} from '../lib/invite';
import { parseBody } from '../lib/validate';

const CodeBody = z.object({ code: z.string().min(1).max(64) });

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  /** Whether the door is locked, and whether this browser is already through. */
  app.get('/auth/invite', async (req, res) =>
    res.send({
      required: inviteRequired(),
      ok: hasPass(req),
      attemptsLeft: inviteRequired() ? await attemptsLeft(req.ip) : null,
    }),
  );

  app.post('/auth/invite', async (req, res) => {
    const body = parseBody(CodeBody, req);

    if (!inviteRequired()) {
      return res.send({ ok: true, required: false, pass: passToken() });
    }

    // Check the budget before spending it, so someone already locked out is
    // refused without their guess being compared at all.
    if ((await attemptsLeft(req.ip)) <= 0) {
      throw rateLimited('Too many attempts. Try again later.');
    }

    if (!checkCode(body.code)) {
      const remaining = await takeFailure(req.ip);
      throw unauthorized(
        remaining > 0 ? 'That code is not right.' : 'That code is not right. No attempts left.',
      );
    }

    // Right answer: forget the tally so a few typos on the way in do not
    // count against the next person on this connection.
    await clearAttempts(req.ip);
    req.server.log.info({ ip: req.ip }, 'invite accepted');

    // The token goes in the body, not a Set-Cookie: the client holds it in
    // memory for as long as the page lives and no longer. That is the whole
    // point of the change — a browser that keeps re-presenting a pass is a
    // browser that is never asked again.
    return res.send({ ok: true, required: true, pass: passToken() });
  });

  /**
   * Clears the cookie the previous scheme used to set.
   *
   * The pass is a header now, so there is nothing server-side to forget — but
   * browsers that were issued the old month-long cookie are still carrying it,
   * and leaving it there is a stale credential sitting in people's browsers
   * for no reason.
   */
  app.post('/auth/invite/forget', async (_req, res) => {
    res.clearCookie('av_inv', { path: '/' });
    return res.send({ ok: true });
  });
}
