import { buildServer } from './app';
import { env } from './env';
import { disconnectPrisma, prisma } from './lib/prisma';
import { disconnectRedis, pingRedis } from './lib/redis';

async function main(): Promise<void> {
  const app = await buildServer();

  try {
    const pong = await pingRedis();
    app.log.info({ pong }, 'redis connected');
  } catch (err) {
    app.log.fatal({ err }, 'redis unreachable — start it with `pnpm services:up`');
    process.exit(1);
  }

  try {
    await prisma.$connect();
    app.log.info('postgres connected');
  } catch (err) {
    app.log.fatal({ err }, 'postgres unreachable — start it with `pnpm services:up`');
    process.exit(1);
  }

  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(
    { webOrigins: env.WEB_ORIGIN, enableClaim: env.ENABLE_CLAIM },
    'ambervale-api ready',
  );

  let shuttingDown = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      app.log.info({ signal }, 'shutting down');
      void (async () => {
        await app.close();
        await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
        process.exit(0);
      })();
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
