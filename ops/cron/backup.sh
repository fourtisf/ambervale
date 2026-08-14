#!/usr/bin/env bash
#
# Nightly Postgres backup, pushed offsite.
#
# Installs as: 15 3 * * * /opt/ambervale/ops/cron/backup.sh >> /var/log/ambervale-backup.log 2>&1
#
# Fails loudly: set -e means a broken backup exits non-zero and cron mails it,
# which is the only way anyone finds out a backup stopped working before they
# need it.

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ambervale}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="${BACKUP_DIR}/ambervale-${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

# --clean --if-exists so the dump can be restored over an existing database.
pg_dump --dbname="$DATABASE_URL" --format=plain --clean --if-exists --no-owner \
  | gzip -9 > "$FILE"

# A dump that restores to nothing is worse than no dump, because it looks fine.
if [ "$(stat -c%s "$FILE")" -lt 1024 ]; then
  echo "FATAL: backup ${FILE} is suspiciously small" >&2
  exit 1
fi

echo "wrote ${FILE} ($(du -h "$FILE" | cut -f1))"

# Offsite. Configure one of these; leaving both unset means the backup is only
# as durable as the box it is on, which is not a backup.
if [ -n "${BACKUP_S3_URL:-}" ]; then
  aws s3 cp "$FILE" "${BACKUP_S3_URL%/}/$(basename "$FILE")"
  echo "uploaded to ${BACKUP_S3_URL}"
elif [ -n "${BACKUP_RSYNC_TARGET:-}" ]; then
  rsync -a "$FILE" "$BACKUP_RSYNC_TARGET"
  echo "synced to ${BACKUP_RSYNC_TARGET}"
else
  echo "WARNING: no offsite target configured (BACKUP_S3_URL or BACKUP_RSYNC_TARGET)" >&2
fi

find "$BACKUP_DIR" -name 'ambervale-*.sql.gz' -mtime "+${RETAIN_DAYS}" -delete
echo "pruned backups older than ${RETAIN_DAYS} days"
