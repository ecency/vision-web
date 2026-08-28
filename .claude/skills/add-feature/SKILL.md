---
name: add-feature
description: Use when adding a new user-facing feature module to apps/web/src/features in the Ecency web app, including its visionFeatures flag, i18n strings, page route and specs.
argument-hint: [feature-name]
---

# Add Feature

Order of operations only; CLAUDE.md covers package boundaries, mutation architecture and
icon rules. Paths below are relative to `apps/web/src`, except repo-rooted ones, which begin
with `apps/`, `packages/`, `scripts/` or `.github/`.

## 1. Feature directory

Files sit flat at the feature root with an `index.ts` barrel. Most feature dirs have that
barrel; a few carry `components/`, `hooks/`, `api/` or `types/` subfolders. Do not scaffold
empty subfolders.

```text
apps/web/src/features/<feature-name>/
  <feature-name>.tsx      component(s), kebab-case filenames
  <feature-name>-api.ts   when it calls a service
  index.ts                export * from "./<feature-name>"
```

Add subfolders once a feature outgrows flat (`waves`, `polls`, `wallet`). Keep the barrel
light so heavy deps stay out of unrelated bundles (`features/pro`). Cross-feature components
live in `features/shared/`, UI primitives in `features/ui/` via `@ui/*`. State or effects
mean `"use client"`. Style with Tailwind plus `dark:` variants; CSS modules are not used
here. A feature stylesheet Tailwind cannot express is registered as an `@import` line in
`styles/_shared-components.scss`, which `styles/style.scss` pulls in once. Do not import it
from the component.

## 2. Flag (only if toggleable)

Add to `visionFeatures` in `config/config.ts`, then mirror into `config/config.template.ts`
by hand: nothing imports the template, so a missed edit is not caught. Gate with
`EcencyConfigManager.Conditional`; the condition receives `visionConfig`.

```tsx
<EcencyConfigManager.Conditional
  condition={({ visionFeatures }) => visionFeatures.aiImageGenerator.enabled}
>
```

Outside JSX: `getConfigValue(({ visionFeatures }) => ...)`.

## 3. Data

- Blockchain: run `/add-sdk-mutation` or `/add-query` first.
- Private API: the client is `packages/sdk/src/modules/private-api`. There is no
  `apps/web/src/api/private-api.ts`. Web adds a feature-local wrapper
  (`features/newsletter/newsletter-api.ts`). Identity comes from `ensureValidToken(username)`,
  imported as `import { ensureValidToken } from "@/utils"`
  and defined in `utils/user-token.ts`; `getAccessToken()` can return an expired token and
  refreshes in the background.
- `useActiveAccount()` from `@/core/hooks/use-active-account`. Keys: `QueryKeys` from
  `@ecency/sdk`, or `QueryIdentifiers` from `@/core/react-query` for web-only queries.

## 4. i18n

The app imports the i18next default export directly. `react-i18next` and `useTranslation`
are not used here.

```tsx
import i18next from "i18next";
const label = i18next.t("pro.badge-title");
```

Strings go in `features/i18n/locales/en-US.json`; other locales come from Crowdin. The
config CI reads is the repo-root `crowdin.yml`, because neither Crowdin workflow passes a
`config:` input or a working directory; `apps/web/crowdin.yml` is a second copy with a
different base path. One top-level namespace per feature, kebab-case keys. A key repeated in
one object is silently last-wins, guarded by
`specs/features/i18n-locale-duplicate-keys.spec.ts`. Inline markup uses `Tsx` from
`@/features/i18n/helper`.

## 5. Page route (if it owns a URL)

Plain `apps/web/src/app/<route>/page.tsx`. `(dynamicPages)` holds profile, entry, feed and
community; other routes sit at the app root or under `(staticPages)`. Page-local components
go in `_components/` beside `page.tsx`. `routes.ts` is a legacy map read by a few files; add
to it for pattern matching.

## 6. Specs

Vitest's `include`, set in `apps/web/vitest.config.mts` and relative to `apps/web/`, is
`src/specs/**/*.spec.{ts,tsx}`, so a spec beside the component is not collected (CLAUDE.md's
"co-located with components" test-pattern line is stale on this). Put it in
`specs/features/<feature-name>/`, render with `renderWithQueryClient` from
`@/specs/test-utils` and seed with `seedQueryClient(queryClient, data)`, client first.
i18next is globally mocked to return the key, so assert on `"<feature-name>.button-label"`.
The same global setup (`specs/setup-any-spec.ts`) mocks `@/utils` down to `random` and
`getAccessToken`, so a spec that reaches a feature-local api wrapper pulling anything else
from `@/utils` has to re-mock it with `vi.importActual("@/utils")`. `pnpm test` at the root
is web-only.

## 7. Wiring in

- Toolbar button: `features/shared/editor-toolbar/index.tsx`, inside a `Conditional`. The
  publish route's `app/publish/_editor-extensions/` is not this.
- Profile section: `app/(dynamicPages)/profile/[username]/_components/`.
- Navigation: `features/shared/navbar/navbar-main-sidebar.tsx`.

Finish with `pnpm lint`, `pnpm typecheck` and `pnpm test`. Those three run none of the script
audits in `.github/workflows/typecheck.yml`; the ones a feature is likely to trip are
`node scripts/icon-scss-audit.mjs`, `node scripts/icon-tsx-audit.mjs --fail` and
`node scripts/slim-entries-audit.mjs --fail`. Copy each line's flags exactly. The two
`--fail` audits report their findings then exit 0 without it, so they pass locally then fail
in CI. `icon-scss-audit` is inverted: with no flag it already exits 1 on a finding, while
`--report` is what downgrades it. It does not read `--fail`, so adding one there changes
nothing.
