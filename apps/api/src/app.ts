import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { env, isProd } from './env';
import { ValidationError, sendValidationError } from './lib/validate';
import { healthRoutes } from './routes/health';

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

  // CORS is locked to the one browser origin that is allowed to hold a session
  // cookie. No wildcards — credentials mode requires an exact origin anyway.
  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
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

    const status = error.statusCode ?? 500;
    if (status >= 500) req.log.error({ err: error }, 'unhandled error');

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

  await app.register(healthRoutes);

  return app;
}
