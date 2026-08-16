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

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/ambervale.conf"
SRC_HTTP="$HERE/ambervale-http.conf"
DEST_AVAILABLE=/etc/nginx/sites-available/ambervale
DEST_ENABLED=/etc/nginx/sites-enabled/ambervale
DEST_HTTP=/etc/nginx/conf.d/ambervale-http.conf

[ -r "$SRC" ] || { echo "cannot read $SRC" >&2; exit 1; }
[ -r "$SRC_HTTP" ] || { echo "cannot read $SRC_HTTP" >&2; exit 1; }
[ "$(id -u)" = "0" ] || { echo "run this with sudo" >&2; exit 1; }

echo "▸ looking for existing definitions"

# Every file nginx will read, minus the one we are about to write.
mapfile -t clashes < <(
  grep -rl --include='*' -e 'upstream[[:space:]]\+ambervale_\(api\|web\)' \
       -e 'map[[:space:]]\+\$http_upgrade[[:space:]]\+\$connection_upgrade' \
    /etc/nginx/ 2>/dev/null \
    | grep -v "^${DEST_AVAILABLE}$" | grep -v "^${DEST_ENABLED}$" | grep -v "^${DEST_HTTP}$" || true
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

# gzip is the other one that bites: Debian and Ubuntu enable it in nginx.conf,
# and a second `gzip on` anywhere fails the test. The shipped http file leaves
# it out, so this only warns about a config already on the box.
if grep -rq --include='*' -e '^[[:space:]]*gzip[[:space:]]\+on;' /etc/nginx/nginx.conf 2>/dev/null; then
  if grep -rl --include='*' -e '^[[:space:]]*gzip[[:space:]]\+on;' /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null \
     | grep -qv "^${DEST_HTTP}$"; then
    echo
    echo '  Note: nginx.conf already sets "gzip on", and so does a file under'
    echo '  conf.d or sites-enabled. That is the "gzip directive is duplicate"'
    echo '  error. Remove the one that is not in nginx.conf.'
    echo
  fi
fi

# A second symlink under a different name is the same collision wearing a hat.
for link in /etc/nginx/sites-enabled/ambervale*; do
  [ -e "$link" ] || continue
  [ "$link" = "$DEST_ENABLED" ] && continue
  echo "  removing stale symlink $link"
  rm -f "$link"
done

echo "▸ checking the config against this nginx, before touching anything"
if ! bash "$HERE/test.sh"; then
  echo "  Refusing to install a config that does not pass nginx -t." >&2
  exit 1
fi

echo "▸ installing"
# Keep a copy of whatever is there, because that file may carry the real
# server_name and certificate paths for this box.
if [ -f "$DEST_AVAILABLE" ] && ! cmp -s "$SRC" "$DEST_AVAILABLE"; then
  backup="${DEST_AVAILABLE}.$(date -u +%Y%m%d%H%M%S).bak"
  cp "$DEST_AVAILABLE" "$backup"
  echo "  previous config saved as $backup"
fi

# The http-context half first: the site file references its upstreams, so
# installing the site alone would fail with "unknown upstream".
if [ -f "$DEST_HTTP" ] && ! cmp -s "$SRC_HTTP" "$DEST_HTTP"; then
  cp "$DEST_HTTP" "${DEST_HTTP}.$(date -u +%Y%m%d%H%M%S).bak"
fi
cp "$SRC_HTTP" "$DEST_HTTP"

# HTTP/2, in whichever spelling this nginx understands.
#
# The file ships `listen 443 ssl http2;`, which every version since 1.9.5
# accepts. From 1.25.1 that form is deprecated in favour of a standalone
# `http2 on;` — still working, but it logs a warning on every reload, and a
# warning nobody can act on is a warning everybody learns to ignore.
version="$(nginx -v 2>&1 | sed -n 's#.*nginx/\([0-9.]*\).*#\1#p')"
newest="$(printf '%s\n1.25.1\n' "$version" | sort -V | tail -1)"
if [ -n "$version" ] && [ "$newest" = "$version" ] && [ "$version" != "1.25.1" ]; then
  echo "  nginx $version prefers the modern http2 directive — rewriting"
  sed -e 's/^\( *\)listen 443 ssl http2;/\1listen 443 ssl;\n\1http2 on;/' "$SRC" > "$DEST_AVAILABLE"
elif [ "$version" = "1.25.1" ]; then
  sed -e 's/^\( *\)listen 443 ssl http2;/\1listen 443 ssl;\n\1http2 on;/' "$SRC" > "$DEST_AVAILABLE"
else
  cp "$SRC" "$DEST_AVAILABLE"
fi
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
echo "nginx reloaded."
echo "  shared directives : $DEST_HTTP"
echo "  site              : $DEST_AVAILABLE"
echo "Remember: server_name and ssl_certificate in the repo copy are examples."
