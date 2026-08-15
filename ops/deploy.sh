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
# `apps/api build` regenerates the Prisma client first, so a column added in
# this same release is known to the compiler.

step "building"
pnpm build || die "build failed. Nothing was restarted, so the running site is untouched. Fix the error and run again."

# --- 5. swap -----------------------------------------------------------------
#
# --update-env because pm2 otherwise keeps the environment it was started
# with, and a changed .env would silently not take effect.

step "restarting processes"
pm2 startOrReload ecosystem.config.cjs --update-env || die "pm2 refused to reload"

# Give the processes a moment to bind their ports before asking them anything.
sleep 3

# --- 6. proof ----------------------------------------------------------------

step "verifying"
bash "$ROOT/ops/verify.sh"
