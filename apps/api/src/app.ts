import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env, isProd } from './env';
import { ApiError } from './lib/errors';
import { captureError } from './lib/sentry';
import { ValidationError, sendValidationError } from './lib/validate';
import authPlugin from './plugins/auth';
import metricsPlugin from './plugins/metrics';
import { actionRoutes } from './routes/actions';
import { animalRoutes } from './routes/animals';
import { authRoutes } from './routes/auth';
import { deliveryRoutes } from './routes/deliveries';
import { farmRoutes } from './routes/farm';
import { healthRoutes } from './routes/health';
import { tutorialRoutes } from './routes/tutorial';
import { walletRoutes } from './routes/wallet';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
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
    allowedHeaders: ['content-type', 'x-device-id', 'x-request-id'],
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

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(farmRoutes);
  await app.register(actionRoutes);
  await app.register(deliveryRoutes);
  await app.register(tutorialRoutes);
  await app.register(animalRoutes);
  await app.register(walletRoutes);

  return app;
}
