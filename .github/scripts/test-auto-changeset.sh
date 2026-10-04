#!/usr/bin/env bash
set -euo pipefail

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

echo 'Fork changeset generation passed'
