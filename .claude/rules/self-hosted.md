---
paths:
  - "apps/self-hosted/**"
  - "apps/web/src/features/hosting-signup/**"
  - ".github/workflows/self-hosted.yml"
---

# Self-hosted app and managed blog hosting

## @ecency/self-hosted - Self-Hosted Blog/Community App

**Purpose**: Lightweight SPA for self-hosted Hive blogs and communities

**Stack**: Rsbuild (not Next.js) + TanStack Router + Zustand + TailwindCSS 4

**Scope**:
- ✅ Runtime config system (hot-swappable config.json for Docker/Nginx)
- ✅ Blog post listing, single post view, comments
- ✅ Auth (Keychain, HiveSigner, HiveAuth)
- ✅ Publish/create posts (TipTap editor)
- ✅ Voting, reblog, comment creation
- ✅ Theme platform: 9 style templates rostered in `hosting/api/src/style-templates.ts`. Four are CSS-token-only (`medium`, `minimal`, `developer`, `modern-gradient`); five change page structure by overriding component seams (`magazine`, `journal`, `reader`, `gallery`, `terminal`).
- ✅ Configurable sidebar and branding
- ✅ Claim landing: an unclaimed subdomain serves the shared template config and renders a claim CTA plus a read-only live preview, instead of a blog

**The theme platform.** `src/themes/manifest.ts` defines a `ThemeComponents` seam (Shell, Navigation, Sidebar, ArchiveList, PostCard); a template's manifest in `src/themes/registry.ts` overrides the seams it owns and everything absent falls back to the shared default, so a CSS-only template resolves to the very same component functions. A manifest also declares `unsupportedOptions` (today `['sidebar']`), which the Configuration Editor uses to HIDE the control rather than leave a toggle that does nothing.

`style-templates.ts` is imported by the SPA, so it **must stay dependency-free**: it ends up in browser bundles. The dependency only ever points SPA to hosting/api, never the reverse.

Adding a template takes four steps, each independently enforced: add the id to `style-templates.ts`; add its CSS under `src/styles/themes/` and import it from `index.css` (the roster guard test fails otherwise); add its card to `style-template-display.ts`, which is `satisfies Record<StyleTemplate, StyleTemplateDisplay>` and so fails typecheck while the id is missing; add the editor's label string to i18n. A template that changes page structure also needs a manifest naming the seams it overrides.

**Key files**:
- `apps/self-hosted/src/core/configuration-loader.ts` - Runtime config loading
- `apps/self-hosted/src/core/apply-config-dom.ts` - Applies config to the DOM (`data-style-template`, `data-show-*`, theme tokens)
- `apps/self-hosted/src/providers/sdk/broadcast-adapter.ts` - Auth bridge to SDK
- `apps/self-hosted/src/routes/__root.tsx` - Root layout
- `apps/self-hosted/src/themes/manifest.ts` + `registry.ts` - Theme manifests and seam overrides
- `apps/self-hosted/src/features/claim/` - Unclaimed-subdomain landing and live preview
- `apps/self-hosted/src/features/floating-menu/components/floating-menu-window.tsx` - Configuration Editor (Appearance / Identity / Features / Advanced)

**Deployment**: Docker multi-stage build with Nginx serving static files. `apps/self-hosted/docker-compose.yml` REQUIRES a `TAG` env var, with no default so a moving tag can never be picked by accident. It binds the published port to `127.0.0.1`; set `BIND=0.0.0.0` only when serving directly with no proxy and no HTTPS. See `apps/self-hosted/DEPLOYMENT.md`.

**Cutting a self-hosted release**: `git tag self-hosted-vX.Y.Z && git push origin self-hosted-vX.Y.Z`. That publishes the immutable `vX.Y.Z` and advances `:latest` for both `ecency/self-hosted` and `ecency/hosting-api`. Both images bake `GIT_SHA` and `RELEASE_VERSION` build args. The API's `/health` answers `{status, timestamp, version, sha}` (`api/src/utils/build-info.ts`; version is `'untagged'` on a sha-only build), so blog and API skew is observable in production.

