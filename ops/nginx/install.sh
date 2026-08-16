#!/usr/bin/env bash
#
# Installs the nginx site, and refuses to do it badly.
#
# Two failures have cost real time on this box, and both produce an error that
# names a line number in the file you just wrote rather than the file actually
# at fault:
#
#   duplicate upstream "ambervale_api" in /etc/nginx/sites-enabled/ambervale:9
#
# That message points at the *second* definition nginx read. The first one is
# somewhere else entirely — an older copy under conf.d/, a second symlink in
# sites-enabled, or another site that was started by copying this one. This
# script finds it and says so before touching anything.
#
# Usage: sudo bash ops/nginx/install.sh

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ambervale.conf"
DEST_AVAILABLE=/etc/nginx/sites-available/ambervale
DEST_ENABLED=/etc/nginx/sites-enabled/ambervale

[ -r "$SRC" ] || { echo "cannot read $SRC" >&2; exit 1; }
[ "$(id -u)" = "0" ] || { echo "run this with sudo" >&2; exit 1; }

echo "▸ looking for existing definitions"

# Every file nginx will read, minus the one we are about to write.
mapfile -t clashes < <(
  grep -rl --include='*' -e 'upstream[[:space:]]\+ambervale_\(api\|web\)' \
    /etc/nginx/ 2>/dev/null | grep -v "^${DEST_AVAILABLE}$" | grep -v "^${DEST_ENABLED}$" || true
)

if [ "${#clashes[@]}" -gt 0 ]; then
  echo
  echo "  Another file already defines upstream ambervale_api / ambervale_web:"
  for f in "${clashes[@]}"; do
    echo "    $f"
  done
  echo
  echo "  nginx includes both and refuses to start. Delete or rename the one"
  echo "  you are not using, then run this again. If the other file is a"
  echo "  different site that was copied from this one, rename its upstream"
  echo "  blocks instead — the names are what collide, not the ports."
  exit 1
fi

# A second symlink under a different name is the same collision wearing a hat.
for link in /etc/nginx/sites-enabled/ambervale*; do
  [ -e "$link" ] || continue
  [ "$link" = "$DEST_ENABLED" ] && continue
  echo "  removing stale symlink $link"
  rm -f "$link"
done

echo "▸ installing"
# Keep a copy of whatever is there, because that file may carry the real
# server_name and certificate paths for this box.
if [ -f "$DEST_AVAILABLE" ] && ! cmp -s "$SRC" "$DEST_AVAILABLE"; then
  backup="${DEST_AVAILABLE}.$(date -u +%Y%m%d%H%M%S).bak"
  cp "$DEST_AVAILABLE" "$backup"
  echo "  previous config saved as $backup"
fi

cp "$SRC" "$DEST_AVAILABLE"
ln -sf "$DEST_AVAILABLE" "$DEST_ENABLED"

echo "▸ testing"
if ! nginx -t; then
  echo
  echo "  The test failed. If a backup was written above, restore it with:"
  echo "    cp <the .bak file> $DEST_AVAILABLE && nginx -t && systemctl reload nginx"
  exit 1
fi

echo "▸ reloading"
systemctl reload nginx
echo
echo "nginx reloaded. The site config is $DEST_AVAILABLE."
echo "Remember: server_name and ssl_certificate in the repo copy are examples."
