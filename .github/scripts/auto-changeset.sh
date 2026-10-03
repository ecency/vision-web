#!/usr/bin/env bash
# Writes a changeset from the PR's bump labels, applies it with `changeset version`,
# and rebuilds every package whose version moved. Shared by both jobs in
# .github/workflows/auto-changeset.yml.
#
# Env:
#   PR_TITLE, PR_NUMBER, PR_AUTHOR  from the pull_request event
#   PR_LABELS                       JSON array of label names
#   DIFF_BASE                       a revision of the base branch present locally
#   GITHUB_TOKEN                    read access is enough (changelog-github lookups)
#   REBUILD_TOUCHED_DIST            "true" on fork PRs: also rebuild every package the
#                                   PR touches, starting from DIFF_BASE's dist, so the
#                                   committed dist is our build of the source and never
#                                   a file the contributor supplied
set -eo pipefail

PACKAGES=(sdk wallets render-helper ui)
LABELS=$(echo "$PR_LABELS" | jq -r '.[]')
CHANGED_FILES=$(git diff --name-only "$DIFF_BASE"...HEAD)

# Per-package bump types
declare -A PACKAGE_BUMPS
DEFAULT_BUMP="patch"

# Precedence: major > minor > patch
set_bump() {
  local package=$1
  local new_bump=$2
  local current_bump="${PACKAGE_BUMPS[$package]}"

  if [ -n "$current_bump" ] && [ "$current_bump" != "$new_bump" ]; then
    echo "⚠️  Conflicting labels for $package: $current_bump and $new_bump"
    if [ "$new_bump" = "major" ] || [ "$current_bump" = "patch" -a "$new_bump" = "minor" ]; then
      echo "   → Using higher severity: $new_bump"
      PACKAGE_BUMPS[$package]=$new_bump
    else
      echo "   → Keeping higher severity: $current_bump"
    fi
  else
    PACKAGE_BUMPS[$package]=$new_bump
  fi
}

# Package-specific labels
for pkg in "${PACKAGES[@]}"; do
  for bump in patch minor major; do
    if echo "$LABELS" | grep -qx "$bump:$pkg"; then set_bump "@ecency/$pkg" "$bump"; fi
  done
done

# No package-specific labels: generic label applied to every changed package.
# Dependabot labels its own PRs major/minor/patch to describe the DEPENDENCY's
# semver step, so those labels say nothing about how OUR package should be
# released and are ignored here. Mirrors the job-level `if:`; kept in the
# script too so the rule survives someone loosening that condition.
if [ ${#PACKAGE_BUMPS[@]} -eq 0 ] && [ "$PR_AUTHOR" != "dependabot[bot]" ]; then
  if echo "$LABELS" | grep -qx "major"; then
    DEFAULT_BUMP="major"
  elif echo "$LABELS" | grep -qx "minor"; then
    DEFAULT_BUMP="minor"
  fi

  for pkg in "${PACKAGES[@]}"; do
    if echo "$CHANGED_FILES" | grep -q "^packages/$pkg/"; then set_bump "@ecency/$pkg" "$DEFAULT_BUMP"; fi
  done
fi

if [ ${#PACKAGE_BUMPS[@]} -eq 0 ]; then
  echo "No publishable packages changed, skipping changeset generation"
  exit 0
fi

CHANGESET_FILE=".changeset/pr-${PR_NUMBER}.md"
rm -f "$CHANGESET_FILE"

echo "---" > "$CHANGESET_FILE"
for pkg in "${!PACKAGE_BUMPS[@]}"; do
  echo "\"$pkg\": ${PACKAGE_BUMPS[$pkg]}" >> "$CHANGESET_FILE"
done
echo "---" >> "$CHANGESET_FILE"
echo "" >> "$CHANGESET_FILE"

if [[ "$PR_TITLE" == *"(#${PR_NUMBER})"* ]]; then
  echo "$PR_TITLE" >> "$CHANGESET_FILE"
else
  echo "$PR_TITLE (#${PR_NUMBER})" >> "$CHANGESET_FILE"
fi

cat "$CHANGESET_FILE"

pnpm changeset version

# Packages whose version moved, plus (fork PRs) every package the PR touched
REBUILD=()
for pkg in "${PACKAGES[@]}"; do
  if git diff --name-only | grep -q "^packages/$pkg/"; then
    REBUILD+=("$pkg")
  elif [ "${REBUILD_TOUCHED_DIST:-}" = "true" ] && echo "$CHANGED_FILES" | grep -q "^packages/$pkg/"; then
    REBUILD+=("$pkg")
  fi
done

if [ ${#REBUILD[@]} -eq 0 ]; then
  echo "No packages to rebuild"
  exit 0
fi

if [ "${REBUILD_TOUCHED_DIST:-}" = "true" ]; then
  for pkg in "${REBUILD[@]}"; do
    # Drop whatever the PR put in dist (extra files included), then build over
    # the base branch's copy. The base copy, not an empty dir: some packages
    # keep committed files at the dist root that their build no longer writes.
    rm -rf "packages/$pkg/dist"
    if git cat-file -e "$DIFF_BASE:packages/$pkg/dist" 2>/dev/null; then
      git checkout "$DIFF_BASE" -- "packages/$pkg/dist"
    fi
  done
fi

echo "Rebuilding packages: ${REBUILD[*]}"

# sdk first: wallets depends on it
for pkg in "${PACKAGES[@]}"; do
  if printf '%s\n' "${REBUILD[@]}" | grep -qx "$pkg"; then
    echo "Building @ecency/$pkg..."
    pnpm --filter "@ecency/$pkg" build
  fi
done
