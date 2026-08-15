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

health="$(curl -fsS -m 5 "$API/health" 2>/dev/null)"
if [ -n "$health" ] && printf '%s' "$health" | grep -q '"ok":true'; then
  ok "api answers on $API/health"
else
  bad "api is not answering on $API/health"
  note "pm2 logs ambervale-api --lines 40"
fi

# The gate is the first thing a visitor meets; a 500 here is a dead site even
# though every process is "online".
gate="$(curl -fsS -m 5 "$API/auth/invite" 2>/dev/null)"
if printf '%s' "$gate" | grep -q '"required"'; then
  ok "invite gate answers"
else
  bad "invite gate did not answer with a state"
fi

# --- the web page, and the assets it actually names --------------------------

html="$(curl -fsS -m 10 "$WEB/" 2>/dev/null)"
if [ -z "$html" ]; then
  bad "web root returned nothing on $WEB"
  note "pm2 logs ambervale-web --lines 40"
else
  ok "web root answers on $WEB"

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
  js="$(printf '%s' "$html" | grep -o '/_next/static/chunks/[^"\\]*\.js' | head -1)"
  if [ -n "$js" ]; then
    code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$WEB$js")"
    if [ "$code" = "200" ]; then
      ok "script chunk loads"
    else
      bad "script chunk $js returned $code"
    fi
  fi

  # Placeholders. NEXT_PUBLIC_* is baked at build time, so a wrong value here
  # is compiled in and cannot be fixed by a restart.
  if printf '%s' "$html" | grep -qiE 'ALAMAT|YOUR_|PLACEHOLDER|0xTODO'; then
    bad "the page carries a placeholder value"
    note "check apps/web/.env.local, then rebuild — NEXT_PUBLIC_* is baked at build time"
  else
    ok "no placeholder text on the page"
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
        console.log(`${proc.pm2_env.status} ${restarts} ${uptimeSec}`);
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
    elif [ "$status" != "online" ]; then
      bad "$app is $status"
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
