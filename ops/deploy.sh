#!/usr/bin/env bash
#
# The whole deploy, as one command that stops at the first failure.
#
# It exists because the steps were being pasted into a terminal as separate
# lines, and a separate line does not care whether the previous one failed: a
# build that died still reached `pm2 restart`, which happily served a
# half-written .next. The site came back as unstyled text and every process
# reported "online".
#
# So the rule this file encodes: nothing restarts until everything before it
# succeeded, and nothing is called done until ops/verify.sh says what is live.
#
# Usage, on the VPS:
#
#   cd /opt/ambervale && pnpm release
#
# NOT `pnpm deploy` — pnpm has a built-in command by that name which shadows
# any script called the same thing, and answers ERR_PNPM_NOTHING_TO_DEPLOY.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[36m▸ %s\033[0m\n' "$1"; }
die()  { printf '\n\033[31m✖ %s\033[0m\n\n' "$1" >&2; exit 1; }

branch="$(git rev-parse --abbrev-ref HEAD)"
before="$(git rev-parse --short HEAD)"

printf '\nDeploying %s on branch %s (at %s)\n' "$ROOT" "$branch" "$before"

# --- 1. code -----------------------------------------------------------------
#
# --ff-only rather than a merge: a deploy box should never be resolving
# conflicts, and a divergence here means someone edited files in place, which
# is worth stopping for.

step "pulling $branch"
git pull --ff-only origin "$branch" || die "pull failed — the checkout has diverged from origin/$branch. Resolve by hand; do not force."

after="$(git rev-parse --short HEAD)"
[ "$before" = "$after" ] && printf '  already at %s\n' "$after" || printf '  %s → %s\n' "$before" "$after"

# --- 2. dependencies ---------------------------------------------------------

step "installing dependencies"
pnpm install --frozen-lockfile || die "install failed. If the lockfile is genuinely out of date, commit the updated one rather than dropping --frozen-lockfile here."

# --- 3. schema ---------------------------------------------------------------
#
# Before the build, because the build typechecks against the generated client,
# and before the restart, because the old code must keep working against the
# new schema for the seconds between them. Additive migrations only — see
# docs/LAUNCH.md.

step "applying migrations"
pnpm --filter @ambervale/api db:deploy || die "migration failed — the database was NOT changed and nothing has been restarted. The site is still serving the old code."

# --- 4. build ----------------------------------------------------------------
#
# Into a scratch directory, never over the live one.
#
# `next build` empties and rewrites its output directory in place, while the
# running `next start` keeps reading chunks out of it — so a build that dies
# halfway takes the live site down with it, serving HTML whose stylesheets no
# longer exist. That is how ambervale.fun came back as unstyled text, and no
# amount of `&&` in this file would have prevented it: the damage happens
# during the build, before anything is restarted.
#
# `apps/api build` regenerates the Prisma client first, so a column added in
# this same release is known to the compiler. tsc will not emit on a type
# error (noEmitOnError), so a failed build cannot leave runnable rubbish in
# dist/ either.

WEB="$ROOT/apps/web"
export NEXT_DIST_DIR=.next-build

# Stamp both halves with the commit they were built from. Without this, "is
# the new code live?" has no answer at all: pm2 reports that *a* process is
# online, and an old one holding the port answers /health perfectly well.
# NEXT_PUBLIC_* is baked at build time, which is exactly what is wanted here —
# the revision belongs to the build, not to the process.
export NEXT_PUBLIC_BUILD_REV="$after"

step "building"
rm -rf "$WEB/.next-build"
pnpm build || die "build failed. Nothing was swapped or restarted — the running site is untouched. Fix the error and run again."

[ -d "$WEB/.next-build" ] || die "the build reported success but wrote no $WEB/.next-build"

# The api's half of the same stamp. dist/ is written by tsc, which knows
# nothing about git, so it is put there afterwards; routes/health.ts reads it
# once at boot and reports it.
printf '{"rev":"%s","builtAt":"%s"}\n' "$after" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "$ROOT/apps/api/dist/build-id.json"

# --- 5. swap the build in ------------------------------------------------------
#
# Two renames on the same filesystem, so the window in which the directory is
# not there is microseconds rather than the length of a build. The previous
# build is kept as .next.old, which is the whole of the rollback plan.

