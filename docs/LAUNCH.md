# Launch checklist

Everything needed to put AMBERVALE on a VPS and to take it back off again.

## 1. Environment matrix

| Variable                        | api | web | Notes                                                                                  |
| ------------------------------- | :-: | :-: | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | ✅  | ✅  | `production` on the VPS. Flips the cookie to `Secure; SameSite=None`.                  |
| `DATABASE_URL`                  | ✅  |     | Postgres 16. Confirm the port with `pg_lsclusters` first — see below.                  |
| `REDIS_URL`                     | ✅  |     | Sessions, rate limits, action locks.                                                   |
| `WEB_ORIGIN`                    | ✅  |     | **Comma-separated allowlist.** Must include every host players use.                    |
| `SESSION_SECRET`                | ✅  |     | 32+ bytes. `openssl rand -hex 32`. Rotating it logs everyone out.                      |
| `ENABLE_CLAIM`                  | ✅  |     | **`false` at launch.** See §5.                                                         |
| `INVITE_CODE`                   | ✅  |     | Closed beta. Defaults to a value, so a deploy that forgets it stays shut. See §1a.     |
| `TRUST_PROXY`                   | ✅  |     | Which hops may be believed about a caller's IP. `loopback` for nginx on the same host. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | ✅  |     | Guards `/metrics` and `/admin/claim-intents`. Empty password disables both.            |
| `SENTRY_DSN`                    | ✅  | ✅  | Empty disables error reporting entirely.                                               |
| `NEXT_PUBLIC_API_URL`           |     | ✅  | Must be same-site with the page host — see the warning below.                          |
| `NEXT_PUBLIC_CHAIN_*`           |     | ✅  | Chain ids and RPCs. See `docs/DECISIONS.md`.                                           |

> **Cookie footgun.** The session cookie is `SameSite=Lax` in development.
> `localhost` and `127.0.0.1` are _different sites_, so mixing them drops the
> cookie on every request after login. In production `NODE_ENV=production`
> switches the cookie to `Secure; SameSite=None`, which works across
> subdomains — but the origin must still appear in `WEB_ORIGIN`.

## 1a. The invite gate

The game is closed. `INVITE_CODE` is checked by the API, not by the browser —
every endpoint except `/health`, `/auth/invite`, `/admin` and `/metrics`
answers `403 INVITE_REQUIRED` without a signed pass cookie. Skipping the
landing page and calling the API by hand gets the same refusal, which is the
only arrangement worth shipping: the web bundle is public, so a screen that
only exists in the browser is decoration.

Operating it:

| To do this                | Do                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Change the code           | Edit `INVITE_CODE`, restart the API. Every pass issued under the old code stops working, because the pass carries the code's fingerprint. |
| Open the game to everyone | Set `INVITE_CODE=` (empty), restart. This is the _only_ way to open it; an unset variable stays closed on purpose.                        |
| Check the door from here  | `curl -s https://api.<host>/auth/invite` → `{"required":true,"ok":false,…}`                                                               |

**A four-digit code is a soft lock.** Ten thousand combinations is nothing to a
script; what makes it hold at all is the attempt limiter — ten wrong guesses
per address per five minutes, and sixty per minute across the whole site. That
second ceiling is what stops a proxy pool, and it is why `TRUST_PROXY` matters:
set it to `true` and callers can hand themselves a new address per request with
an `X-Forwarded-For` header, which voids both limits silently. Keep it as
narrow as the topology allows — `loopback` while nginx and the API share a host.

If the beta grows past friends-and-family, lengthen the code rather than
tightening the limiter. Length is the only defence that scales.

## 2. First deploy

```bash
# On the VPS, as the deploy user
git clone <repo> /opt/ambervale && cd /opt/ambervale

cp apps/api/.env.example       apps/api/.env        # then edit
cp apps/web/.env.example       apps/web/.env.local  # then edit
openssl rand -hex 32                                # -> SESSION_SECRET

pnpm install --frozen-lockfile
pnpm --filter @ambervale/api db:generate
```

