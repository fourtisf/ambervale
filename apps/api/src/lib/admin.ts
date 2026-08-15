/**
 * Basic auth for the operator-only endpoints.
 *
 * Deliberately not a session: these are read from a terminal or a browser
 * prompt by whoever runs the box, and giving them the player session
 * machinery would mean an account could ever be escalated into an operator.
 * An empty ADMIN_PASSWORD disables every one of them outright, which is the
 * safe default for a fresh deploy.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';

/**
 * Returns true when the caller is the operator. On failure it has already
 * written the 401 challenge, so the handler must simply return.
 */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
  const header = req.headers.authorization ?? '';
  const expected =
    'Basic ' + Buffer.from(`${env.ADMIN_USER}:${env.ADMIN_PASSWORD}`).toString('base64');

  // Timing here is not worth defending: the secret is in the operator's own
  // env, and the endpoint is off entirely without one.
  if (!env.ADMIN_PASSWORD || header !== expected) {
    void reply
      .status(401)
      .header('www-authenticate', 'Basic realm="ambervale"')
      .send('Unauthorized');
    return false;
  }
  return true;
}
