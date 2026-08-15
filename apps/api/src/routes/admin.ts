/**
 * Operator-only reads.
 *
 * Separate from every player route because the audience is different: these
 * answer "is the game working" rather than "what is my farm doing", and they
 * are the only endpoints that see across accounts.
 */

import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../lib/admin';
import { prisma } from '../lib/prisma';
import { readStats, renderStatsPage } from '../services/stats';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  /** The page an operator actually looks at. */
  app.get('/admin/stats', async (req, res) => {
    if (!requireAdmin(req, res)) return res;

    const days = Number((req.query as { days?: string }).days ?? 14);
    const stats = await readStats(
      prisma,
      Number.isFinite(days) ? Math.min(90, Math.max(1, days)) : 14,
    );

    return res.header('content-type', 'text/html; charset=utf-8').send(renderStatsPage(stats));
  });

  /** The same numbers, for anything that wants to graph them later. */
  app.get('/admin/stats.json', async (req, res) => {
    if (!requireAdmin(req, res)) return res;

    const days = Number((req.query as { days?: string }).days ?? 14);
    return res.send(
      await readStats(prisma, Number.isFinite(days) ? Math.min(90, Math.max(1, days)) : 14),
    );
  });
}
