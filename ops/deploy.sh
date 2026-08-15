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

step "building"
rm -rf "$WEB/.next-build"
pnpm build || die "build failed. Nothing was swapped or restarted — the running site is untouched. Fix the error and run again."

[ -d "$WEB/.next-build" ] || die "the build reported success but wrote no $WEB/.next-build"

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

# NEXT_DIST_DIR must not survive into the app. A pm2 daemon being started for
# the first time inherits the environment of the shell that started it, so the
# scratch directory name would follow the web process into next.config — and
# it points at a directory this script has just renamed away. It did not leak
# in a rehearsal against an already-running daemon, which is exactly the kind
# of latent difference that only shows up on a rebooted box.
unset NEXT_DIST_DIR
pm2 startOrReload ecosystem.config.cjs --update-env || die "pm2 refused to reload"

# Give the processes a moment to bind their ports before asking them anything.
sleep 3

# --- 7. proof ------------------------------------------------------------------
#
# No rollback is attempted here on purpose. The api and the web are versioned
# together, so restoring one of them alone produces a combination that has
# never been tested — worse than the state being diagnosed. The previous build
# is on disk and the command to restore it is printed instead.

step "verifying"
if ! bash "$ROOT/ops/verify.sh"; then
  printf '\033[31mThe deploy landed but does not verify.\033[0m\n\n'
  printf 'Logs:      pm2 logs ambervale-api --lines 60\n'
  printf 'Roll back: cd %s && rm -rf .next && mv .next.old .next && pm2 restart ambervale-web --update-env\n' "$WEB"
  printf '           (and `git checkout <previous-sha> && pnpm release` for the api)\n\n'
  exit 1
fi
