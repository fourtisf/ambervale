/**
 * PM2 process definitions for the VPS.
 *
 * Do not run these steps by hand — `pnpm release` (ops/deploy.sh) is the
 * deploy, and it ends by verifying what is actually live. Pasted as separate
 * lines, a failed build still reaches pm2; that is how the site once came back
 * as unstyled text.
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
      /**
       * A crash loop has to look different from health, and by default it does
       * not: pm2 leaves a looping process reporting "online" between crashes,
       * and the operator reads that as a successful deploy.
       *
       * `exp_backoff_restart_delay` is the load-bearing setting — it puts the
       * process into "waiting restart" and logs the delay, so `pm2 list` tells
       * the truth. `min_uptime` widens pm2's own unstable-restart window,
       * which is otherwise `min_uptime * max_restarts` = 10 seconds from the
       * last deliberate restart: writing max_restarts: 10 with no min_uptime
       * made the guard *narrower* than pm2's default of 16.
       */
      min_uptime: 20000,
      exp_backoff_restart_delay: 2000,
      max_restarts: 10,
      /**
       * Long enough to finish in-flight requests and close the Postgres and
       * Redis pools. pm2's default is 1.6s, which SIGKILLs a shutdown that has
       * barely started.
       */
      kill_timeout: 10000,
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
      // Same reasoning as the api above.
      min_uptime: 20000,
      exp_backoff_restart_delay: 2000,
      max_restarts: 10,
      kill_timeout: 10000,
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
