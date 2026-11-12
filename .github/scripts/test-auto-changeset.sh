#!/usr/bin/env bash
set -euo pipefail
# Variables the generator or the mock read; each case sets its own.
unset REBUILD_TOUCHED_DIST MOCK_VERSION_BUMP

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
generator="$script_dir/auto-changeset.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
repo="$test_dir/repo"
mkdir -p "$test_dir/bin"

cat > "$test_dir/bin/pnpm" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [ "$*" = 'changeset version' ]; then
  # MOCK_VERSION_BUMP names a package whose version `changeset version` moves.
  if [ -n "${MOCK_VERSION_BUMP:-}" ]; then
    printf '{"version":"bumped"}\n' > "packages/$MOCK_VERSION_BUMP/package.json"
  fi
  exit 0
fi
if [ "$*" = '--filter @ecency/sdk build' ]; then
  printf 'rebuilt from source\n' > packages/sdk/dist/generated.js
  exit 0
fi
echo "Unexpected pnpm command: $*" >&2
exit 1
MOCK
chmod +x "$test_dir/bin/pnpm"

git init -q "$repo"
git -C "$repo" config user.name 'CI test'
git -C "$repo" config user.email 'ci-test@example.invalid'
mkdir -p "$repo/.changeset" "$repo/packages/sdk/dist" "$repo/packages/sdk/src"
printf 'base dist\n' > "$repo/packages/sdk/dist/index.js"
printf 'base source\n' > "$repo/packages/sdk/src/index.ts"
printf '{"version":"base"}\n' > "$repo/packages/sdk/package.json"
git -C "$repo" add -A
git -C "$repo" commit -qm base
base=$(git -C "$repo" rev-parse HEAD)

# A generic bump label on a docs-only fork PR should produce no artifact.
printf 'docs change\n' > "$repo/README.md"
git -C "$repo" add -A
git -C "$repo" commit -qm docs
(cd "$repo" && PR_TITLE=Docs PR_NUMBER=101 PR_AUTHOR=contributor \
  PR_LABELS='["patch"]' DIFF_BASE="$base" REBUILD_TOUCHED_DIST=true \
  PATH="$test_dir/bin:$PATH" bash "$generator")
git -C "$repo" add -A
if ! git -C "$repo" diff --cached --quiet; then
  echo 'Docs-only fork PR unexpectedly generated a release patch' >&2
  exit 1
fi

# A source change with a planted dist file must rebuild from base dist.
git -C "$repo" reset --hard -q "$base"
printf 'new source\n' > "$repo/packages/sdk/src/index.ts"
printf 'contributor dist\n' > "$repo/packages/sdk/dist/index.js"
printf 'planted file\n' > "$repo/packages/sdk/dist/evil.js"
git -C "$repo" add -A
git -C "$repo" commit -qm fork
(cd "$repo" && PR_TITLE=Feature PR_NUMBER=102 PR_AUTHOR=contributor \
  PR_LABELS='["patch"]' DIFF_BASE="$base" REBUILD_TOUCHED_DIST=true \
  PATH="$test_dir/bin:$PATH" bash "$generator")

if [ -e "$repo/packages/sdk/dist/evil.js" ] \
  || [ "$(cat "$repo/packages/sdk/dist/index.js")" != 'base dist' ] \
  || [ "$(cat "$repo/packages/sdk/dist/generated.js")" != 'rebuilt from source' ]; then
  echo 'Fork dist was not reset and rebuilt' >&2
  exit 1
fi

# A large PR: the changed-file list is far over a pipe buffer, with the package
# match near the top. A pipeline like `echo "$list" | grep -q` fails there under
# pipefail (grep quits early, echo gets SIGPIPE) and skipped versioning on #2059.
git -C "$repo" reset --hard -q "$base"
# Removes case 2's untracked dist/generated.js, so the rebuild assertion below
# can only pass if this case rebuilds.
git -C "$repo" clean -fdq
mkdir -p "$repo/.changeset"
printf 'changed source\n' > "$repo/packages/sdk/src/index.ts"
mkdir -p "$repo/zz-docs"
for i in $(seq 1 3000); do
  printf '%s\n' "$i" > "$repo/zz-docs/a-long-file-name-to-fill-the-pipe-buffer-$i.md"
done
git -C "$repo" add -A
git -C "$repo" commit -qm large
(cd "$repo" && PR_TITLE=Large PR_NUMBER=103 PR_AUTHOR=maintainer \
  PR_LABELS='["patch"]' DIFF_BASE="$base" MOCK_VERSION_BUMP=sdk \
  PATH="$test_dir/bin:$PATH" bash "$generator")
if ! grep -qx '"@ecency/sdk": patch' "$repo/.changeset/pr-103.md" 2>/dev/null; then
  echo 'Large PR with a generic patch label did not version @ecency/sdk' >&2
  exit 1
fi
# The version moved, so the package must be rebuilt.
if [ "$(cat "$repo/packages/sdk/dist/generated.js" 2>/dev/null)" != 'rebuilt from source' ]; then
  echo 'Large PR versioned @ecency/sdk but did not rebuild it' >&2
  exit 1
fi

echo 'Changeset generation passed'
