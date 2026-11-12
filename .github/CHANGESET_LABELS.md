# Auto-Changeset System

This project uses automated changeset generation based on PR labels.

## How It Works

When you create a PR, add one of the following labels to automatically generate a changeset:

### General Labels (Auto-detects changed packages)
- `patch` - Bug fixes, dependency updates (e.g., 1.0.0 → 1.0.1)
- `minor` - New features, non-breaking changes (e.g., 1.0.0 → 1.1.0)
- `major` - Breaking changes (e.g., 1.0.0 → 2.0.0)

These are ignored on a Dependabot PR. Dependabot applies labels by these exact names to
describe the **dependency's** semver step, which says nothing about how our own package
should be released: on #1771 its `major` label turned a patch `@xmldom/xmldom` bump into
`@ecency/render-helper` 2.5.32 -> 3.0.0. To release a Dependabot PR, use a
package-specific label instead.

### Package-Specific Labels
- `patch:sdk` - Patch bump for @ecency/sdk only
- `minor:sdk` - Minor bump for @ecency/sdk only
- `patch:render-helper` - Patch bump for @ecency/render-helper only
- `minor:render-helper` - Minor bump for @ecency/render-helper only
- `patch:ui` - Patch bump for @ecency/ui only
- `minor:ui` - Minor bump for @ecency/ui only

A package-specific label names our package explicitly, so it is honoured on any PR,
Dependabot's included.

## Examples

### Example 1: Bug fix in SDK
1. Create PR with changes to `packages/sdk/`
2. Add `patch` label
3. Changeset is auto-generated with:
   - Package: @ecency/sdk
   - Bump: patch
   - Description: PR title

### Example 2: New feature in multiple packages
1. Create PR with changes to `packages/sdk/` and `packages/render-helper/`
2. Add `minor` label
3. Changeset is auto-generated for both packages

### Example 3: Different bump types for different packages
1. Create PR with changes to both SDK and render-helper
2. Add both `patch:sdk` and `minor:render-helper` labels
3. Changeset generates patch for SDK, minor for render-helper

## What Happens

1. When you add a label, GitHub Actions runs automatically
2. It detects which packages changed (from git diff)
3. Generates a changeset file in `.changeset/pr-{number}.md`
4. Commits it back to your PR branch
5. When PR is merged to `develop`, the Changesets bot:
   - Creates a "Version Packages" PR
   - Updates package.json versions
   - Generates CHANGELOG.md entries
   - Deletes consumed changeset files

## Special Cases

### Web app only changes
If you only change files in `apps/web/` (no package changes), you don't need a changeset label. The workflow will skip.

### Manual changesets
You can still create manual changesets if needed:
```bash
pnpm changeset
```

This gives you more control over the changeset description.

## Release Process

1. Merge feature PRs with labels → `develop`
2. Changesets bot creates "Version Packages" PR automatically
3. Review and merge "Version Packages" PR
4. Manually publish packages: `pnpm changeset:publish`
