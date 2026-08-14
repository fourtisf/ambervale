/**
 * Counters and a slow-query log.
 *
 * Deliberately dependency-free: a handful of in-process counters exposed in
 * Prometheus text format. Anything that needs real histograms or cross-process
 * aggregation should scrape this into a proper collector rather than growing
 * this file.
 *
 * Counters reset on restart. That is fine for rate-style alerting, which is
 * what these are for.
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env';
import { prisma } from '../lib/prisma';

/** Queries slower than this are logged with their duration. */
const SLOW_QUERY_MS = 250;

interface Counters {
  requests: number;
  responses: Record<string, number>;
  errors: number;
  slowQueries: number;
  rateLimited: number;
  /** Total response time, for a crude mean. */
  durationMsTotal: number;
}

const counters: Counters = {
  requests: 0,
  responses: {},
  errors: 0,
  slowQueries: 0,
  rateLimited: 0,
  durationMsTotal: 0,
};

export const bumpRateLimited = (): void => {
  counters.rateLimited += 1;
};

function render(): string {
  const lines: string[] = [
    '# HELP ambervale_requests_total Requests received.',
    '# TYPE ambervale_requests_total counter',
    `ambervale_requests_total ${counters.requests}`,
    '# HELP ambervale_responses_total Responses by status class.',
    '# TYPE ambervale_responses_total counter',
  ];

  for (const [status, count] of Object.entries(counters.responses)) {
    lines.push(`ambervale_responses_total{status="${status}"} ${count}`);
  }

  lines.push(
    '# HELP ambervale_errors_total Responses with status >= 500.',
    '# TYPE ambervale_errors_total counter',
    `ambervale_errors_total ${counters.errors}`,
    '# HELP ambervale_rate_limited_total Requests rejected by the sliding window.',
    '# TYPE ambervale_rate_limited_total counter',
    `ambervale_rate_limited_total ${counters.rateLimited}`,
    '# HELP ambervale_slow_queries_total Database queries over the slow threshold.',
    '# TYPE ambervale_slow_queries_total counter',
    `ambervale_slow_queries_total ${counters.slowQueries}`,
    '# HELP ambervale_response_time_ms_total Summed response time.',
    '# TYPE ambervale_response_time_ms_total counter',
    `ambervale_response_time_ms_total ${Math.round(counters.durationMsTotal)}`,
    '# HELP ambervale_uptime_seconds Process uptime.',
    '# TYPE ambervale_uptime_seconds gauge',
    `ambervale_uptime_seconds ${Math.round(process.uptime())}`,
  );

  return lines.join('\n') + '\n';
}

async function metricsPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async () => {
    counters.requests += 1;
  });

  app.addHook('onResponse', async (req, reply) => {
    const status = reply.statusCode;
    const bucket = `${Math.floor(status / 100)}xx`;
    counters.responses[bucket] = (counters.responses[bucket] ?? 0) + 1;
    counters.durationMsTotal += reply.elapsedTime;

    if (status >= 500) counters.errors += 1;
    if (status === 429) counters.rateLimited += 1;

    // Slow requests are worth a line each; fast ones are noise.
    if (reply.elapsedTime > 1000) {
      req.log.warn(
        { url: req.url, method: req.method, ms: Math.round(reply.elapsedTime) },
        'slow request',
      );
    }
  });

  // Prisma query timing. `event` logging has to be opted into per client, so
  // this is best-effort: if the client was built without it, we skip quietly.
  try {
    const client = prisma as unknown as {
      $on?: (event: string, cb: (e: { duration: number; query: string }) => void) => void;
    };
    client.$on?.('query', (e) => {
      if (e.duration < SLOW_QUERY_MS) return;
      counters.slowQueries += 1;
      app.log.warn({ ms: e.duration, query: e.query.slice(0, 300) }, 'slow query');
    });
  } catch {
    app.log.debug('prisma query events unavailable; slow-query log disabled');
  }

  app.get('/metrics', async (req, reply) => {
    // Same basic auth as the admin export — metrics leak traffic shape.
    const header = req.headers.authorization ?? '';
    const expected =
      'Basic ' + Buffer.from(`${env.ADMIN_USER}:${env.ADMIN_PASSWORD}`).toString('base64');

    if (!env.ADMIN_PASSWORD || header !== expected) {
      return reply
        .status(401)
        .header('www-authenticate', 'Basic realm="ambervale"')
        .send('Unauthorized');
    }

    return reply.header('content-type', 'text/plain; version=0.0.4').send(render());
  });
}

export default fp(metricsPlugin, { name: 'ambervale-metrics' });
