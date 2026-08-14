# AMBERVALE

A server-authoritative farm-to-earn browser game.

**Status: Phase 0 — scaffold only.** No gameplay, no auth, no persistence
beyond an empty schema. `/play` renders an empty Phaser scene with an FPS
counter. Everything else arrives phase by phase (see `docs/`).

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

| Command              | What it does                                 |
| -------------------- | -------------------------------------------- |
| `pnpm dev`           | game-config watch + api + web, concurrently  |
| `pnpm build`         | Builds all workspace packages                |
| `pnpm typecheck`     | `tsc` across every package                   |
| `pnpm lint`          | ESLint (flat config) across the repo         |
| `pnpm format`        | Prettier write                               |
| `pnpm services:up`   | `docker compose up -d` (postgres, redis)     |
| `pnpm services:down` | Stops the containers                         |
| `pnpm db:migrate`    | `prisma migrate dev`                         |
| `pnpm db:studio`     | Prisma Studio                                |
| `pnpm db:reset`      | `prisma migrate reset` (destroys local data) |

## Ports

| Service  | Port   |
| -------- | ------ |
| api      | `4021` |
| web      | `4022` |
| postgres | `5432` |
| redis    | `6379` |

The API and web ports match the PM2 app definitions in `ecosystem.config.cjs`.

## Production

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @ambervale/api db:deploy
pm2 startOrReload ecosystem.config.cjs
```

Nginx, Cloudflare, backups and the launch checklist are Phase 8.

## Conventions

- **Every gameplay number lives in `packages/game-config`.** If a magic number
  appears in `apps/api` or `apps/web`, it is a bug.
- The server is authoritative: the client may predict, but the server decides.
- All timestamps crossing the wire are server epoch milliseconds; the client
  computes clock skew once from `serverNow`.