## Managed blog hosting (`apps/self-hosted/hosting`)

- `self-hosted.yml` runs on pushes to `develop` and `main`, on `self-hosted-v*` tag pushes and on pull requests to `develop`/`main`, but **only `develop` deploys**. Both branches previously deployed, with identical jobs pointing at the same host and the same compose project, so whichever ran last won.
- Image tags: every build gets `sha-<7>`; `develop` and `main` are moving channel tags. A `self-hosted-vX.Y.Z` tag push is the ONLY thing that publishes an immutable `vX.Y.Z` and advances `:latest`. The tag must match `^self-hosted-v[0-9]+\.[0-9]+\.[0-9]+$` or the job fails. `self-hosted-v1.0.0` is the first release, cut 2026-08-12.
- **Path filters are not evaluated for tag pushes.** The `paths:` list gates branch pushes only, so a release tag builds whatever the tagged commit contains.
- Pull requests run the unit tests plus a real package and app build, with no secrets, no image push and no deploy. Tag pushes build and publish without deploying.
- The deploy copies a **fixed list** of files to the host: `docker-compose.yml`, `nginx-multi-tenant.conf`, `default-config.json` and `db/*`. Adding a file next to them does not deploy it.
- **This means an edit made directly on the host to any of those files is reverted by the next deploy.** A fix to `nginx-multi-tenant.conf` applied on the box was silently undone this way; changes to those files belong in the repo.
- `hosting/origin/` holds the config that lives on the host itself (edge nginx vhost, certificate automation). It is tracked for review and restore only — **not deployed by CI**, applied by hand via its `install.sh`, so the host stays the source of truth and on-box changes must be copied back. See its README.
- `hosting/traefik/` is **unused**. Traefik is not in the stack and nothing loads it. Its `dynamic/middlewares.yml` sets `X-Robots-Tag: noindex, nofollow` on every response, which would deindex every tenant blog if it were ever wired in.
- There is **no staging tier**: a merge to `develop` deploys straight to the host serving live blogs.

**The claim flow.** nginx serves the shared `hosting/default-config.json` for any `*.blogs.ecency.com` host with no tenant row. That document carries `"template": true`. The SPA reads the flag and renders `src/features/claim/claim-landing.tsx`, a claim CTA, instead of a blog. Blog vs community is derived from the hostname label, where `hive-<digits>` reads as a community (`parse-claim-target.ts`). Two details matter:

- **`noindex` is set at RUNTIME, gated on the same `template` flag**, not written statically into the served HTML. A static noindex would deindex a live blog during any moment its config was missing.
- `?preview=1` (`CLAIM_PREVIEW_PARAM`) boots straight into a read-only live preview of the real blog behind a persistent banner, which is what the CTA "See a live preview first" links to. Nothing is created and no tenant row exists at this point.

**The signup funnel customizes BEFORE payment.** `apps/web/src/features/hosting-signup/hosting-signup.tsx` runs `username` → `customize` → `payment` → `success`. The customize step picks template, accent and font preset, then persists a draft under `ecency:hosting:customize:${name}`, so someone who abandons at payment does not lose their choices. Payment defaults to card, with HBD via Keychain or a manual transfer as the alternative.

**The free path creates no tenant.** `self-host-bundle.ts` emits `config.json`, `docker-compose.yml`, `.env`, `Caddyfile` and a README as a hand-written store-format (uncompressed) ZIP, deliberately with no zip dependency in the monorepo. That branch never calls `createTenant`, so a visitor can leave `/hosting` with a ready-to-run bundle and cost nothing. `POST /v1/tools/compose-config` composes the same config server-side for an independent deployment, stripping the markers that only make sense here (`managed`, `template`, `claimPreview`, Ecency's `hivesigner.clientId`).
