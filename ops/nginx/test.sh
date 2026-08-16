#!/usr/bin/env bash
#
# Runs `nginx -t` against the shipped config, in a throwaway tree.
#
# This exists because three deploys in a row failed on nginx, each one found
# by the operator pasting a command and reading an [emerg] line:
#
#   duplicate upstream "ambervale_api"      — a second copy under conf.d
#   "gzip" directive is duplicate           — the distribution's nginx.conf
#   unknown directive "http2"               — nginx older than 1.25.1
#
# Every one of those is a syntax question nginx itself can answer in a second,
# and none of them needed a production box to discover. So: build a minimal
# http{} that mimics a Debian install, drop the two config files into it,
# point the certificate paths at a throwaway self-signed pair, and ask nginx.
#
# Usage: bash ops/nginx/test.sh
#
# Requires nginx and openssl to be installed locally; skips (exit 0) with a
# notice if nginx is absent, so it never blocks someone without it.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx is not installed here — skipping the config test."
  echo "  Debian/Ubuntu: sudo apt-get install -y nginx-light"
  exit 0
fi

echo "▸ testing against $(nginx -v 2>&1)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP"/{conf.d,sites-available,sites-enabled,certs,logs,body}

openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=ambervale.test' \
  -keyout "$TMP/certs/key.pem" -out "$TMP/certs/cert.pem" >/dev/null 2>&1

cp "$HERE/ambervale-http.conf" "$TMP/conf.d/"

# The shipped file names example certificates that do not exist anywhere; nginx
# reads them at config-test time, so they have to point at something real.
sed -e "s#/etc/letsencrypt/live/[^/]*/fullchain.pem#$TMP/certs/cert.pem#g" \
    -e "s#/etc/letsencrypt/live/[^/]*/privkey.pem#$TMP/certs/key.pem#g" \
    "$HERE/ambervale.conf" > "$TMP/sites-available/ambervale"
ln -sf "$TMP/sites-available/ambervale" "$TMP/sites-enabled/ambervale"

# A minimal stand-in for Debian's nginx.conf, including the `gzip on` that our
# http file must not repeat.
cat > "$TMP/nginx.conf" <<EOF
worker_processes 1;
error_log $TMP/logs/error.log;
pid $TMP/nginx.pid;
events { worker_connections 64; }
http {
    include /etc/nginx/mime.types;
    access_log $TMP/logs/access.log;
    client_body_temp_path $TMP/body;
    proxy_temp_path $TMP/body;
    fastcgi_temp_path $TMP/body;
    uwsgi_temp_path $TMP/body;
    scgi_temp_path $TMP/body;
    gzip on;
    include $TMP/conf.d/*.conf;
    include $TMP/sites-enabled/*;
}
EOF

if nginx -t -c "$TMP/nginx.conf" 2>&1 | sed 's/^/  /'; then
  echo
  echo "Config is valid for this nginx."
else
  echo
  echo "Config is NOT valid. Fix it here rather than on the VPS." >&2
  exit 1
fi
