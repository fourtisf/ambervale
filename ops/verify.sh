#!/usr/bin/env bash
#
# Proves what is actually live on this machine.
#
# Every check here exists because something once looked fine and wasn't:
#
#   - pm2 said "online" for a process serving code from three commits ago.
#   - A 200 from the public URL came out of Cloudflare's cache.
#   - The HTML rendered while every stylesheet it named 404'd, so the site was
#     legible only as unstyled text.
#   - A placeholder contract address shipped and sat on the landing page.
#
# So: nothing here goes through the public domain, and no check passes on a
# status code alone. Run it after any deploy, and after any change made by
# hand on the box.
#
# Usage: pnpm verify        (or: bash ops/deploy.sh, which ends by calling this)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${VERIFY_API_URL:-http://localhost:4021}"
WEB="${VERIFY_WEB_URL:-http://localhost:4022}"

pass=0
fail=0

ok()   { printf '  \033[32mok\033[0m    %s\n' "$1"; pass=$((pass + 1)); }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; fail=$((fail + 1)); }
note() { printf '        %s\n' "$1"; }

printf '\nVerifying %s\n\n' "$ROOT"

# --- what is checked out -----------------------------------------------------

cd "$ROOT" || exit 1
head_sha="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

ok "checkout $branch @ $head_sha"
if [ "$dirty" != "0" ]; then
  note "$dirty uncommitted file(s) — the running code is not exactly this commit"
fi

# --- the api -----------------------------------------------------------------
#
# /health/deep rather than /health: it touches Postgres and Redis, so it fails
# when the api is up but cannot reach anything — which is a dead site with a
# green process, and the whole reason this file exists.

health="$(curl -fsS -m 8 "$API/health/deep" 2>/dev/null)"
if [ -n "$health" ] && printf '%s' "$health" | grep -q '"ok":true'; then
  ok "api answers, with Postgres and Redis behind it"
else
  bad "api is unhealthy on $API/health/deep"
  note "response: ${health:-（none）}"
  note "pm2 logs ambervale-api --lines 40"
fi

# Which build is answering. An old process holding the port answers /health
# perfectly well; this is the check that tells the two apart.
api_rev="$(printf '%s' "$health" | grep -o '"rev":"[^"]*"' | cut -d'"' -f4)"
if [ -z "$api_rev" ] || [ "$api_rev" = "null" ]; then
  note "api reports no build id — running from source (dev) rather than a deploy"
elif [ "$api_rev" = "$head_sha" ]; then
  ok "api is serving this commit ($api_rev)"
else
  bad "api is serving $api_rev, but $head_sha is checked out"
  note "the process did not restart, or an older one still holds the port"
  note "pm2 restart ambervale-api --update-env"
fi

# The gate is the first thing a visitor meets. Checking that it *answers* is
# not enough — it answers identically whether the beta is shut or wide open,
# and an accidentally empty INVITE_CODE opens the game to everyone silently.
gate="$(curl -fsS -m 5 "$API/auth/invite" 2>/dev/null)"
if printf '%s' "$gate" | grep -q '"required":true'; then
  ok "invite gate is locked"
elif printf '%s' "$gate" | grep -q '"required":false'; then
  bad "the invite gate is OPEN — anyone can play"
  note "INVITE_CODE is empty in apps/api/.env; set it and restart the api"
else
  bad "invite gate did not answer with a state"
fi

# --- the database the api is talking to ---------------------------------------
#
# A schema one migration behind the code is invisible to every check above:
# /health answers, the page renders, and only the requests that touch the new
# column 500 — which, for a column on User, is every logged-in request.

if command -v pnpm >/dev/null 2>&1; then
  status="$(cd "$ROOT/apps/api" && pnpm exec prisma migrate status 2>&1)"
  if printf '%s' "$status" | grep -q 'Database schema is up to date'; then
    ok "database schema matches the migrations in this checkout"
  elif printf '%s' "$status" | grep -qE 'following migrations? have not yet been applied|not yet been applied'; then
    bad "the database is behind the code — migrations are pending"
    note "pnpm --filter @ambervale/api db:deploy"
  else
    bad "could not read the migration state"
    note "$(printf '%s' "$status" | grep -iE 'error|P[0-9]{4}' | head -2)"
  fi
fi

# --- the web page, and the assets it actually names --------------------------

html="$(curl -fsS -m 10 "$WEB/" 2>/dev/null)"
if [ -z "$html" ]; then
  bad "web root returned nothing on $WEB"
  note "pm2 logs ambervale-web --lines 40"
else
  ok "web root answers on $WEB"

  # The other half of the identity check. This one is baked into the HTML at
  # build time, so it survives every layer in front of it — which means the
  # same grep works against the public domain and will show a stale Cloudflare
  # cache for what it is.
  web_rev="$(printf '%s' "$html" | grep -o 'name="ambervale-rev" content="[^"]*"' | cut -d'"' -f4)"
  if [ -z "$web_rev" ] || [ "$web_rev" = "dev" ]; then
    note "web page carries no build id — built outside ops/deploy.sh"
  elif [ "$web_rev" = "$head_sha" ]; then
    ok "web is serving this commit ($web_rev)"
  else
    bad "web is serving $web_rev, but $head_sha is checked out"
    note "the build did not swap in, or pm2 did not restart ambervale-web"
  fi

  # A page with no stylesheet is the half-built .next failure. Checking that
  # the HTML *names* a stylesheet is not enough — the file has to load.
  css="$(printf '%s' "$html" | grep -o '/_next/static/css/[^"\\]*\.css' | head -1)"
  if [ -z "$css" ]; then
    bad "the page names no stylesheet at all"
    note "rm -rf apps/web/.next && pnpm build && pm2 restart ambervale-web"
  else
    code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB$css")"
    if [ "$code" = "200" ]; then
      ok "stylesheet loads ($css)"
    else
      bad "stylesheet $css returned $code — the build is incomplete"
      note "rm -rf apps/web/.next && pnpm build && pm2 restart ambervale-web"
    fi
  fi

  # Same again for the first script chunk: HTML without JS is a dead canvas.
  # The chunk is fetched anyway, so it is also the cheapest place to read what
  # was baked into the bundle.
  js="$(printf '%s' "$html" | grep -o '/_next/static/chunks/[^"\\]*\.js' | head -1)"
  bundle=''
  if [ -n "$js" ]; then
    code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB$js")"
    if [ "$code" = "200" ]; then
      ok "script chunk loads"
      bundle="$(curl -fsS -m 10 "$WEB$js" 2>/dev/null)"
    else
      bad "script chunk $js returned $code"
    fi
  fi

  # Placeholders, in the HTML *and* in the bundle. NEXT_PUBLIC_* is baked at
  # build time, so a wrong value is compiled in and no restart will clear it —
  # and the values most likely to be wrong (the API URL) never appear in the
  # HTML at all, only in the JavaScript.
  if printf '%s' "$html" | grep -qiE 'ALAMAT|YOUR_|PLACEHOLDER|0xTODO'; then
    bad "the page carries a placeholder value"
    note "check apps/web/.env.local, then rebuild — NEXT_PUBLIC_* is baked at build time"
  else
    ok "no placeholder text on the page"
  fi

  # A bundle that points at localhost is the one failure a visitor sees and
  # the operator never does: on the box every check passes, and every browser
  # elsewhere calls a machine that is not there.
  if [ -n "$bundle" ] && [ "${VERIFY_ALLOW_LOCALHOST:-}" != "1" ]; then
    if printf '%s' "$bundle" | grep -qE 'https?://(localhost|127\.0\.0\.1)'; then
      bad "the shipped bundle calls localhost — every visitor's browser will fail"
      note "set NEXT_PUBLIC_API_URL to the public API origin in apps/web/.env.local, then rebuild"
    else
      ok "the bundle calls a real origin, not localhost"
    fi
  fi

  # The play route is the product; a 200 on / says nothing about it.
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB/play")"
  if [ "$code" = "200" ]; then
    ok "/play answers"
  else
    bad "/play returned $code"
  fi
