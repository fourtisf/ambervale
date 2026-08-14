import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  /**
   * Deeper probe for the deploy smoke script — actually touches Postgres and
   * Redis instead of just proving the event loop is alive.
   */
  app.get('/health/deep', async (_req, reply) => {
    const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);

    const postgres = db.status === 'fulfilled';
    const redisOk = cache.status === 'fulfilled';
    const ok = postgres && redisOk;

    return reply.status(ok ? 200 : 503).send({
      ok,
      ts: Date.now(),
      services: { postgres, redis: redisOk },
    });
  });
}
