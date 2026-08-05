# Package Publishing Guide

This document explains how packages in the vision-web monorepo are published to npm.

## Overview

The monorepo contains 4 publishable packages:
- **@ecency/sdk** - Core SDK for Ecency/Hive interactions
- **@ecency/wallets** - Cryptocurrency wallet integrations
- **@ecency/render-helper** - Markdown+HTML rendering and sanitization library

## Automated Publishing (CI/CD)

### How It Works

1. **Change Detection**: GitHub Actions uses git diff to detect changes in each package directory
2. **Automatic Build**: When changes are detected on push to `develop` branch, the affected package is built
3. **Automatic Publish**: After successful build, the package is published to npm using OIDC authentication

### Workflow Configuration

Location: `.github/workflows/packages.yml`

The workflow:
- Uses `git diff` to detect which packages changed since the last commit
- Runs on push to `develop` branch
- Only builds and publishes packages that have changes
- Uses pnpm for fast, reliable builds
- Uses OIDC (OpenID Connect) for secure npm authentication

### Requirements

- **OIDC Authentication**: Configured via GitHub's Trusted Publishing
  - No NPM_TOKEN needed - uses GitHub's OIDC tokens
  - More secure than long-lived tokens
  - Automatically configured for the @ecency organization

- **Version Bump**: Package version in `package.json` must be incremented
  - npm will reject publishes with the same version number
  - Follow semantic versioning (major.minor.patch)

## Manual Publishing

### From Package Directory

```bash
cd packages/<package-name>
pnpm build
pnpm publish --access public
```

### From Monorepo Root

```bash
# Build specific package
pnpm render-helper
pnpm sdk
pnpm wallets

# Build all packages
pnpm build:packages

# Publish specific package (requires npm authentication)
pnpm publish:render-helper
pnpm publish:sdk
pnpm publish:wallets
```

## Package Dependencies

### Workspace Dependencies


### Publishing Order

When multiple packages need updates:

1. **@ecency/render-helper** - No dependencies on other packages
2. **@ecency/sdk** - No dependencies on other packages
3. **@ecency/wallets** - Depends on @ecency/sdk

The CI workflow handles this automatically by building/publishing in parallel where possible.

## Troubleshooting

### Build Fails in CI

- Check that all TypeScript types are correct (strict mode enabled)
- Ensure all dependencies are properly listed in package.json
- Test locally with `pnpm build` from package directory

### Publish Fails

- **Version conflict**: Bump the version number in package.json
- **Authentication error**: Check OIDC configuration on npm (Trusted Publishing)
- **Scope permission**: Ensure OIDC is configured for @ecency scope on npmjs.com

### Package Not Detected

If changes to a package don't trigger the workflow:
- Verify the file path is under `packages/<package-name>/`
- Check the detection logic in `.github/workflows/packages.yml`
- Ensure you're pushing to `develop` branch (not master or main)

## Version Management

### Semantic Versioning

- **Major (x.0.0)**: Breaking changes (incompatible API changes)
- **Minor (1.x.0)**: New features (backward compatible)
- **Patch (1.0.x)**: Bug fixes (backward compatible)

### Example

```bash
cd packages/render-helper

# Bug fix
npm version patch  # 2.3.17 → 2.3.18

# New feature
npm version minor  # 2.3.17 → 2.4.0

# Breaking change
npm version major  # 2.3.17 → 3.0.0
```

Then commit and push the version change to trigger CI.

## Testing Before Publish

Always test packages locally before publishing:

```bash
# From monorepo root
pnpm build:packages

# Test in dependent package
cd apps/web
pnpm dev  # Verify everything works
```

## Package Registry

All packages are published to: https://www.npmjs.com/org/ecency

View published versions:
- https://www.npmjs.com/package/@ecency/render-helper
- https://www.npmjs.com/package/@ecency/sdk
- https://www.npmjs.com/package/@ecency/wallets
