#!/usr/bin/env bash
# Behaviour test for the SSR cache headers in the committed origin configs
# (infra/origin/*.ecency.com.conf). It copies the real `location /` and
# `location @ssr_stale` blocks and their Cache-Control map out of each file,
# runs them in nginx 1.24 (the origin version) in front of a stand-in app, and
# checks what clients get.
#
# Expired copies must go out with a short edge lifetime (CC_EXPIRED), whether
# served as STALE (the app errored) or UPDATING (another request is refreshing
# them), so the edge cannot store them again for a full new s-maxage. Every other answer must
# keep the app's Cache-Control exactly. With the render ceiling full, the
# fallback must also answer uncached pages and POSTs with 429, without
# buffering request bodies.
#
# Needs docker. Usage: scripts/origin-ssr-cache-test.sh [conf ...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="nginx:1.24-alpine"
[ $# -gt 0 ] || set -- "$ROOT"/infra/origin/*.ecency.com.conf
WORK="$(mktemp -d)"; NAME="ssr-cache-test-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT
FAILED=0

# Cache-Control values the stand-in app sends.
CC_SHORT="public, max-age=0, s-maxage=2, stale-while-revalidate=300"
CC_LONG="public, max-age=0, s-maxage=600"
CC_PRIVATE="private, no-cache, no-store, max-age=0, must-revalidate"
# What expired copies must carry: a short edge lifetime, not their original s-maxage.
CC_EXPIRED="public, max-age=0, s-maxage=10"

block() { # print a block of the vhost: $1 = exact opening line, $2 = exact closing line, $3 = file
  awk -v first="$1" -v last="$2" '$0 == first {f=1} f {print} f && $0 == last {exit}' "$3"
}

start() { # $1 = conf file, $2 = anonymous render ceiling
  local conf="$1" cap="$2" loc stale map
  loc="$(block '    location / {' '    }' "$conf")"
  stale="$(block '    location @ssr_stale {' '    }' "$conf")"
  map="$(block 'map $upstream_cache_status $ssr_stale_cache_control {' '}' "$conf")"
  [ -n "$loc" ] && [ -n "$stale" ] || { echo "FAIL $LABEL: location / or @ssr_stale block not found"; return 1; }
  # Without the map the blocks reference an undefined variable and nginx would not
  # start; define a pass-through so the behaviour checks can still report.
  [ -n "$map" ] || map='map $upstream_cache_status $ssr_stale_cache_control { default $upstream_http_cache_control; }'
  echo "limit_conn total_ssr $cap;" > "$WORK/conn-limits.conf"
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
  map \$cookie_active_user \$anon_conn_key { default "anon"; "~.+" ""; }
  map \$http_user_agent \$html_limited_bot { default ""; }
  limit_conn_zone \$anon_conn_key zone=total_ssr:1m;
  limit_req_zone \$binary_remote_addr zone=botlimit:1m rate=1000r/s;
  limit_req_zone \$binary_remote_addr zone=ssrlimit:1m rate=1000r/s;
  limit_req_zone \$binary_remote_addr zone=general:1m rate=1000r/s;
$map

  # Stand-in for the app on the port the real block proxies to.
  server {
    listen 127.0.0.1:3000;
    root /srv;
    location /s/    { add_header Cache-Control "$CC_SHORT" always; try_files \$uri @e500; }
    location /l/    { add_header Cache-Control "$CC_LONG" always; try_files \$uri =404; }
    location /slow/ { limit_rate 64k; add_header Cache-Control "$CC_SHORT" always; try_files \$uri =404; }
    location = /two { add_header Cache-Control "public" always; add_header Cache-Control "s-maxage=600" always; try_files /page =404; }
    location = /none    { try_files /page =404; }
    location = /private { add_header Cache-Control "$CC_PRIVATE" always; try_files /page =404; }
    location @e500 { return 500; }
  }
  server { listen 127.0.0.1:8429; location / { return 429; } }
  server {
    listen 8080;
$loc
$stale
  }
}
NGX
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" \
    -v "$WORK/nginx.conf:/etc/nginx/nginx.conf:ro" \
    -v "$WORK/conn-limits.conf:/etc/nginx/conn-limits.conf:ro" \
    "$IMAGE" sh -c 'mkdir -p /srv/s /srv/l /srv/slow
      for f in s/a s/err s/old l/fresh l/fresh2 page; do echo "page $f" > /srv/$f; done
      head -c 524288 /dev/zero > /srv/slow/big; cp /srv/slow/big /srv/slow/big2
      rm -f /var/log/nginx/error.log; exec nginx -g "daemon off;"' >/dev/null
  local up=""
  for _ in $(seq 1 40); do
    if docker exec "$NAME" wget -q -O /dev/null http://127.0.0.1:3000/page 2>/dev/null; then up=1; break; fi
    sleep 0.5
  done
  [ -n "$up" ] || { echo "FAIL $LABEL: nginx did not start"; docker logs "$NAME" 2>&1 | tail -5; return 1; }
  docker exec "$NAME" apk add -q --no-cache curl >/dev/null
}

get() { docker exec "$NAME" curl -s -o /dev/null -D - "$@" | tr -d '\r'; }
quiet() { docker exec "$NAME" curl -s -o /dev/null "$@"; }
# All Cache-Control lines, joined with " | " so a duplicate shows up.
ccof() { awk -F': ' 'tolower($1)=="cache-control"{printf "%s%s", (n++ ? " | " : ""), $2}'; }
check() { # description, response headers, expected status, expected X-Cache-Status ("-" = any), expected Cache-Control ("" = none)
  local st xcs cc
  st="$(echo "$2" | awk 'NR==1{print $2}')"
  xcs="$(echo "$2" | awk -F': ' 'tolower($1)=="x-cache-status"{print $2}')"
  cc="$(echo "$2" | ccof)"
  if [ "$st" = "$3" ] && { [ "$4" = "-" ] || [ "$xcs" = "$4" ]; } && [ "$cc" = "$5" ]; then
    echo "ok   $LABEL: $1"
  else
    echo "FAIL $LABEL: $1 (got $st ${xcs:-no-status} '$cc', want $3 $4 '$5')"; FAILED=1
  fi
}

