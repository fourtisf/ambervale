import { PrismaClient } from '@prisma/client';
import { env, isProd } from '../env';

declare global {
  var __ambervalePrisma: PrismaClient | undefined;
}

/**
 * Single client per process. Reused across `tsx watch` reloads in dev so we
 * don't leak a connection pool on every file save.
 */
export const prisma: PrismaClient =
  globalThis.__ambervalePrisma ??
  new PrismaClient({
    // 'query' as an event (not stdout) so the metrics plugin can time it and
    // log only the slow ones, instead of printing every statement.
    log: [
      { level: 'query', emit: 'event' },
      { level: 'warn', emit: 'stdout' },
      { level: 'error', emit: 'stdout' },
    ],
    datasources: { db: { url: env.DATABASE_URL } },
  });

if (!isProd) globalThis.__ambervalePrisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
