import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

/**
 * Which commit this process is running.
 *
 * "online" in pm2 means a process exists, not that it is the process you just
 * deployed — an old one holding the port answers /health perfectly well, and
 * has. ops/deploy.sh writes dist/build-id.json after a successful build, so
 * ops/verify.sh can compare this against the checked-out HEAD and say which.
 *
 * Read once at boot and never again: it describes the build, and the build
 * cannot change underneath a running process. Absent under `tsx` in
 * development, where there is no build — hence null rather than a throw.
 */
const REV: string | null = (() => {
  try {
    // dist/routes/health.js → dist/build-id.json
    const raw = readFileSync(join(__dirname, '..', 'build-id.json'), 'utf8');
    const parsed = JSON.parse(raw) as { rev?: unknown };
    return typeof parsed.rev === 'string' ? parsed.rev : null;
  } catch {
    return null;
  }
})();

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => ({ ok: true, ts: Date.now(), rev: REV }));

  /**
   * Deeper probe for the deploy smoke script — actually touches Postgres and
   * Redis instead of just proving the event loop is alive.
   */
  app.get('/health/deep', async (_req, reply) => {
    // Each probe is time-boxed. A client that cannot connect does not answer
    // quickly — ioredis took ten seconds to give up — so without this the
    // probe outlives the timeout of whatever asked, and the one endpoint that
    // knows which service is down is the one that cannot say so.
    const within = <T>(work: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        work,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms).unref(),
        ),
      ]);

    const [db, cache] = await Promise.allSettled([
      within(prisma.$queryRaw`SELECT 1`, 2000),
      within(redis.ping(), 2000),
    ]);

    const postgres = db.status === 'fulfilled';
    const redisOk = cache.status === 'fulfilled';
    const ok = postgres && redisOk;

    return reply.status(ok ? 200 : 503).send({
      ok,
      ts: Date.now(),
      rev: REV,
      services: { postgres, redis: redisOk },
    });
  });
}
