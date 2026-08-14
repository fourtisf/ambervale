/**
 * PM2 process definitions for the VPS.
 *
 * Deploy order: `pnpm install --frozen-lockfile && pnpm build && pnpm --filter
 * @ambervale/api db:deploy`, then `pm2 startOrReload ecosystem.config.cjs`.
 */
module.exports = {
  apps: [
    {
      name: 'ambervale-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 4021,
      },
      out_file: './logs/api.out.log',
      error_file: './logs/api.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'ambervale-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 4022',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '768M',
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 4022,
      },
      out_file: './logs/web.out.log',
      error_file: './logs/web.err.log',
      merge_logs: true,
      time: true,
    },
  ],
};
