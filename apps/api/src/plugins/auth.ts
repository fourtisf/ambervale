/**
 * Auth plugin: resolves `req.user` from the signed session cookie.
 *
 * Registered globally so every route can call `req.requireUser()`. Routes that
 * do not call it stay public — there is no implicit gate, which keeps it
 * obvious at the call site which endpoints need a player.
 */

import type { User } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { unauthorized } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { SESSION_COOKIE, SESSION_TTL_SEC, resolveSession } from '../lib/session';
import { isProd } from '../env';

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated player, or null on a public/anonymous request. */
    user: User | null;
    sessionId: string | null;
    /** Throws 401 unless a session resolved to a real user. */
    requireUser(): User;
  }
  interface FastifyReply {
    setSessionCookie(sessionId: string): void;
    clearSessionCookie(): void;
  }
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.decorateRequest('requireUser', function (this: FastifyRequest): User {
    if (!this.user) throw unauthorized();
    return this.user;
  });

  app.decorateReply('setSessionCookie', function (this: FastifyReply, sessionId: string) {
    this.setCookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      signed: true,
      // The game is served from a different port in dev and (potentially) a
      // different subdomain in prod, so the cookie must survive cross-site
      // XHR — which requires SameSite=None, which requires Secure.
      sameSite: isProd ? 'none' : 'lax',
      secure: isProd,
      path: '/',
      maxAge: SESSION_TTL_SEC,
    });
  });

  app.decorateReply('clearSessionCookie', function (this: FastifyReply) {
    this.clearCookie(SESSION_COOKIE, { path: '/' });
  });

  app.addHook('onRequest', async (req) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;

    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;

    const userId = await resolveSession(unsigned.value);
    if (!userId) return;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    req.sessionId = unsigned.value;
    req.user = user;
  });
}

export default fp(authPlugin, { name: 'ambervale-auth' });
