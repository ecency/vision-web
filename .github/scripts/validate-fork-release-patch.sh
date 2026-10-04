#!/usr/bin/env bash
# Validate the staged result of applying a fork build artifact. Run only the
# copy saved from the base branch before checking out the fork PR head.
set -euo pipefail

bad=$(git diff --cached --no-renames --name-only \
  | grep -vE '^(\.changeset/[^/]+\.md|packages/(sdk|wallets|render-helper|ui)/(dist/.+|package\.json|CHANGELOG\.md))$' || true)
if [ -n "$bad" ]; then
  echo "::error::patch touches paths outside version/changelog/dist:"
  echo "$bad"
  exit 1
fi

# Inspect the staged destination mode, including 100644 => 120000 changes
# that `git diff --summary` calls "mode change".
git diff --cached --no-renames --name-only -z | while IFS= read -r -d '' path; do
  mode=$(git ls-files -s -- "$path" | awk 'NR == 1 {print $1}')
  if [ -n "$mode" ] && [ "$mode" != 100644 ] && [ "$mode" != 100755 ]; then
    echo "::error::patch has a non-regular file at $path (mode $mode)"
    exit 1
  fi
done

# package.json: only the version and internal @ecency/* ranges may move.
# --text ignores fork-controlled .gitattributes that might mark manifests -diff.
semver='[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?'
range="(workspace:(\\*|\\^|~|[\\^~]?${semver})|[\\^~]?${semver})"
bad=$(git diff --cached --no-renames --text --no-ext-diff -U0 -- 'packages/*/package.json' \
  | grep -E '^[+-][^+-]' \
  | grep -vE "^[+-][[:space:]]*\"version\": \"${semver}\",?$|^[+-][[:space:]]*\"@ecency/(sdk|wallets|render-helper|ui)\": \"${range}\",?$" || true)
if [ -n "$bad" ]; then
  echo "::error::patch changes package.json beyond versions:"
  echo "$bad"
  exit 1
fi
