# Ecency render helper

Built and maintained by [Ecency](https://ecency.com), an open-source social platform on the Hive blockchain.

## Project Overview

`@ecency/render-helper` is a TypeScript library for rendering and sanitizing markdown+HTML content for the Ecency social platform (built on Hive blockchain). It provides security-focused content rendering with XSS protection, image proxification, and embedded media filtering.

## Key Commands

### Development (from package directory)
- `pnpm build` - Build with tsup (creates browser ESM + Node CJS/ESM bundles)
- `pnpm test` - Run vitest tests
- `pnpm lint` - Run ESLint on TypeScript source files

### From Monorepo Root
- `pnpm render-helper` - Build render-helper package
- `pnpm build:packages` - Build all packages (sdk, wallets, render-helper, ui)
- `pnpm publish:render-helper` - Manually publish to npm

### CI/CD
- Part of vision-web monorepo with centralized GitHub Actions (`.github/workflows/packages.yml`)
- Automatically detects changes to `packages/render-helper/**` using git diff
- On push to `develop` branch, builds and publishes to npm
- Uses OIDC (OpenID Connect) for secure npm authentication
- Version must be incremented in package.json for successful publish

## Architecture

### Core Modules

**Main Entry Point** (`src/index.ts`):
- `renderPostBody` - Convert markdown+HTML to sanitized HTML
- `catchPostImage` - Extract first image from post content or metadata
- `postBodySummary` - Generate text summary from post body
- `proxifyImageSrc` - Proxify image URLs through Ecency's image server
- `setProxyBase` - Configure image proxy endpoint (default: `https://i.ecency.com`)
- `setCacheSize` - Configure LRU cache size (default: 60 entries)

### Processing Pipeline

1. **markdown-2-html.ts**: Main rendering pipeline
    - Converts Entry objects (Hive posts) or raw strings
    - Uses LRU cache with keys based on `author-permlink-last_update-updated`
    - Calls `cleanReply()` to normalize input, then `markdownToHTML()` to render

2. **traverse.method.ts**: DOM tree walker
    - Recursively processes parsed HTML nodes
    - Applies specialized handlers for `<a>`, `<iframe>`, `<img>`, `<p>`, and text nodes
    - Passes `forApp` flag to differentiate app vs web rendering
    - Tracks `firstImageFound` state for image processing

3. **sanitize-html.method.ts**: XSS protection
    - Uses `xss` library with strict whitelist (ALLOWED_ATTRIBUTES)
    - Blocks event handlers (`on*` attributes)
    - Validates URLs (must be `https?://`, blocks `javascript:`)
    - Strips `<style>` tags and CSS
    - Whitelists specific `id` attributes via `ID_WHITELIST` regex

4. **Node-specific processors** (`src/methods/`):
    - `a.method.ts` - Link handling, internalization for whitelisted domains
    - `iframe.method.ts` - Embedded content filtering (YouTube, 3speak, etc.)
    - `img.method.ts` - Image proxification and lazy loading
    - `p.method.ts` - Paragraph processing for inline data attributes
    - `text.method.ts` - Link detection and linkification

### Image Processing

**proxify-image-src.ts**:
- Converts external image URLs to Ecency's CDN using multihash encoding
- Reuses existing proxy hashes to avoid re-encoding
- Supports format conversion (webp/png) and resizing (width/height)
- Handles legacy domains (images.hive.blog, steemitimages.com)

**catch-post-image.ts**:
- Extracts featured image from `json_metadata.image` field
- Falls back to first `<img>` in rendered HTML body
- Preserves GIF format (doesn't resize animated images)

### Security Considerations

**Whitelist Management** (`src/consts/white-list.const.ts`):
- `WHITE_LIST` - Trusted Hive frontend domains (ecency.com, peakd.com, etc.)
- `OLD_LIST` - Deprecated Steem-era domains
- Links to whitelisted domains are converted to internal app routes

**XSS Protection**:
- All HTML goes through `sanitizeHtml()` with strict attribute whitelist
- No inline styles allowed (CSS disabled)
- Event handlers stripped
- URL schemes validated

### Caching Strategy

- LRU cache v11 (`src/cache.ts`) stores rendered HTML and extracted images
- Cache keys include content hash (last_update, updated) to auto-invalidate
- Separate cache entries for different image sizes and formats
- Default size: 60 entries
- Uses modern `LRUCache` named import from lru-cache v11

## File Structure

```
src/
├── index.ts                 # Main exports
├── markdown-2-html.ts       # Primary rendering entry point
├── catch-post-image.ts      # Image extraction
├── post-body-summary.ts     # Summary generation
├── proxify-image-src.ts     # Image URL proxification
├── helper.ts                # Utilities (doc creation, cache keys, validators)
├── cache.ts                 # LRU cache wrapper
├── consts/                  # Configuration constants
│   ├── white-list.const.ts  # Trusted domains
│   ├── allowed-attributes.const.ts  # XSS whitelist
│   ├── section-list.const.ts  # App route sections
│   └── regexes.const.ts     # Pattern matching
├── methods/                 # DOM node processors
│   ├── traverse.method.ts   # Main tree walker
│   ├── sanitize-html.method.ts  # XSS protection
│   ├── markdown-to-html.method.ts  # Remarkable wrapper
│   ├── a.method.ts          # Link processing
│   ├── iframe.method.ts     # Embed handling
│   ├── img.method.ts        # Image processing
│   └── ...
└── types/                   # TypeScript interfaces
    └── entry.interface.ts   # Hive post structure
```

## Build System

- Uses **tsup** for bundling (shared with other vision-web packages)
- TypeScript 5.6+ with strict mode enabled
- Outputs three bundles:
    - `dist/browser/index.js` - Browser ESM with TypeScript declarations
    - `dist/node/index.mjs` - Node ESM
    - `dist/node/index.cjs` - Node CommonJS
- Configuration: `tsup.config.ts` (dual browser/node builds)
- All dependencies are externalized (not bundled)

## Platform Support

### React Native (iOS/Android)

This package fully supports React Native applications:

- **Package Resolution**: The `react-native` field in `package.json` exports ensures React Native bundlers (Metro) automatically resolve to the browser build (`dist/browser/index.js`)
- **Crypto Support**: When `platform !== 'web'` (i.e., React Native environment), the package uses `react-native-crypto-js` for cryptographic operations
- **Usage**: Simply import the package normally in your React Native project - no special configuration needed

```typescript
import { renderPostBody, postBodySummary } from '@ecency/render-helper'

// The platform parameter determines the build target
// 'web' = browser/web, any other value = React Native
const html = renderPostBody(entry, false, 'react-native')
const summary = postBodySummary(entry, 200, 'react-native')
```

**Platform Parameter**:
- `'web'` - Uses browser APIs and standard crypto
- Any other value (e.g., `'react-native'`, `'mobile'`) - Uses React Native-compatible implementations including `react-native-crypto-js`
- The platform parameter is required in `renderPostBody()` and `postBodySummary()` functions

## Testing

- Vitest for unit tests (to be migrated from Jest)
- Test files: `*.spec.ts` adjacent to source
- Tests should verify XSS protection for new features
- Do not load external JS/libraries in embed support (security requirement)

## Important Notes

- When adding embed support for new platforms, implement server-side rendering only
- All external content must go through sanitization
- Version bumps required for auto-publish via CI
- Part of vision-web monorepo - changes require updating across dependent packages
- The `@ecency/renderer` package uses this as a workspace dependency
- Exports are optimized for tree-shaking with proper ESM structure