step "swapping in the new build"
rm -rf "$WEB/.next.old"
[ -d "$WEB/.next" ] && mv "$WEB/.next" "$WEB/.next.old"
mv "$WEB/.next-build" "$WEB/.next"

# The build records the directory it was written into. `next start` reads the
# config rather than this file, so it does not currently matter — but leaving
# a stale path in there is a landmine for whichever future version does.
node -e '
  const fs = require("fs");
  const path = process.argv[1] + "/.next/required-server-files.json";
  if (!fs.existsSync(path)) process.exit(0);
  const json = JSON.parse(fs.readFileSync(path, "utf8"));
  if (json.config) json.config.distDir = ".next";
  fs.writeFileSync(path, JSON.stringify(json));
' "$WEB"

# --- 6. restart ----------------------------------------------------------------
#
# --update-env because pm2 otherwise keeps the environment it was started
# with, and a changed .env would silently not take effect.

step "restarting processes"
command -v pm2 >/dev/null 2>&1 || die "pm2 is not on PATH"

# What the restart counters read *before* this deploy touches them. A healthy
# reload adds exactly one to each; anything more is a process that crashed and
# came back while we were watching. Sampling deltas after the fact cannot see a
# loop slower than the sample window — and a boot that dies on an unreachable
# Redis takes about ten seconds to fail, which is far slower than any sane one.
VERIFY_BASELINE_API="$(pm2 jlist 2>/dev/null | node -e '
  let r=""; process.stdin.on("data",d=>r+=d); process.stdin.on("end",()=>{
    try { const m=r.match(/\[\s*\{[\s\S]*\}\s*\]/); const l=JSON.parse(m?m[0]:r);
      const p=l.find(x=>x.name==="ambervale-api"); console.log(p?p.pm2_env.restart_time??0:"");
    } catch { console.log(""); }
  });')"
export VERIFY_BASELINE_API

# NEXT_DIST_DIR must not survive into the app. A pm2 daemon being started for
# the first time inherits the environment of the shell that started it, so the
# scratch directory name would follow the web process into next.config — and
# it points at a directory this script has just renamed away. It did not leak
# in a rehearsal against an already-running daemon, which is exactly the kind
# of latent difference that only shows up on a rebooted box.
unset NEXT_DIST_DIR
pm2 startOrReload ecosystem.config.cjs --update-env || die "pm2 refused to reload"

# Wait for the processes to actually answer, rather than guessing at three
# seconds. Two reasons this matters: a cold `next start` can take longer than
# that, and a process that was already crash-looping is in exponential backoff
# — pm2 will not retry it for up to fifteen seconds, so a fixed sleep reports a
# healthy deploy as a failure and sends the operator to read logs for nothing.
printf '  waiting for both to answer'
for _ in $(seq 1 30); do
  api_ok=$(curl -s -o /dev/null -m 2 -w '%{http_code}' http://localhost:4021/health || true)
  web_ok=$(curl -s -o /dev/null -m 3 -w '%{http_code}' http://localhost:4022/ || true)
  if [ "$api_ok" = "200" ] && [ "$web_ok" = "200" ]; then
    printf ' up\n'
    break
  fi
  printf '.'
  sleep 1
done

# --- 7. proof ------------------------------------------------------------------
#
# No rollback is attempted here on purpose. The api and the web are versioned
# together, so restoring one of them alone produces a combination that has
# never been tested — worse than the state being diagnosed. The previous build
# is on disk and the command to restore it is printed instead.

step "verifying"
if bash "$ROOT/ops/verify.sh"; then
  # Only after it verified. `pm2 save` writes the process list that `pm2
  # resurrect` reads on boot, so saving a broken deploy would make the VPS
  # come back to the broken deploy. (Run `pm2 startup` once, by hand, to
  # install the boot hook itself — see docs/LAUNCH.md.)
  if ! pm2 save --force >/dev/null 2>&1; then
    printf '  (pm2 save failed — a reboot will not bring this back)\n'
  fi
else
  printf '\033[31mThe deploy landed but does not verify.\033[0m\n\n'
  printf 'Logs:      pm2 logs ambervale-api --lines 60\n'
  printf 'Roll back: cd %s && rm -rf .next && mv .next.old .next && pm2 restart ambervale-web --update-env\n' "$WEB"
  printf '           (and `git checkout <previous-sha> && pnpm release` for the api)\n\n'
  exit 1
fi