> **Check the Postgres port before writing `DATABASE_URL`.** Debian and Ubuntu
> put a second cluster on **5433** whenever 5432 is already claimed — including
> by a cluster left behind by a previous project on the same box. The symptom
> is `P1001: Can't reach database server at localhost:5432` in a restart loop,
> which reads like a firewall problem and is not.
>
> ```bash
> pg_lsclusters                 # Ver Cluster Port Status Owner
> psql "${DATABASE_URL%%\?*}" -c '\conninfo'
> ```
>
> Note the `%%\?*`: `psql` does not understand Prisma's `?schema=public`
> suffix and fails with `invalid URI query parameter: "schema"`. Stripping the
> query string is the whole fix.

## 2b. Deploying

One command, on the box:

```bash
cd /opt/ambervale && pnpm release
```

That is `ops/deploy.sh`: pull, install, migrate, build, `pm2 startOrReload
--update-env`, then `ops/verify.sh`. It is `set -euo pipefail`, so the first
failure stops everything behind it and the running site is left untouched.

**Not `pnpm deploy`.** pnpm has a built-in command by that name — it deploys a
workspace package into a directory — and a built-in shadows a script of the
same name. It answers `ERR_PNPM_NOTHING_TO_DEPLOY` and nothing happens.

**Why one command rather than the four steps.** They were being pasted as
separate lines, and a separate line does not care whether the one above it
failed. Every production incident so far came out of that gap:

| What failed                                 | What the operator saw                       |
| ------------------------------------------- | ------------------------------------------- |
| build died, `pm2 restart` ran anyway        | unstyled text at full size; every CSS 404   |
| migration applied, client not regenerated   | `error TS2551: Property 'x' does not exist` |
| old process still holding the port          | `curl /health` 200 — from the _old_ process |
| `NEXT_PUBLIC_*` placeholder baked into HTML | a fake contract address on the landing page |

The individual steps, if one has to be run alone:

```bash
pnpm --filter @ambervale/api db:deploy   # schema (never `migrate dev` in prod)
pnpm build                               # compile — runs `prisma generate` first
pm2 startOrReload ecosystem.config.cjs --update-env
pnpm verify                              # proves what is live
```

Migrations run **before** the new code starts and must be backwards-compatible
with the code still serving during the swap: additive columns, nullable or
defaulted, no renames.

If a build directory is already half-written:
`rm -rf apps/web/.next && pnpm build && pm2 restart ambervale-web`.

## 2c. Proving a deploy landed

```bash
pnpm verify
```

Thirteen checks, none of which can be satisfied by a process merely being up.
It exits non-zero if anything fails, so it can be chained.

- **Which commit is answering.** Both halves are stamped by the deploy — the
  api reads `dist/build-id.json` and reports it from `/health`, the web bakes
  `<meta name="ambervale-rev">` into the HTML — and both are compared against
  the checked-out `HEAD`. This is the check that makes "is the new code live?"
  answerable at all. Everything else can pass while an old process holds the
  port and answers every request perfectly.
- **Never through the public domain.** Cloudflare will serve a cached 200 of
  the old page long after the origin changed. Every check speaks to
  `localhost:4021` and `localhost:4022`. To ask what the _edge_ is serving:
  `curl -s https://ambervale.fun/ | grep ambervale-rev` — the meta tag is the
  same one, so a stale cache shows up as an old sha rather than as a hunch.
- **Postgres and Redis, not just the event loop.** `/health/deep` touches
  both; `/health` proves only that node is running.
- **The database is not behind the code.** `prisma migrate status`, because a
  schema one migration short is invisible to every other check while every
  logged-in request 500s.
- **The gate is locked, not merely answering.** `/auth/invite` replies with the
  same shape whether the beta is shut or open to everyone, so the check reads
  `"required":true`.
- **A stylesheet that loads, not one that is named.** The half-built `.next`
  failure produces HTML that references CSS which does not exist; the check
  fetches it and asserts 200.
- **The shipped bundle does not call localhost.** The one failure the operator
  never sees and every visitor does: on the box, `localhost:4021` works.
