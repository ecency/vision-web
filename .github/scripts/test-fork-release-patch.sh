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
mkdir -p "$repo/packages/sdk/dist" "$repo/packages/sdk/src" "$repo/scripts" "$repo/.github/workflows"
printf 'original\n' > "$repo/packages/sdk/dist/index.js"
printf 'sensitive source\n' > "$repo/packages/sdk/src/security.ts"
printf 'audit code\n' > "$repo/scripts/origin-config-audit.mjs"
printf 'name: lint\n' > "$repo/.github/workflows/lint.yml"
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
reset_case

# Rename detection must not hide deletions outside the allowed paths.
git -C "$repo" mv scripts/origin-config-audit.mjs packages/sdk/dist/a.js
git -C "$repo" mv packages/sdk/src/security.ts packages/sdk/dist/b.js
git -C "$repo" mv .github/workflows/lint.yml packages/sdk/dist/c.js
reject 'outside files renamed into dist'
reset_case

# Attributes in the fork head must not hide a manifest change as a binary diff.
printf 'packages/*/package.json -diff\n' > "$repo/.gitattributes"
git -C "$repo" add .gitattributes
git -C "$repo" commit -qm 'fork attributes'
printf '{\n  "name": "@ecency/sdk",\n  "version": "1.0.1",\n  "main": "./evil.js",\n  "scripts": {"postinstall": "bad"}\n}\n' > "$repo/packages/sdk/package.json"
git -C "$repo" add -A
reject 'manifest edit hidden by diff attribute'
reset_case

printf '{\n  "name": "@ecency/sdk",\n  "version": "1.0.1"\n}\n' > "$repo/packages/sdk/package.json"
git -C "$repo" add -A
validate
reset_case

printf '{\n  "name": "@ecency/sdk",\n  "version": "1.0.0",\n  "dependencies": {\n    "@ecency/wallets": "npm:other-pkg@1"\n  }\n}\n' > "$repo/packages/sdk/package.json"
git -C "$repo" add -A
reject 'untrusted internal dependency range'
reset_case

printf '{\n  "name": "@ecency/sdk",\n  "version": "1.0.0",\n  "dependencies": {\n    "@ecency/wallets": "workspace:*"\n  }\n}\n' > "$repo/packages/sdk/package.json"
git -C "$repo" add -A
git -C "$repo" commit -qm 'internal dependency fixture'
sed -i 's/workspace:\*/^1.2.3/' "$repo/packages/sdk/package.json"
git -C "$repo" add -A
validate

echo 'Fork release patch validation passed'
