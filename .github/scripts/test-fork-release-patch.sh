#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
validator="$script_dir/validate-fork-release-patch.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
repo="$test_dir/repo"

git init -q "$repo"
git -C "$repo" config user.name "CI test"
git -C "$repo" config user.email "ci-test@example.invalid"
mkdir -p "$repo/packages/sdk/dist"
printf 'original\n' > "$repo/packages/sdk/dist/index.js"
printf '{\n  "name": "@ecency/sdk",\n  "version": "1.0.0"\n}\n' > "$repo/packages/sdk/package.json"
git -C "$repo" add -A
git -C "$repo" commit -qm base

validate() { (cd "$repo" && bash "$validator"); }
reject() {
  if validate > "$test_dir/rejection.log" 2>&1; then
    echo "Expected the fork release patch to be rejected: $1" >&2
    exit 1
  fi
}
reset_case() { git -C "$repo" reset --hard -q HEAD; }

printf 'rebuilt\n' > "$repo/packages/sdk/dist/index.js"
git -C "$repo" add -A
validate
reset_case

sed -i 's/"1.0.0"/"1.0.1"/' "$repo/packages/sdk/package.json"
git -C "$repo" add -A
validate
reset_case

ln -sf ../source.js "$repo/packages/sdk/dist/index.js"
git -C "$repo" add -A
reject 'regular dist file changed to symlink'
reset_case

printf '{\n  "name": "@ecency/sdk",\n  "version": "1.0.1",\n  "scripts": {"postinstall": "bad"}\n}\n' > "$repo/packages/sdk/package.json"
git -C "$repo" add -A
reject 'package install script changed'
reset_case

mkdir -p "$repo/packages/sdk/src"
printf 'unexpected\n' > "$repo/packages/sdk/src/extra.ts"
git -C "$repo" add -A
reject 'source file added by artifact'

echo 'Fork release patch validation passed'