- **Two samples of the restart counter, three seconds apart.** "online" is not
  health — a crash loop is online between crashes. A counter that moves while
  the check runs is a loop, and that is a fact rather than a threshold.
- **Placeholders.** `NEXT_PUBLIC_*` is baked at build time, so a wrong value is
  compiled into the HTML and no restart will clear it.

### Known gaps, deliberately

- **Nothing schedules `pnpm verify`.** It runs at deploy time and when you run
  it. A crash loop that starts hours later is not detected by anything —
  pm2's own unstable-restart window is `min_uptime * max_restarts` measured
  from the last deliberate restart, so it expires 200s after a deploy by
  design. Adding `*/10 * * * * cd /opt/ambervale && pnpm verify >> /var/log/ambervale-verify.log 2>&1`
  is the cheap fix when the beta grows.
- **Log rotation.** pm2 writes to plain files under `apps/*/logs/` with no
  rotation. `pm2 install pm2-logrotate` once, on the box.
- **Reboot.** `pnpm release` runs `pm2 save` after a verified deploy, but the
  boot hook itself is installed once, by hand: `pm2 startup` and run the line
  it prints.
- **A migration that fails halfway** wedges every later deploy with `P3009`.
  Recovery is `pnpm --filter @ambervale/api exec prisma migrate resolve
--rolled-back <migration_name>` after fixing the cause — never by editing
  the `_prisma_migrations` table.

Infrastructure:

```bash
sudo bash ops/nginx/install.sh

sudo cp ops/redis.conf /etc/redis/redis.conf
sudo systemctl restart redis-server

sudo crontab -e   # 15 3 * * * /opt/ambervale/ops/cron/backup.sh >> /var/log/ambervale-backup.log 2>&1
```

The nginx config is **two files**, on purpose:

| File                            | Goes to                      | Holds                                                                     |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `ops/nginx/ambervale-http.conf` | `/etc/nginx/conf.d/`         | upstreams, Cloudflare real-IP, the `$connection_upgrade` map, gzip tuning |
| `ops/nginx/ambervale.conf`      | `sites-available/` + symlink | the two `server` blocks, nothing else                                     |

They are a pair — the site file references upstreams the other one defines.
The split exists because http-context directives inside a site file still
apply to _every_ vhost on the box, and collide with the distribution's own
`nginx.conf`. Both collisions have happened here:

```
[emerg] duplicate upstream "ambervale_api" in sites-enabled/ambervale:9
[emerg] "gzip" directive is duplicate in sites-enabled/ambervale:45
```

The shipped http file therefore leaves out `gzip on` and `gzip_vary`, which
Debian and Ubuntu already set in `nginx.conf`, and only tunes what is there.

`install.sh` refuses to install while another file already defines
`upstream ambervale_api`, `ambervale_web`, or the same map, because nginx
includes every file under `/etc/nginx/` and rejects the second definition:

```
[emerg] duplicate upstream "ambervale_api" in /etc/nginx/sites-enabled/ambervale:9
```

That message names the file nginx read _second_. The first one is elsewhere —
an older copy under `conf.d/`, a second symlink, or another site started by
copying this one. `grep -rn 'upstream ambervale_' /etc/nginx/` finds both; the
installer does it for you and stops before touching anything. It also backs up
an existing config, since the copy on the box carries the real `server_name`
and certificate paths while the one in the repo carries examples.

Cloudflare: orange-cloud both hostnames, Full (strict) TLS, cache rule for
`/_next/static/*` (cache everything, edge TTL a year), WAF on with the managed
ruleset. The Nginx config already trusts `CF-Connecting-IP` — without it every
request looks like it comes from Cloudflare and the rate limiter is useless.

## 2b. Watching it

`ADMIN_PASSWORD` gates two operator reads. Empty disables both outright.

```
https://<host>/admin/stats        # the page: funnel, retention, economy
https://<host>/admin/stats.json   # the same numbers, for graphing later
```

The funnel is the one worth opening. It is strictly nested — each row is a
subset of the row above — and any step that keeps under half of the previous
one is marked. That is where the game is losing people, and it beats any
opinion about what to build next.

