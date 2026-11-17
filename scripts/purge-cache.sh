#!/usr/bin/env bash
#
# Purge specific URLs from the Cloudflare edge cache.
#
# Usage:
#   ./scripts/purge-cache.sh [--dry-run | --origin-files] [--post <[category/]@author/permlink>]... [url]...
#
# Examples:
#   ./scripts/purge-cache.sh \
#     "https://ecency.com/hive-123456/@alice/bad-post" \
#     "https://ecency.com/@alice"
#
#   # Every cached address of one post (takedown):
#   ./scripts/purge-cache.sh --post hive-123456/@alice/bad-post
#
# --post expands a post into its page, its .md / .json / .discussion.json forms
# and its oEmbed URL, plus the category form of the page when the category is
# given (#1869). --dry-run prints the URLs and sends nothing. --origin-files
# prints, instead, the origin SSR cache file of each URL (browser and crawler
# copies), to delete on each origin host before purging the edge.
#
# Environment variables required (not for --dry-run):
#   CF_ZONE_ID   - Cloudflare zone ID for ecency.com
#   CF_API_TOKEN - Cloudflare API token with Cache Purge permission
#
# Requires: jq (for safe JSON construction)
#
# Cloudflare allows up to 30 URLs per purge request. This script batches
# automatically if you pass more.
#
# Typical workflow (DMCA takedown), see docs/cache/README.md:
#   1. Edit apps/web/public/dmca/dmca-*.json
#   2. Commit, merge, let CI deploy
#   3. Run this script with --post for each affected post to drop the
#      pre-DMCA copies from the CF edge cache
#
set -euo pipefail

BASE="https://ecency.com"
ORIGIN_CACHE_DIR="/var/cache/nginx/ssr"
dry_run=0
origin_files=0
urls=()

# Accounts are lowercase letters, digits, dots and hyphens. Permlinks never
# carry a dot (the same rule as the app's agent-readable rewrite), so a pasted
# `.md` or `.json` URL is refused instead of expanding to `p.md.md`.
post_re='^(([A-Za-z0-9._-]+)/)?@([a-z0-9.-]+)/([A-Za-z0-9_-]+)$'

add_post() {
  local spec=$1
  if [[ ! $spec =~ $post_re ]]; then
    echo "Error: --post takes [category/]@author/permlink, got: $spec" >&2
    exit 1
  fi
  local category=${BASH_REMATCH[2]} author=${BASH_REMATCH[3]} permlink=${BASH_REMATCH[4]}
  local page="$BASE/@$author/$permlink"
  urls+=("$page" "$page.md" "$page.json" "$page.discussion.json")
  # Same encoding as the page head's oEmbed link (encodeURIComponent).
  add_oembed "%2F%40$author%2F$permlink"
  if [[ -n $category ]]; then
    # The category URL is a redirect to the page, but link cards ask oEmbed for
    # a link as written, so its oEmbed answer is cached under its own key.
    urls+=("$BASE/$category/@$author/$permlink")
    add_oembed "%2F$category%2F%40$author%2F$permlink"
  fi
}

# An oEmbed URL for an encoded path, plus its lowercased form when that differs:
# link cards lowercase the link's path before they ask (hive-post-link-extension).
add_oembed() {
  local path=$1
  urls+=("$BASE/api/oembed?url=https%3A%2F%2Fecency.com$path&format=json")
  local lower
  # tr rather than ${path,,}, which macOS's bash 3.2 does not have.
  lower=$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')
  # Only the path is lowercased; %2F and %40 stay as encodeURIComponent writes them.
  lower=${lower//%2f/%2F}
  lower=${lower//%40/%40}
  if [[ $lower != "$path" ]]; then
    urls+=("$BASE/api/oembed?url=https%3A%2F%2Fecency.com$lower&format=json")
  fi
}

# The origin SSR cache file of a URL, per infra/origin/*.ecency.com.conf and
# docs/cache/nginx.md: key "$request_uri$html_limited_bot", where the bot class
# is "" for browsers and "|htmlbot" for limited-HTML crawlers, levels=1:2.
md5_of() {
  if command -v md5sum &>/dev/null; then
    printf '%s' "$1" | md5sum | cut -d' ' -f1
  else
    printf '%s' "$1" | md5 -q
  fi
}

origin_file() {
  local hash
  hash=$(md5_of "$1")
  printf '%s/%s/%s/%s\n' "$ORIGIN_CACHE_DIR" "${hash: -1}" "${hash: -3:2}" "$hash"
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) dry_run=1; shift ;;
    --origin-files) origin_files=1; shift ;;
    --post)
      if [[ $# -lt 2 ]]; then
        echo "Error: --post takes [category/]@author/permlink" >&2
        exit 1
      fi
      add_post "$2"; shift 2 ;;
    -*)
      # A mistyped flag must not reach Cloudflare as a URL.
      echo "Error: unknown option $1" >&2
      exit 1 ;;
    *) urls+=("$1"); shift ;;
  esac
done

if [[ ${#urls[@]} -eq 0 ]]; then
  echo "Usage: $0 [--dry-run | --origin-files] [--post <[category/]@author/permlink>]... [url]..." >&2
  exit 1
fi

if [[ $origin_files -eq 1 ]]; then
  # Print, never delete: clearing these is a step on each origin host.
  for url in "${urls[@]}"; do
    rest=${url#*://}
    if [[ $rest == */* ]]; then request_uri="/${rest#*/}"; else request_uri="/"; fi
    origin_file "$request_uri"
    origin_file "$request_uri|htmlbot"
  done
  exit 0
fi

if [[ $dry_run -eq 1 ]]; then
  printf '%s\n' "${urls[@]}"
  echo "Dry run: ${#urls[@]} URL(s), nothing purged."
  exit 0
fi

if [[ -z "${CF_ZONE_ID:-}" || -z "${CF_API_TOKEN:-}" ]]; then
  echo "Error: CF_ZONE_ID and CF_API_TOKEN must be set" >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed" >&2
  exit 1
fi

batch_size=30
total=${#urls[@]}
idx=0

while [[ $idx -lt $total ]]; do
  end=$(( idx + batch_size ))
  if [[ $end -gt $total ]]; then
    end=$total
  fi

  batch=("${urls[@]:$idx:$((end - idx))}")

  # Build JSON payload safely via jq (handles quotes, backslashes, unicode)
  json_files=$(printf '%s\n' "${batch[@]}" | jq -R . | jq -s .)
  payload=$(jq -n --argjson files "$json_files" '{"files": $files}')

  echo "Purging batch: ${batch[*]}"

  response=$(curl -sS --fail-with-body \
    --connect-timeout 5 --max-time 15 \
    -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${payload}") || {
      echo "Purge request failed (curl error or HTTP error): ${response:-<no body>}" >&2
      exit 1
    }

  success=$(echo "$response" | jq -r '.success // "null"' 2>/dev/null || echo "null")
  if [[ "$success" != "true" ]]; then
    echo "Purge failed: $response" >&2
    exit 1
  fi

  echo "Batch purged successfully."
  idx=$end
done

echo "Done. Purged $total URL(s)."