fi

# --- processes ---------------------------------------------------------------
#
# "online" is not health: a crash loop is online between crashes. The restart
# count is the number that tells the truth.

pm2_stat() {
  pm2 jlist 2>/dev/null | node -e '
      let raw = "";
      process.stdin.on("data", (d) => (raw += d));
      process.stdin.on("end", () => {
        const app = process.argv[1];
        // pm2 sometimes prints a notice line before the JSON, and that notice
        // can itself start with "[", so slicing from the first bracket is not
        // enough — match the array of objects.
        const parse = (text) => {
          try {
            return JSON.parse(text);
          } catch {
            const m = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (!m) return null;
            try {
              return JSON.parse(m[0]);
            } catch {
              return null;
            }
          }
        };

        const list = parse(raw);
        if (!Array.isArray(list)) return console.log("unreadable");

        const proc = list.find((p) => p.name === app);
        if (!proc) return console.log("missing");

        const restarts = proc.pm2_env.restart_time ?? 0;
        const uptimeSec = Math.round((Date.now() - (proc.pm2_env.pm_uptime ?? Date.now())) / 1000);
        // pm2 statuses can be two words ("waiting restart", which is what an
        // exp_backoff loop looks like), and the shell reads this positionally.
        const status = String(proc.pm2_env.status).replace(/\s+/g, "-");
        console.log(`${status} ${restarts} ${uptimeSec}`);
      });
    ' "$1"
}

if command -v pm2 >/dev/null 2>&1; then
  # Two samples three seconds apart. A restart counter that moves between them
  # is a crash loop, and that is a fact rather than a guess about a threshold —
  # 507 restarts with a healthy-looking "online" beside it is exactly the state
  # this is here to name.
  first_api="$(pm2_stat ambervale-api)"
  first_web="$(pm2_stat ambervale-web)"
  sleep 3

  for app in ambervale-api ambervale-web; do
    case "$app" in
      ambervale-api) before_line="$first_api" ;;
      *) before_line="$first_web" ;;
    esac

    set -- $before_line
    was_restarts="${2:-0}"

    set -- $(pm2_stat "$app")
    status="${1:-unreadable}"
    restarts="${2:-0}"
    uptime="${3:-0}"

    if [ "$status" = "missing" ]; then
      bad "$app is not in pm2 at all"
      note "pm2 startOrReload ecosystem.config.cjs --update-env"
    elif [ "$status" = "unreadable" ]; then
      bad "could not read pm2 state for $app"
    elif [ "$restarts" -gt "$was_restarts" ]; then
      bad "$app is crash-looping — it restarted again while this check ran"
      note "pm2 logs $app --lines 60"
    elif [ "$status" = "waiting-restart" ]; then
      bad "$app is crash-looping — pm2 is backing off between restarts"
      note "pm2 logs $app --lines 60"
    elif [ "$status" != "online" ]; then
      bad "$app is ${status//-/ }"
      note "pm2 logs $app --lines 60"
    else
      ok "$app online (up ${uptime}s, $restarts restarts lifetime)"
    fi
  done
else
  note "pm2 not on PATH — process checks skipped"
fi

# --- summary -----------------------------------------------------------------

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '\033[32m%s checks passed.\033[0m %s is live.\n\n' "$pass" "$head_sha"
  exit 0
fi

printf '\033[31m%s check(s) failed\033[0m, %s passed. The site is NOT correctly deployed.\n\n' "$fail" "$pass"
exit 1