normal_path() { # render ceiling open: everything goes through location /
  start "$1" 100 || { FAILED=1; return; }
  check "MISS keeps the app's Cache-Control" "$(get http://127.0.0.1:8080/l/fresh)" 200 MISS "$CC_LONG"
  local h etag
  h="$(get http://127.0.0.1:8080/l/fresh)"
  check "HIT keeps the stored Cache-Control" "$h" 200 HIT "$CC_LONG"
  etag="$(echo "$h" | awk -F': ' 'tolower($1)=="etag"{print $2}')"
  check "304 for a conditional HIT keeps Cache-Control" "$(get -H "If-None-Match: $etag" http://127.0.0.1:8080/l/fresh)" 304 HIT "$CC_LONG"
  check "HEAD of a HIT keeps Cache-Control" "$(get -I http://127.0.0.1:8080/l/fresh)" 200 HIT "$CC_LONG"
  check "404 from the app keeps Cache-Control" "$(get http://127.0.0.1:8080/l/missing)" 404 - "$CC_LONG"
  check "logged-in BYPASS keeps the app's private header" "$(get -b active_user=x http://127.0.0.1:8080/private)" 200 BYPASS "$CC_PRIVATE"
  check "no Cache-Control from the app adds none (MISS)" "$(get http://127.0.0.1:8080/none)" 200 MISS ""
  check "no Cache-Control from the app adds none (HIT)" "$(get http://127.0.0.1:8080/none)" 200 HIT ""
  # nginx 1.24 joins repeated upstream header lines in \$upstream_http_*; the
  # pass-through sends them as separate lines. Either form carries both values.
  local two; two="$(get http://127.0.0.1:8080/two | ccof)"
  case "$two" in
    "public | s-maxage=600"|"public, s-maxage=600") echo "ok   $LABEL: two Cache-Control lines keep both values ($two)";;
    *) echo "FAIL $LABEL: two Cache-Control lines lost a value (got '$two')"; FAILED=1;;
  esac
  quiet http://127.0.0.1:8080/s/a; quiet http://127.0.0.1:8080/s/err
  quiet http://127.0.0.1:8080/slow/big
  sleep 3
  check "cache lifetime still follows s-maxage (EXPIRED refetch keeps header)" "$(get http://127.0.0.1:8080/s/a)" 200 EXPIRED "$CC_SHORT"
  check "fresh entry within s-maxage is still a HIT" "$(get http://127.0.0.1:8080/l/fresh)" 200 HIT "$CC_LONG"
  docker exec "$NAME" rm /srv/s/err
  check "STALE (app error) gets a short edge lifetime" "$(get http://127.0.0.1:8080/s/err)" 200 STALE "$CC_EXPIRED"
  # A refreshes the expired slow page; B arrives while that refresh runs.
  docker exec -d "$NAME" curl -s -o /dev/null http://127.0.0.1:8080/slow/big
  sleep 1
  check "UPDATING (refresh in progress) gets a short edge lifetime" "$(get http://127.0.0.1:8080/slow/big)" 200 UPDATING "$CC_EXPIRED"
}

ceiling_full() { # render ceiling of 1, held by a slow refresh: anonymous requests go to @ssr_stale
  start "$1" 1 || { FAILED=1; return; }
  quiet http://127.0.0.1:8080/l/fresh2; quiet http://127.0.0.1:8080/s/old
  quiet http://127.0.0.1:8080/slow/big2
  head -c 3000000 /dev/zero > "$WORK/body"; docker cp "$WORK/body" "$NAME:/tmp/body"
  sleep 3
  docker exec -d "$NAME" curl -s -o /dev/null http://127.0.0.1:8080/slow/big2
  sleep 1
  check "full: fresh cached page keeps its Cache-Control" "$(get http://127.0.0.1:8080/l/fresh2)" 200 HIT "$CC_LONG"
  check "full: expired cached page gets a short edge lifetime" "$(get http://127.0.0.1:8080/s/old)" 200 STALE "$CC_EXPIRED"
  check "full: HEAD of an expired page gets a short edge lifetime" "$(get -I http://127.0.0.1:8080/s/old)" 200 STALE "$CC_EXPIRED"
  check "full: page being refreshed gets a short edge lifetime" "$(get http://127.0.0.1:8080/slow/big2)" 200 UPDATING "$CC_EXPIRED"
  check "full: uncached page gets 429" "$(get http://127.0.0.1:8080/never)" 429 - ""
  check "full: POST gets 429" "$(get -X POST --data-binary @/tmp/body http://127.0.0.1:8080/l/fresh2)" 429 - ""
  check "full: logged-in requests are not limited" "$(get -b active_user=x http://127.0.0.1:8080/private)" 200 BYPASS "$CC_PRIVATE"
  if docker exec "$NAME" grep -q 'buffered to a temporary file' /var/log/nginx/error.log; then
    echo "FAIL $LABEL: full: POST body was buffered before the 429"; FAILED=1
  else echo "ok   $LABEL: full: POST body was not buffered"; fi
}

for conf in "$@"; do
  LABEL="$(basename "$conf")"
  normal_path "$conf"
  ceiling_full "$conf"
done
[ "$FAILED" = 0 ] && echo "all SSR cache checks passed" || { echo "SSR cache checks FAILED"; exit 1; }
