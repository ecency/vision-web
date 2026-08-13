<a href="https://discord.gg/WywwJEu">![Discord](https://img.shields.io/discord/385034494555455488?label=Ecency%20discord&logo=discord)</a> <a href="https://x.com/ecency_official">![Twitter Follow](https://img.shields.io/twitter/follow/ecency_official?style=social)</a> <a href="https://github.com/ecency/vision-web/stargazers">![GitHub Repo stars](https://img.shields.io/github/stars/ecency/vision-web?style=social)</a>

# [Ecency vision][ecency_vision] – Ecency Web client

![ecency](https://ecency.com/assets/github-cover.png)

Immutable, decentralized, uncensored, rewarding communities powered by Hive.

Fast, simple and clean source code with Reactjs + Typescript.

## Website

- [Production version][ecency_vision] - main branch
- [Alpha version][ecency_alpha] - develop branch

***

## Developers

Feel free to test it out and submit improvements and pull requests.

***

## Data Fetching and Broadcasting

### Data Fetching (Web + SDK)

The web app uses `@ecency/sdk` for data fetching. Requests are built with query option helpers and
sent to `CONFIG.privateApiHost`.

`privateApiHost` is `""` (current origin) only for a browser on `ecency.com` / `*.ecency.com`:

- `POST /private-api/*`
- `POST /search-api/*`

SSR uses `INTERNAL_API_HOST` when set, otherwise `https://ecency.com`; a non-production browser
uses `https://ecency.com`. To point at a different backend, set `INTERNAL_API_HOST` for SSR and
edit `apps/web/src/core/sdk-init.ts` for the client. `NEXT_PUBLIC_APP_BASE` has no effect here.

### Broadcasting (Web + SDK)

Broadcasting in the SDK is platform-agnostic. The SDK can:

- Sign transactions directly with private keys (built-in ECDSA secp256k1 transaction engine).
- Use a Hivesigner access token.
- Defer to an injected broadcaster for platform-specific signing (Keychain, HiveAuth, MetaMask Snap, mobile).

In the web app, `getSdkAuthContext` wires Keychain/HiveAuth:

```ts
import { getSdkAuthContext } from "@/utils";
import { useAccountUpdate } from "@ecency/sdk";

const auth = getSdkAuthContext(activeUser);
const { mutateAsync } = useAccountUpdate(activeUser?.username ?? "", auth);
await mutateAsync({ profile: { about: "..." } });
```

Wallet operations follow the same pattern:

```ts
import { useWalletOperation } from "@ecency/wallets";
import { getSdkAuthContext } from "@/utils";

const auth = getSdkAuthContext(activeUser);
const { mutateAsync } = useWalletOperation(username, asset, operation, auth);
```

***

## HTML Edge Caching

The web app emits `Cache-Control` headers from Next.js middleware, and the CDN
(Cloudflare) and reverse proxy (Nginx) respect them. Next.js is the single
source of truth for cache policy — do not override it at the infra layer.

### Key files

- `apps/web/src/features/next-middleware/cache-policy.ts` — route-pattern TTLs
- `apps/web/src/middleware.ts` — header injection
- `apps/web/src/features/next-middleware/post-age-cache.ts` — per-post-age TTL refinement
- `scripts/purge-cache.sh` — manual DMCA/moderation invalidation
- `docs/cache/` contains `README.md`, `nginx.md` and `cloudflare-worker.md`

### Important notes

**Most tiers ARE cached for logged-in users.** Only the mute-filtered tiers
(`feed`, `feed-created`, `profile-feed`) and the `no-cache` routes emit
`Cache-Control: private, no-store` when the `active_user` cookie is present.
Every other tier is auth-class-equivalent (anon vs any-logged-in-user) and
shares one edge entry across logged-in users.

**No `Vary: Cookie`.** Auth bifurcation happens at the infra layer: the CF
worker suffixes its cache key with the auth-class (anon | loggedin), giving
2 entries per URL. Emitting `Vary: Cookie` would fragment the edge cache on
every unrelated cookie (analytics, locale, experiments) and destroy hit ratio.

**Post pages use age-based TTLs.** Fresh posts (< 1 day) cache for 1 minute;
posts older than 60 days cache for 30 days. On a cache miss the middleware
applies a conservative 60s `entry-unknown` tier, then refines once the post's
`created` date is known. The lookup is L1 in-memory first, then Redis with a
short timeout; a never-seen post triggers a background refresh via
`waitUntil`.

**Observability header.** Every response carries `x-cache-tier: <tier>`, or
`<tier>-loggedin` (e.g. `feed-loggedin`) when the tier went private for a
logged-in user, so CF analytics, Nginx logs and DevTools reveal which policy
was applied. Use this to verify cache behavior without inspecting
`Cache-Control` directly.

### DMCA / moderation invalidation

CF edge serves cached HTML for up to the `s-maxage` window (1h for post
pages, 24h for static pages). For takedowns:

1. Update `apps/web/public/dmca/dmca-*.json`, commit, deploy
2. Run `./scripts/purge-cache.sh <affected-urls>` to drop pre-takedown HTML
   from the CF edge cache

Without step 2, CF continues serving the old content until `s-maxage`
expires.

### Verifying cache behavior

```bash
# Anonymous — should HIT after the first request
curl -sI https://ecency.com/discover | grep -iE 'cache|tier'

# Logged-in — should always BYPASS
curl -sI --cookie "active_user=alice" https://ecency.com/discover | grep -iE 'cache|tier'
```

Expected headers on an anonymous hit:

```http
Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600
X-Cache-Tier: list
X-Cache-Status: HIT
CF-Cache-Status: HIT
```

### Infra configuration

Nginx and CF worker configs live in the infra repo; their behaviour is
documented here in `docs/cache/`. The rules are simple: **respect origin
`Cache-Control`**, **bypass on `active_user` cookie** and **preserve
`x-cache-tier`** in the response headers.


| Tier | `s-maxage` | `stale-while-revalidate` | Routes |
|---|---|---|---|
| `static` | 24h | 7d | `/faq`, `/about`, `/child-safety`, `/contributors`, `/creator-economy`, `/privacy-policy`, `/terms-of-service`, `/whitepaper`, `/mobile` |
| `home` | 5m | 1h | `/` |
| `list` | 5m | 1h | `/discover`, `/communities`, `/witnesses`, `/tags` |
| `list-proposals` | 10m | 1h | `/proposals` |
| `dynamic-page` | 1m | 5m | `/chats`, `/decks`, `/waves`, `/perks`, `/search` |
| `feed` | 1m | 5m | `/hot`, `/trending`, `/payout`, `/muted`, `/promoted` + tags |
| `feed-created` | 30s | 2m | `/created`, `/tags/:tag` |
| `community` | 1m | 5m | `/:tag/hive-xxxxx` |
| `profile` | 5m | 1h | `/@author`, `/@author/posts`, `/blog`, `/comments`, `/replies`, `/communities` |
| `profile-feed` | 1m | 5m | `/@author/feed`, `/@author/trail` (aggregates other users' content) |
| `entry` | 1h | 1d | post pages (default — used until post age is known) |
| `entry-unknown` | 1m | 5m | post pages on a post-age cache miss |
| `entry-fresh` | 1m | 5m | posts < 1 day old |
| `entry-week` | 1h | 1d | posts 1-7 days old |
| `entry-month` | 1d | 7d | posts 7-30 days old |
| `entry-archive` | 30d | 7d | posts 30-60 days old |
| `entry-ancient` | 30d | 60d | posts > 60 days old |
| `no-cache` | 0 | 0 | `/publish`, `/auth`, `/signup`, `/submit`, `/draft`, `/onboard-friend`, `/purchase`, `/market`, `/wallet`, plus profile sections `wallet`/`settings`/`permissions`/`referrals`/`insights` |


***

## Build instructions

##### Requirements

- `node >= 22.12` (CI and `.nvmrc` use 24.16.0)
- [`pnpm`](https://pnpm.io/) (the repo is configured with `packageManager: pnpm@11.5.0`; pnpm 11
  reads `overrides`/`allowBuilds` from `pnpm-workspace.yaml`, not the package.json `pnpm` field)

##### Clone

`$ git clone https://github.com/ecency/vision-web`

`$ cd vision-web`

### Working with pnpm

This repository is organised as a [pnpm workspace](https://pnpm.io/workspaces) with two
applications (`apps/web`, `apps/self-hosted`) and four publishable packages under `packages/*`
(`@ecency/sdk`, `@ecency/wallets`, `@ecency/render-helper`, `@ecency/ui`). pnpm keeps a
single lockfile (`pnpm-lock.yaml`) at the workspace root and all commands should be run from this
directory unless noted otherwise.

##### Install dependencies

```bash
pnpm install
```

pnpm will create a workspace-wide virtual store and automatically link local packages between
`apps/*` and `packages/*`.

##### Running scripts

You can execute scripts that are defined in each workspace package. Some useful commands are:

| Task | Command                           | Notes |
| --- |-----------------------------------| --- |
| Install dependencies | `pnpm install`                    | Installs all workspace packages.
| Start development server | `pnpm --filter @ecency/web dev`   | Runs the Next.js dev server for the web app.
| Start self-hosted dev server | `pnpm dev:self`               | Runs the Rsbuild dev server for the self-hosted SPA.
| Build for production | `pnpm --filter @ecency/web build` | Builds the web app only.
| Build the libraries | `pnpm build:packages`             | Builds `@ecency/sdk`, `@ecency/wallets`, `@ecency/render-helper` plus `@ecency/ui`.
| Start production server | `pnpm --filter @ecency/web start` | Runs the built web app.
| Lint all packages | `pnpm lint`                       | Executes `pnpm -r lint` defined in the root `package.json`.
| Type check all packages | `pnpm typecheck`              | Executes `pnpm -r --if-present typecheck`.
| Test the web app | `pnpm test`                       | Executes `pnpm --filter @ecency/web test`, the web app suite only. Package suites: `pnpm -r test` or `pnpm --filter @ecency/sdk test`.

`pnpm build` builds the web app only. Use `pnpm build:packages` for the four libraries
(`@ecency/sdk`, `@ecency/wallets`, `@ecency/render-helper`, `@ecency/ui`) and
`pnpm --filter @ecency/self-hosted build` for the self-hosted SPA. Only `pnpm lint` and
`pnpm typecheck` are recursive.

##### Publishing packages

Packages in `packages/*` can be published individually. Build first, then run the package's own
publish script:

```bash
pnpm build:packages
pnpm publish:sdk        # or publish:wallets / publish:render-helper / publish:ui
```

Each script runs `npx -y npm@11 publish --access public` from the package directory (the npm
version is pinned deliberately). Versioning goes through Changesets: `pnpm changeset`, then
`pnpm changeset:version` / `pnpm changeset:publish`; see `.github/CHANGESET_LABELS.md`.

##### Edit config file or define environment variables

1. `$ cp apps/web/.env.template apps/web/.env`
2. Update values with your ones

##### Environment variables

- ~~`USE_PRIVATE` - if instance has private api address and auth (0 or 1 value)~~ Use extended configuration instead below.
- `HIVESIGNER_CLIENT_ID` - a special application Hive account. Server-only. If unset, "ecency.app" is used.
- `HIVESIGNER_SECRET` - the secret your site shares with Hivesigner. Server-only, so do NOT give it a `NEXT_PUBLIC_` prefix, which would ship it to the browser.
- ~~`REDIS_URL` - support for caching amp pages~~. Amp pages has been deprecated and will be removed by Google. Amp pages aren't longer supporting in Ecency vision. 

###### Hivesigner Variables

When setting up another service like Ecency with Vision software:

1. You may leave `HIVESIGNER_CLIENT_ID` and `HIVESIGNER_SECRET` environment variables unset and optionally set `USE_PRIVATE=1` and leave `NEXT_PUBLIC_APP_BASE` set to `https://ecency.com`. Your new site will contain more features as it will use Ecency's private API. This is by far the easiest option.
2. You may change `NEXT_PUBLIC_APP_BASE` to the URL of your own site, but you will have to set environment variables `HIVESIGNER_CLIENT_ID` and `HIVESIGNER_SECRET`; set `USE_PRIVATE=0` as well as configure your `HIVESIGNER_CLIENT_ID` account at the [Hivesigner website.](https://hivesigner.com/profile). Hivesigner will need a `secret`, in the form of a long lowercase hexadecimal number. The `HIVESIGNER_SECRET` should be set to this value.

###### Hivesigner Login Process

In order to validate a login and do posting level operations, this software relies on Hivesigner. A user @alice will use login credentials to login to the site via one of several methods, but the site will communicate with Hivesigner and ask it to do all posting operations on behalf of @alice. Hivesigner can and will do this because both @alice will have given posting authority to the `HIVESIGNER_CLIENT_ID` user and the `HIVESIGNER_CLIENT_ID` user will have given its posting authority to Hivesigner.

##### Edit "default" values

Default branding values can now be customized via environment variables without editing source files. The authoritative list is `apps/web/.env.template`, which documents each variable inline and separates browser-exposed `NEXT_PUBLIC_*` values from server-only ones. Copy it to `apps/web/.env` and override what you need.

If you are setting up your own website other than Ecency.com, set the branding variables (`NEXT_PUBLIC_APP_BASE`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TITLE`, `NEXT_PUBLIC_APP_DESCRIPTION`, `NEXT_PUBLIC_TWITTER_HANDLE`, `NEXT_PUBLIC_APP_LOGO`, `NEXT_PUBLIC_IMAGE_SERVER`, `NEXT_PUBLIC_NWS_SERVER`) to match your brand. There are also a lot of static pages that are Ecency specific.

### Extended vision configuration

Ecency vision has extended configuration based on feature-flag on/off specifications built in json format.
```json
// Any ecency vision configuration file should be started with specific tag as below
{
  "visionConfig": {
    "features": {
      ...
    }
  }
}
```
Feature flags and their formats:
1. 

See `apps/web/src/config/config.template.ts` (copied to `config.ts`); the manager lives in `apps/web/src/config/index.tsx`.  

***

## Self-hosted blogs (`apps/self-hosted`)

The repository holds a second application: `apps/self-hosted`, a lightweight SPA (Rsbuild +
TanStack Router) that serves one Hive blog or community. It powers both the managed blogs on
`*.blogs.ecency.com` and independent deployments run by anyone.

- `pnpm dev:self` starts its dev server; `pnpm --filter @ecency/self-hosted build` builds it.
- `apps/self-hosted/DEPLOYMENT.md` covers running your own instance.
- `apps/self-hosted/hosting/README.md` covers the managed multi-tenant platform (hosting API,
  per-tenant nginx, payments, SEO files).

**Style templates.** Nine ship today: `medium`, `minimal`, `magazine`, `developer`,
`modern-gradient`, `journal`, `reader`, `gallery`, `terminal`. The roster lives in
`apps/self-hosted/hosting/api/src/style-templates.ts`, which is kept dependency-free because the
SPA imports it into browser bundles. Four are CSS-token-only (`medium`, `minimal`, `developer`,
`modern-gradient`); the other five override component seams (Shell, Navigation, Sidebar,
ArchiveList, PostCard) through manifests in `apps/self-hosted/src/themes/`, so they change page
structure rather than only design tokens.

**The image is operated differently from `ecency/vision-web`.**
`apps/self-hosted/docker-compose.yml` requires a `TAG` environment variable and gives it no
default, so a moving tag can never be picked by accident. It also publishes the port on
`127.0.0.1` unless you set `BIND=0.0.0.0`. Immutable tags are `sha-<7>` on every build plus
`vX.Y.Z` on releases; `develop`, `main` and `latest` move.

**Download instead of signing up.** The hosting signup can hand a visitor a ready-to-run bundle
instead of creating a tenant: `config.json`, `docker-compose.yml`, `.env`, `Caddyfile` and a
`README.md`, written client-side by `apps/web/src/features/hosting-signup/self-host-bundle.ts` as
a hand-written STORE-format (uncompressed) ZIP, deliberately avoiding a zip dependency in the
monorepo. That branch never calls `createTenant`, so the free self-host path costs no tenant row.

***
## Docker

You can use official `ecency/vision-web:latest` image to run Vision locally, deploy it to staging or even production environment. The simplest way is to run it with following command:

```bash
docker run -it --rm -p 3000:3000 ecency/vision-web:latest
```

Configure the instance using following environment variables:

- ~~`USE_PRIVATE`~~ See extended configuration above.

```bash
docker run -it --rm -p 3000:3000 -e USE_PRIVATE=1 ecency/vision-web:latest
```

### Swarm

You can easily deploy a set of vision instances to your production environment, using the example `apps/web/docker-compose.yml` file. Docker Swarm will automatically keep it alive and load balance incoming traffic between the containers. These files define the ENTIRE `vision` stack (web, `vapi`, `seocron`, redis), so a deploy resets every service's spec:

```bash
docker stack deploy -c apps/web/docker-compose.yml -c apps/web/docker-compose.production.yml vision
```

***
## Contributors

[![Contributors](https://contrib.rocks/image?repo=ecency/vision-web)](https://github.com/ecency/vision-web/graphs/contributors)


***

## Pushing new code / Pull requests

- Make sure to branch off your changes from `develop` branch.
- Make sure to run `pnpm test` and add tests to your changes.
- Make sure new text, strings are added into `en-US.json` file only.
- Code on!

### Note to developers

- Make PRs more clear with description, screenshots or videos, linking to issues, if no issue exist create one that describes PR and mention in PR. Reviewers may or may not run code, but PR should be reviewable even without running, visials helps there.
- PR should have title WIP, if it is not ready yet. Once ready, run `pnpm test` and update all tests, make sure linting (`pnpm lint`) also done before requesting for review.
- Creating component?! Make sure to create simple tests, you can check other components for examples.
- Always make sure component and pages stay fast without unnecessary re-renders because those will slow down app/performance.
-

***
## Issues

To report a non-critical issue, please file an issue on this GitHub project.

If you find a security issue please report details to: security@ecency.com

We will evaluate the risk and make a patch available before filing the issue.

[//]: # "LINKS"
[ecency_vision]: https://ecency.com
[ecency_alpha]: https://alpha.ecency.com
[ecency_release]: https://github.com/ecency/vision-web/releases