Milestones are listed separately because they are reached in any order:
claiming a meadow never required filling a delivery, and putting the two in
one sequence produced ratios above 100% that meant nothing.

## 3. Smoke test

Run against the real host after every deploy:

```bash
HOST=https://api.ambervale.example.com

curl -sf $HOST/health        | jq -e '.ok == true'
curl -sf $HOST/health/deep   | jq -e '.services.postgres and .services.redis'

# Claims must be shut. This is the one that matters.
curl -s -o /dev/null -w '%{http_code}\n' -X POST $HOST/claim/intent   # expect 401 (no session)

# Admin surfaces must not be reachable from outside.
curl -s -o /dev/null -w '%{http_code}\n' $HOST/metrics                # expect 403/404 via nginx
```

Then, in a browser: load `/play`, press Start, walk, plant, harvest, sell.
Refresh and confirm the farm is unchanged.

## 4. Rollback

The application rolls back independently of the database, which is why
migrations must be backwards-compatible:

```bash
git checkout <previous-tag>
pnpm install --frozen-lockfile && pnpm build
pm2 startOrReload ecosystem.config.cjs
```

**Do not roll migrations back.** If a migration must be undone, write a new
forward migration that reverses it. Restoring a dump loses every farm created
since it was taken.

Restore from backup, only as a last resort:

```bash
pm2 stop ambervale-api
gunzip -c /var/backups/ambervale/ambervale-<stamp>.sql.gz | psql "$DATABASE_URL"
pm2 start ambervale-api
```

## 5. Feature flag state at launch

| Flag                    | Launch value | Why                                                         |
| ----------------------- | ------------ | ----------------------------------------------------------- |
| `ENABLE_CLAIM`          | `false`      | No contract exists. $AMBER accrues; nothing leaves.         |
| `NEXT_PUBLIC_CHAIN_ENV` | `testnet`    | Wallet linking only. Nothing moves value on either network. |
| `SENTRY_DSN`            | set          | Turn error reporting on before players arrive, not after.   |

Flipping `ENABLE_CLAIM` to `true` is a **money-moving change**. Before it:
reconcile `SELECT SUM(delta) FROM "AmberLedger"` against expected issuance,
confirm the payout wallet is funded, and dry-run
`/admin/claim-intents` end to end.

## 6. Verification status

Honest account of what has and has not been run.

| Check                               | Status                                                     |
| ----------------------------------- | ---------------------------------------------------------- |
| Abuse / regression suite (59 tests) | ✅ passing against a live Postgres + Redis                 |
| Ledger integrity (`SUM(delta)`)     | ✅ asserted in CI and verified by hand                     |
| `/play` bundle budget               | ✅ 560 KB gzipped against a 1.5 MB budget                  |
| Typecheck, lint, format             | ✅ clean across all three packages                         |
| Production build + boot             | ✅ both apps                                               |
| k6 load test (200 VUs, p95 < 250ms) | ⚠️ **script written, never executed** — see below          |
| Staging VPS deploy                  | ⚠️ **not executed** — no VPS available in this environment |

**k6 was not run.** The binary is not installed in the build environment and
egress policy blocks fetching it. `ops/k6/core-loop.js` encodes the acceptance
thresholds from the brief and is ready to run:

```bash
k6 run -e API=https://api.ambervale.example.com -e VUS=200 ops/k6/core-loop.js
```

Commit the summary output to `ops/k6/results/` when it has been run. Until
then, treat the 200-user p95 target as **unverified**.

Note that the VU script paces itself under the 5 mutating calls/sec/user rate
limit. A load test that ignored it would measure the limiter rather than the
game.

## 7. Day-one monitoring

- `ambervale_errors_total` — should be flat at zero.
- `ambervale_rate_limited_total` — a rising slope means either an attack or a
  client retry loop.
- `ambervale_slow_queries_total` — queries over 250ms.
- Sentry — any `INTERNAL_ERROR` is a bug, not a player doing something odd;
  every rule rejection is a typed 4xx by design.
- Nightly: confirm the backup ran _and_ is a plausible size. The script exits
  non-zero on a suspiciously small dump so cron mails you.
