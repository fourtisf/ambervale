import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env, isProd } from './env';
import { ApiError } from './lib/errors';
import { captureError } from './lib/sentry';
import { ValidationError, sendValidationError } from './lib/validate';
import { hasPass, inviteRequired } from './lib/invite';
import authPlugin from './plugins/auth';
import metricsPlugin from './plugins/metrics';
import { actionRoutes } from './routes/actions';
import { adminRoutes } from './routes/admin';
import { animalRoutes } from './routes/animals';
import { authRoutes } from './routes/auth';
import { buildRoutes } from './routes/builds';
import { homesteadRoutes } from './routes/homestead';
import { deliveryRoutes } from './routes/deliveries';
import { economyRoutes } from './routes/economy';
import { farmRoutes } from './routes/farm';
import { healthRoutes } from './routes/health';
import { inviteRoutes } from './routes/invite';
import { visitRoutes } from './routes/visit';
import { dogRoutes } from './routes/dog';
import { tutorialRoutes } from './routes/tutorial';
import { walletRoutes } from './routes/wallet';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    /**
     * Which hop to believe when working out who is calling.
     *
     * Not `true`. Trusting every hop means taking the *leftmost*
     * X-Forwarded-For entry, and that entry is written by the caller — so
     * anyone could hand themselves a fresh identity per request just by
     * changing a header, which quietly voids every per-IP limit we have,
     * the invite gate's included.
     *
     * Trusting only the proxy we actually run behind makes the address the
     * one nginx appended, which the caller cannot forge. Configurable
     * because the trusted hop is the loopback address only while nginx and
     * the API share a host; put them in separate containers and it becomes
     * the bridge network instead.
     */
    trustProxy: env.TRUST_PROXY,
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    logger: {
      level: env.LOG_LEVEL,
      // Never let a secret reach the log sink, in any environment.
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      ...(isProd
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }),
    },
  });

  // CORS is locked to an explicit allowlist of origins permitted to hold a
  // session cookie. No wildcards — credentialed CORS forbids them anyway.
  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-device-id', 'x-request-id', 'x-invite-pass'],
    maxAge: 86400,
  });

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: 'onRequest',
  });

  app.setErrorHandler((error: FastifyError, req, reply) => {
    if (error instanceof ValidationError) return sendValidationError(reply, error);

    // Rule rejections carry a stable code and machine-readable details, so the
    // client can render "12s left" rather than parsing a sentence.
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        ...(error.details ?? {}),
      });
    }

    /**
     * A dependency being gone is not a bug in the request.
     *
     * Redis holds sessions, rate limits and locks, so when it stops, most
     * routes fail. Reported as INTERNAL_ERROR that reads as "the game is
     * broken"; as 503 it reads as "the vale is briefly unavailable", which is
     * both true and the difference between a player retrying and a player
     * leaving. The client shows the message, so it has to be worth reading.
     */
    if (/Stream isn't writeable|ECONNREFUSED|Connection is closed/i.test(error.message)) {
      req.log.error({ err: error }, 'dependency unavailable');
      captureError(error, { url: req.url, method: req.method, requestId: req.id });
      return reply.status(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'The vale is catching its breath. Try again in a moment.',
        requestId: req.id,
      });
    }

    const status = error.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err: error }, 'unhandled error');
      captureError(error, { url: req.url, method: req.method, requestId: req.id });
    }

    return reply.status(status).send({
      error: status >= 500 ? 'INTERNAL_ERROR' : (error.code ?? 'REQUEST_ERROR'),
      message: status >= 500 && isProd ? 'Something went wrong.' : error.message,
      requestId: req.id,
    });
  });

  app.setNotFoundHandler((req, reply) =>
    reply
      .status(404)
      .send({ error: 'NOT_FOUND', message: `No route for ${req.method} ${req.url}` }),
  );

  await app.register(metricsPlugin);
  await app.register(authPlugin);

  /**
   * The closed-beta gate.
   *
   * Placed here rather than on each route because the failure mode of the
   * alternative is silent: a new endpoint added later would be public by
   * default and nobody would notice. This way a route has to be named below
   * to be reachable without a pass.
   */
  const OPEN_PREFIXES = ['/health', '/auth/invite', '/admin', '/metrics'];

  app.addHook('onRequest', async (req, reply) => {
    if (!inviteRequired()) return;
    if (req.method === 'OPTIONS') return;
    if (OPEN_PREFIXES.some((p) => req.url.split('?')[0]?.startsWith(p))) return;
    if (hasPass(req)) return;

    return reply
      .status(403)
      .send({ error: 'INVITE_REQUIRED', message: 'This farm is invite-only right now.' });
  });

  await app.register(healthRoutes);
  await app.register(inviteRoutes);
  await app.register(authRoutes);
  await app.register(buildRoutes);
  await app.register(homesteadRoutes);
  await app.register(farmRoutes);
  await app.register(visitRoutes);
  await app.register(dogRoutes);
  await app.register(actionRoutes);
  await app.register(deliveryRoutes);
  await app.register(economyRoutes);
  await app.register(tutorialRoutes);
  await app.register(animalRoutes);
  await app.register(walletRoutes);
  await app.register(adminRoutes);

  return app;
}
