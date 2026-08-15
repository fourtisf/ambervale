# AMBERVALE

A server-authoritative farm-to-earn browser game.

**Status: Phases 0–8 complete.** The game is playable end to end: plant,
harvest, chop, mine, sell, buy, deliver for $AMBER, expand the farm, and a
ten-step guided tutorial. The server is authoritative for every rule.

Claims are flagged **off** — $AMBER accrues in an append-only ledger and
nothing leaves the game until a contract exists. See `docs/DECISIONS.md`.

## Layout

```
apps/api             Fastify + Prisma (PostgreSQL) + Redis + zod + pino
apps/web             Next.js 14 (App Router) + Phaser 3, WebGL
packages/game-config  All tuning constants — the only place numbers live
docs/                 Handoff spec, prototype, phase prompts
```

`packages/game-config` is the contract between client and server. Growth times,
prices, XP curves, spawn counts and quest targets are defined there once and
imported by both sides, so they cannot drift.

## Requirements

- Node 20.11+ (22 recommended)
- pnpm 10
- Docker (for PostgreSQL 16 and Redis 7)

## Getting started

```bash
pnpm install

# Env files — the defaults line up with docker-compose.yml
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# Generate a real session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# …and paste it into apps/api/.env as SESSION_SECRET

pnpm services:up          # postgres + redis, waits on healthchecks
pnpm db:generate          # prisma client
pnpm db:migrate           # first migration

pnpm dev                  # api :4021, web :4022
```

Then open:

> **Use `localhost`, not `127.0.0.1`.** The session cookie is `SameSite=Lax`,
> and those two are different sites, so mixing them drops the cookie on every
> request after login. Match the host in `NEXT_PUBLIC_API_URL`.

- <http://localhost:4022> — landing page
- <http://localhost:4022/play> — the game
- <http://localhost:4021/health> — `{ "ok": true, "ts": … }`

`pnpm dev` also runs `tsc --watch` on `game-config`, so constant changes
propagate to both apps without a restart.

## Scripts

| Command              | What it does                                   |
| -------------------- | ---------------------------------------------- |
| `pnpm dev`           | game-config watch + api + web, concurrently    |
| `pnpm build`         | Builds all workspace packages                  |
| `pnpm typecheck`     | `tsc` across every package                     |
| `pnpm lint`          | ESLint (flat config) across the repo           |
| `pnpm format`        | Prettier write                                 |
| `pnpm services:up`   | `docker compose up -d` (postgres, redis)       |
| `pnpm services:down` | Stops the containers                           |
| `pnpm db:migrate`    | `prisma migrate dev` (refuses on production)   |
| `pnpm db:studio`     | Prisma Studio                                  |
| `pnpm db:reset`      | `prisma migrate reset` (refuses on production) |
| `pnpm db:deploy`     | `prisma migrate deploy` — the production one   |
| `pnpm test`          | Abuse and regression suite (needs services up) |
| `pnpm release`       | The whole deploy, on the VPS. See below.       |
| `pnpm verify`        | Proves what is actually live on this machine   |

## Ports

| Service  | Port   |
| -------- | ------ |
| api      | `4021` |
| web      | `4022` |
| postgres | `5432` |
| redis    | `6379` |

The API and web ports match the PM2 app definitions in `ecosystem.config.cjs`.

## Production

One command, on the VPS:

```bash
cd /opt/ambervale && pnpm release
```

`ops/deploy.sh` pulls, installs, migrates, builds into a scratch directory,
swaps it in, reloads pm2 and then runs `ops/verify.sh`, which proves what is
live rather than that a process exists. It is `set -euo pipefail`: the first
failure stops everything after it, and the running site is left untouched.

Not `pnpm deploy` — pnpm has a built-in command by that name that shadows any
script called the same thing, and answers `ERR_PNPM_NOTHING_TO_DEPLOY`.

The steps used to be pasted as four separate lines, and every production
incident so far came out of that: a failed build still reached pm2, which
restarted onto a half-written `.next` and served the site as unstyled text.

`docs/LAUNCH.md` has the environment matrix, nginx, Cloudflare, backups and
the rollback procedure.

## Documentation

| File                | What is in it                                           |
| ------------------- | ------------------------------------------------------- |
| `docs/DECISIONS.md` | Chain choice, claim design, server-authority rules      |
| `docs/LAUNCH.md`    | Env matrix, deploy and rollback, flag state, smoke test |
| `docs/README.md`    | Which source documents are still missing                |

## Testing

```bash
pnpm services:up      # postgres + redis
pnpm dev              # the API must be running
pnpm test             # 27 abuse and regression tests
```

These are integration tests on purpose. Every defence they cover — the rate
limiter, the action locks, the idempotency key, the unique indexes — lives in
the interaction between Fastify, Postgres and Redis. Mocking those would test
the mocks.

## Conventions

- **Every gameplay number lives in `packages/game-config`.** If a magic number
  appears in `apps/api` or `apps/web`, it is a bug.
- The server is authoritative: the client may predict, but the server decides.
- All timestamps crossing the wire are server epoch milliseconds; the client
  computes clock skew once from `serverNow`.
