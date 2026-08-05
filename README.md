<a href="https://discord.gg/WywwJEu">![Discord](https://img.shields.io/discord/385034494555455488?label=Ecency%20discord&logo=discord)</a> <a href="https://x.com/ecency_official">![Twitter Follow](https://img.shields.io/twitter/follow/ecency_official?style=social)</a> <a href="https://github.com/ecency/vision-web/stargazers">![GitHub Repo stars](https://img.shields.io/github/stars/ecency/vision-web?style=social)</a>

# [Ecency vision][ecency_vision] – Ecency Web client

![ecency](https://ecency.com/assets/github-cover.png)

Immutable, decentralized, uncensored, rewarding communities powered by Hive.

Fast, simple and clean source code with Reactjs + Typescript.

## Website

- [Production version][ecency_vision] - master branch
- [Alpha version][ecency_alpha] - development branch

***

## Developers

Feel free to test it out and submit improvements and pull requests.

***

## Data Fetching and Broadcasting

### Data Fetching (Web + SDK)

The web app uses `@ecency/sdk` for data fetching. Requests are built with query option helpers and
sent to `CONFIG.privateApiHost`.

In the web app, `CONFIG.privateApiHost` is set to `""` in `apps/web/src/core/sdk-init.ts`, so
private API calls go to the current origin:

- `POST /private-api/*`
- `POST /search-api/*`

If you run the app against a different backend, update `NEXT_PUBLIC_APP_BASE` or override the SDK
host in `apps/web/src/core/sdk-init.ts`.

### Broadcasting (Web + SDK)

Broadcasting in the SDK is platform-agnostic. The SDK can:

- Sign transactions directly with private keys (built-in ECDSA secp256k1 transaction engine).
- Use a Hivesigner access token.
- Defer to an injected broadcaster for platform-specific signing (Keychain, HiveAuth, MetaMask Snap, mobile).

In the web app, `getSdkAuthContext` wires Keychain/HiveAuth:

```ts
import { getSdkAuthContext } from "@/utils";
import { useAccountUpdate } from "@ecency/sdk";

const auth = getSdkAuthContext(activeUser, activeUser?.username);
const { mutateAsync } = useAccountUpdate(activeUser?.username ?? "", auth);
await mutateAsync({ profile: { about: "..." } });
```

Wallet operations follow the same pattern:

```ts
import { useWalletOperation } from "@ecency/wallets";
import { getSdkAuthContext } from "@/utils";

const auth = getSdkAuthContext(activeUser, activeUser?.username);
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

### Important notes

**Logged-in users never see cached HTML.** Any request carrying the
`active_user` cookie receives `Cache-Control: private, no-store`. Nginx and
the CF worker bypass cache entirely for these requests.

**No `Vary: Cookie`.** Auth bifurcation happens at the infra layer (Nginx
cache key includes `$cookie_active_user`; CF worker bypasses on the cookie).
Emitting `Vary: Cookie` would fragment the edge cache on every unrelated
cookie (analytics, locale, experiments) and destroy hit ratio.

**Post pages use age-based TTLs.** Fresh posts (< 1 day) cache for 1 minute;
posts older than 60 days cache for 30 days. The middleware starts with a
conservative 1h tier, then refines once the post's `created` date is known
via a background-populated in-memory cache (per edge isolate).

**Observability header.** Every response carries `x-cache-tier: <tier>` (or
`logged-in`) so CF analytics, Nginx logs, and DevTools reveal which policy
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

Nginx and CF worker configs live in the infra repo, not here. The rules are
simple: **respect origin `Cache-Control`**, **bypass on `active_user`
cookie**, and **preserve `x-cache-tier`** in the response headers.


| Tier | `s-maxage` | `stale-while-revalidate` | Routes |
|---|---|---|---|
| `static` | 24h | 7d | `/faq`, `/about`, `/child-safety`, `/contributors`, `/privacy-policy`, `/terms-of-service`, `/whitepaper`, `/mobile` |
| `home` | 5m | 1h | `/` |
| `list` | 5m | 1h | `/discover`, `/communities`, `/witnesses`, `/tags` |
| `list-proposals` | 10m | 1h | `/proposals` |
| `feed` | 1m | 5m | `/hot`, `/trending`, `/payout`, `/muted`, `/promoted` + tags |
| `feed-created` | 30s | 2m | `/created`, `/tags/:tag` |
| `community` | 1m | 5m | `/:tag/hive-xxxxx` |
| `profile` | 5m | 1h | `/@author`, `/@author/posts`, `/blog`, `/comments`, `/replies`, `/communities`, `/insights` |
| `profile-feed` | 1m | 5m | `/@author/feed`, `/@author/trail` (aggregates other users' content) |
| `entry` | 1h | 1d | post pages (default — used until post age is known) |
| `entry-fresh` | 1m | 5m | posts < 1 day old |
| `entry-week` | 1h | 1d | posts 1-7 days old |
| `entry-month` | 1d | 7d | posts 7-30 days old |
| `entry-archive` | 30d | 7d | posts 30-60 days old |
| `entry-ancient` | 30d | 60d | posts > 60 days old |
| `no-cache` | 0 | 0 | `/publish`, `/chats`, `/auth/*`, `/wallet`, `/@author/settings`, etc. |


***

## Build instructions

##### Requirements

- `node ^18.17.x`
- [`pnpm`](https://pnpm.io/) (the repo is configured with `packageManager: pnpm@10.18.1`)

##### Clone

`$ git clone https://github.com/ecency/vision-web`

`$ cd vision-web`

### Working with pnpm

This repository is organised as a [pnpm workspace](https://pnpm.io/workspaces) with the web
application living in `apps/web` and shared packages located under `packages/*`. pnpm keeps a
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
| Build for production | `pnpm --filter @ecency/web build` | Builds the web app only.
| Start production server | `pnpm --filter @ecency/web start` | Runs the built web app.
| Lint all packages | `pnpm lint`                       | Executes `pnpm -r lint` defined in the root `package.json`.
| Test all packages | `pnpm test`                       | Executes `pnpm -r test` defined in the root `package.json`.

To run a script in every workspace package (for example, to build all libraries and apps), use the
recursive flag defined in the root scripts: `pnpm build` will run `pnpm -r build` across the
workspace.

##### Publishing packages

Packages in `packages/*` can be published individually. Use pnpm's filtering to target a specific
package:

```bash
pnpm --filter <package-name> publish --access public
```

Replace `<package-name>` with the actual package name declared in that package's `package.json`.
Make sure the package is built before publishing (`pnpm --filter <package-name> build`).

##### Edit config file or define environment variables

1. `$ cp .env.template .env`
2. Update values with your ones

##### Environment variables

- ~~`USE_PRIVATE` - if instance has private api address and auth (0 or 1 value)~~ Use extended configuration instead below.
- ~~`HIVESIGNER_ID`~~ – `NEXT_PUBLIC_HS_CLIENT_ID` – This is a special application Hive account. If unset, "ecency.app" is the account used.
- ~~`HIVESIGNER_SECRET`~~ – `NEXT_PUBLIC_HS_CLIENT_SECRET` – This is a secret your site shares with HIVE_SIGNER in order to communicate securely.
- ~~`REDIS_URL` - support for caching amp pages~~. Amp pages has been deprecated and will be removed by Google. Amp pages aren't longer supporting in Ecency vision. 

###### Hivesigner Variables

When setting up another service like Ecency with Vision software:

1. You may leave `NEXT_PUBLIC_HS_CLIENT_ID` and `NEXT_PUBLIC_HS_CLIENT_SECRET` environment variables unset and optionally set `USE_PRIVATE=1` and leave `NEXT_PUBLIC_APP_BASE` set to `https://ecency.com`. Your new site will contain more features as it will use Ecency's private API. This is by far the easiest option.
2. You may change `NEXT_PUBLIC_APP_BASE` to the URL of your own site, but you will have to set environment variables `NEXT_PUBLIC_HS_CLIENT_ID` and `NEXT_PUBLIC_HS_CLIENT_SECRET`; set `USE_PRIVATE=0` as well as configure your the `HIVESIGNER_ID` account at the [Hivesigner website.](https://hivesigner.com/profile). Hivesigner will need a `secret`, in the form of a long lowercase hexadecimal number. The HIVESIGNER_SECRET should be set to this value.

###### Hivesigner Login Process

In order to validate a login, and do posting level operations, this software relies on Hivesigner. A user @alice will use login credentials to login to the site via one of several methods, but the site will communicate with Hivesigner and ask it to do all posting operations on behalf of @alice. Hivesigner can and will do this because both @alice will have given posting authority to the `NEXT_PUBLIC_HS_CLIENT_ID` user and the `NEXT_PUBLIC_HS_CLIENT_ID` user will have given its posting authority to Hivesigner.

##### Edit "default" values

Default branding values can now be customized via environment variables without editing source files. Override any of the following in your `.env` file:

```
NEXT_PUBLIC_APP_BASE
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_APP_TITLE
NEXT_PUBLIC_APP_DESCRIPTION
NEXT_PUBLIC_TWITTER_HANDLE
NEXT_PUBLIC_APP_LOGO
NEXT_PUBLIC_IMAGE_SERVER
NEXT_PUBLIC_NWS_SERVER
```

If you are setting up your own website other than Ecency.com, set these variables to match your brand. There are also a lot of static pages that are Ecency specific.

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

See `src/config/vision-config.template.yml`.  

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

You can easily deploy a set of vision instances to your production environment, using example `docker-compose.yml` file. Docker Swarm will automatically keep it alive and load balance incoming traffic between the containers:

```bash
docker stack deploy -c docker-compose.yml -c docker-compose.production.yml vision
```

***
## Contributors

[![Contributors](https://contrib.rocks/image?repo=ecency/vision-web)](https://github.com/ecency/vision-web/graphs/contributors)


***

## Pushing new code / Pull requests

- Make sure to branch off your changes from `development` branch.
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
