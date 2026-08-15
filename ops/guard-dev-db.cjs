/**
 * Refuses to run a development database command against production.
 *
 * `prisma migrate dev` rewrites migration history and will offer to reset the
 * database; `prisma migrate reset` drops it outright. Both are correct on a
 * laptop and catastrophic on the VPS, and the only thing separating them was
 * which directory the operator happened to be standing in.
 *
 * The production path is `db:deploy`, which only applies migrations that
 * already exist and never drops anything.
 */

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Reads DATABASE_URL the way Prisma does: process env first, then .env. */
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = join(__dirname, '..', 'apps', 'api', '.env');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith('DATABASE_URL='));
  return line
    ? line
        .slice(line.indexOf('=') + 1)
        .trim()
        .replace(/^["']|["']$/g, '')
    : '';
}

const url = databaseUrl();
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
})();

const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
const production = process.env.NODE_ENV === 'production';

// A production NODE_ENV is decisive on its own. Otherwise the tell is the
// database being somewhere other than this machine — the VPS runs Postgres on
// localhost, so that alone is not enough, which is why NODE_ENV is checked
// first and the deploy sets it.
if (production || !local) {
  console.error(
    `\n\x1b[31mRefusing to run a development database command.\x1b[0m\n\n` +
      `  NODE_ENV : ${process.env.NODE_ENV || '(unset)'}\n` +
      `  database : ${host || '(unreadable)'}\n\n` +
      `  migrate dev rewrites migration history and may reset the database;\n` +
      `  migrate reset drops it. Neither belongs on a deploy box.\n\n` +
      `  In production, apply migrations with:  pnpm db:deploy\n\n` +
      `  If you are certain this is a development database, set\n` +
      `  AMBERVALE_ALLOW_DEV_DB=1 for this one command.\n`,
  );
  if (process.env.AMBERVALE_ALLOW_DEV_DB !== '1') process.exit(1);
  console.error('  AMBERVALE_ALLOW_DEV_DB=1 — proceeding anyway.\n');
}
