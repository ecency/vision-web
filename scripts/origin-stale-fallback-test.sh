#!/usr/bin/env bash
# Behaviour test for the @ssr_stale fallback in the committed origin configs
# (infra/origin/*.ecency.com.conf). It copies the real `location @ssr_stale`
# block and its Cache-Control map out of each file, runs them in nginx 1.24
# (the origin version) and checks what a client gets while the render ceiling
# is full:
#   - a fresh cached page keeps the Cache-Control it was stored with
#   - an expired cached page goes out with no-store, so the edge cannot store
#     it again for a new s-maxage
#   - a page that is not cached gets 429
#   - a POST gets 429 without nginx buffering its body
# The harness sends requests to @ssr_stale directly instead of filling a real
# connection limit, so the result does not depend on timing.
# Needs docker. Usage: scripts/origin-stale-fallback-test.sh [conf ...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="nginx:1.24-alpine"
[ $# -gt 0 ] || set -- "$ROOT"/infra/origin/*.ecency.com.conf
WORK="$(mktemp -d)"; NAME="ssr-stale-test-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
FAILED=0

run_one() {
  local conf="$1" label; label="$(basename "$1")"
  local loc map
  loc="$(awk '/^    location @ssr_stale \{$/{f=1} f{print} f&&/^    \}$/{exit}' "$conf")"
  map="$(awk '/^map \$upstream_cache_status \$ssr_stale_cache_control \{$/{f=1} f{print} f&&/^\}$/{exit}' "$conf")"
  if [ -z "$loc" ]; then echo "FAIL $label: no location @ssr_stale block"; FAILED=1; return; fi
  if [ -z "$map" ]; then echo "FAIL $label: no \$ssr_stale_cache_control map"; FAILED=1; return; fi
  # Expired copies can also be served as UPDATING (another request is refreshing
  # them); that path cannot be produced reliably here, so check the map text.
  for st in STALE UPDATING; do
    echo "$map" | grep -Eq "^[[:space:]]+$st[[:space:]]+\"no-store\";" \
      || { echo "FAIL $label: map does not send no-store for $st"; FAILED=1; }
  done
  cat > "$WORK/nginx.conf" <<NGX
user nginx;
events {}
http {
  error_log /var/log/nginx/error.log warn;
  access_log off;
  client_max_body_size 100M;
  client_body_buffer_size 16k;
  proxy_cache_path /tmp/ssr levels=1:2 keys_zone=ssrcache:1m inactive=1h;
  map \$cookie_active_user \$skip_cache { default 0; "~.+" 1; }
  map \$http_user_agent \$html_limited_bot { default ""; }
$map
  # Stand-in for the app: cacheable for 2 seconds.
  server {
    listen 127.0.0.1:8081;
    location / {
      add_header Cache-Control "public, max-age=0, s-maxage=2" always;
      return 200 "page \$uri\n";
    }
  }
  server { listen 127.0.0.1:8429; location / { return 429; } }
  server {
    listen 8080;
    location / {
      # X-Full stands in for a full render ceiling: go straight to the fallback.
      if (\$http_x_full) { return 418; }
      error_page 418 = @ssr_stale;
      proxy_cache ssrcache;
      proxy_cache_key "\$request_uri\$html_limited_bot";
      proxy_pass http://127.0.0.1:8081;
    }
$loc
  }
}
NGX
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -v "$WORK/nginx.conf:/etc/nginx/nginx.conf:ro" "$IMAGE" \
    sh -c 'rm -f /var/log/nginx/error.log; exec nginx -g "daemon off;"' >/dev/null
  local ok=""
  for _ in $(seq 1 30); do
    if docker exec "$NAME" wget -q -O /dev/null http://127.0.0.1:8080/ready 2>/dev/null; then ok=1; break; fi
    sleep 0.5
  done
  if [ -z "$ok" ]; then echo "FAIL $label: nginx did not start"; docker logs "$NAME" 2>&1 | tail -5; FAILED=1; return; fi
  docker exec "$NAME" apk add -q --no-cache curl >/dev/null

  req() { docker exec "$NAME" curl -s -o /dev/null -D - -H 'X-Full: 1' "$@" "http://127.0.0.1:8080$P" | tr -d '\r'; }
  check() { # description, headers, expected status, expected Cache-Control ("" = absent)
    local got_status got_cc
    got_status="$(echo "$2" | awk 'NR==1{print $2}')"
    got_cc="$(echo "$2" | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
    if [ "$got_status" = "$3" ] && [ "$got_cc" = "$4" ]; then echo "ok   $label: $1"
    else echo "FAIL $label: $1 (got $got_status '$got_cc', want $3 '$4')"; FAILED=1; fi
  }

  docker exec "$NAME" curl -s -o /dev/null http://127.0.0.1:8080/old
  sleep 3
  docker exec "$NAME" curl -s -o /dev/null http://127.0.0.1:8080/fresh
  P=/fresh; check "fresh cached page keeps its Cache-Control" "$(req)" 200 "public, max-age=0, s-maxage=2"
  P=/old;   check "expired cached page is sent with no-store" "$(req)" 200 "no-store"
  P=/old;   check "HEAD of an expired page is sent with no-store" "$(req -I)" 200 "no-store"
  P=/never; check "uncached page gets 429" "$(req)" 429 ""
  head -c 3000000 /dev/zero > "$WORK/body"
  docker cp "$WORK/body" "$NAME:/tmp/body"
  P=/fresh; check "POST gets 429" "$(req -X POST --data-binary @/tmp/body)" 429 ""
  if docker exec "$NAME" grep -q 'buffered to a temporary file' /var/log/nginx/error.log; then
    echo "FAIL $label: POST body was buffered before the 429"; FAILED=1
  else echo "ok   $label: POST body was not buffered"; fi
}

for conf in "$@"; do run_one "$conf"; done
[ "$FAILED" = 0 ] && echo "all fallback checks passed" || { echo "fallback checks FAILED"; exit 1; }
