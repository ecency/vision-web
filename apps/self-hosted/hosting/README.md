# Ecency Managed Hosting Platform

Multi-tenant hosting infrastructure for Ecency self-hosted blogs.

## Architecture Overview

```
                                   ┌─────────────────────────────────────┐
                                   │         DNS (Cloudflare)            │
                                   │  *.blogs.ecency.com → Load Balancer │
                                   │  Custom domains → CNAME validation  │
                                   └──────────────────┬──────────────────┘
                                                      │
                                   ┌──────────────────▼──────────────────┐
                                   │          Edge nginx (host)           │
                                   │  - SSL termination (Let's Encrypt)   │
                                   │  - Routing by hostname               │
                                   │  - Rate limiting                     │
                                   └──────────────────┬──────────────────┘
                                                      │
              ┌───────────────────────────────────────┼───────────────────────────────────────┐
              │                                       │                                       │
    ┌─────────▼─────────┐                ┌───────────▼───────────┐              ┌────────────▼────────────┐
    │   Blog Instance   │                │    Blog Instance      │              │    Hosting API          │
    │   (nginx + SPA)   │                │    (nginx + SPA)      │              │    (Node.js / Hono)     │
    │                   │                │                       │              │                         │
    │ alice.blogs.ec... │                │ bob.blogs.ecency...   │              │ api.blogs.ecency.com    │
    │ config: alice.json│                │ config: bob.json      │              │                         │
    └───────────────────┘                └───────────────────────┘              └────────────┬────────────┘
                                                                                              │
                                                                           ┌──────────────────┼──────────────────┐
                                                                           │                  │                  │
                                                                  ┌────────▼────────┐ ┌───────▼───────┐ ┌────────▼────────┐
                                                                  │   Config DB     │ │     Redis     │ │ HBD Payment     │
                                                                  │  (PostgreSQL)   │ │               │ │   Listener      │
                                                                  │                 │ │               │ │                 │
                                                                  │ - Tenant configs│ │ - Cache       │ │ - Watch txs     │
                                                                  │ - Subscriptions │ │ - Rate limits │ │ - Auto-renew    │
                                                                  │ - Custom domains│ │ - Pub/sub     │ │ - Receipts      │
                                                                  └─────────────────┘ └───────────────┘ └─────────────────┘
```

Custom-domain verification is an API route (`api/src/routes/domains.ts`, backed
by `api/src/services/domain-service.ts`), not a service of its own. Certificates
and per-domain vhosts are issued by `origin/sync-custom-domains.py` on the
origin host every five minutes, outside the compose stack.

## Components

### 1. Edge nginx (host)
- Handles all incoming traffic
- Routes by hostname to the blog container or the hosting API
- Let's Encrypt wildcard cert for `*.blogs.ecency.com`
- Lives in `origin/`, applied by hand rather than by CI

### 2. Blog Instances
- Shared static SPA assets
- Per-tenant config.json
- Served via nginx

### 3. Hosting API
- Tenant management (CRUD)
- Subscription handling
- Config generation
- Domain verification

### 4. HBD Payment Listener
- Monitors Hive blockchain for payments
- Activates/renews subscriptions
- Sends notifications

### 5. Static SEO writer

A five-minute loop inside the hosting API (`api/src/index.ts`) writes
`<tenant>.robots.txt`, `<tenant>.sitemap.xml` and `<tenant>.rss.xml` into the
shared `tenant-configs` volume; nginx serves them per tenant by `try_files`
(`nginx-multi-tenant.conf`). It first runs 30 seconds after boot, so it never
blocks startup. A `seoSyncRunning` flag keeps two passes from overlapping. It
runs on its own timer rather than inside the config sync deliberately: a slow
feed walk must not hold up a config publish.

Feeds are assembled by PAGING the bridge at limit 20
(`api/src/services/seo-files.ts`). The bridge asserts `limit` into [1:20] and
ERRORS above it, so a single `limit=100` call once failed every tenant's pass;
the walk now carries one 30s budget on top of the per-call timeout, so a slow
chain costs a bounded pass rather than page count times the timeout.

### 6. Per-post metadata (SSI)

The blog nginx serves `index.html` with `ssi on` and resolves an include
against `location = /__tenant-meta`, which proxies to
`http://hosting_api/v1/meta/$tenant_id?uri=$request_path` with
`proxy_cache_key "meta:$tenant_id:$request_path"`, a 1s connect timeout and a
4s read timeout, plus
`error_page 404 429 500 502 503 504 = /__tenant-meta-static` falling back to
`/configs/$tenant_id.meta.html` then the bundled `/meta.html`. So a post URL
unfurls with the post's own title, excerpt and cover image while every other
route keeps the tenant-level snippet. Serving pages never depends on the API
being up. The server side is `api/src/routes/meta.ts` plus
`api/src/services/post-meta.ts`.

## Composing a config without a tenant

`POST /v1/tools/compose-config` composes a config document for an INDEPENDENT
deployment, using the same builder the managed signup uses. It creates nothing:
no tenant row, no reservation, no published config, no payment lock. It is
anonymous. It is rate-limited to 20 calls a minute (`composeLimit` in
`api/src/routes/tools.ts`) and it strips the served-only markers via
`withoutServedOnlyMarkers`:

- `configuration.instanceConfiguration.managed` is the only signal an instance
  has that it is hosted here. On someone else's domain it would flip the
  Configuration Editor from Download to Save, with that Save calling a hosting
  API that is not theirs.
- `.template` replaces the whole site with the claim landing page.
- `.claimPreview` marks the read-only preview of an unclaimed subdomain.
- `configuration.general.hivesigner.clientId` may be Ecency's own app, which
  only answers to redirect URIs registered for Ecency's domains.

A block emptied by the strip is pruned one level, so `general.hivesigner` with
no client id does not survive as an empty object reading like a deliberately
blank app id. The prune stops there on purpose; cascading all the way up would
delete `general` and then `configuration` itself.

The endpoint also enforces the rule the managed create path enforces: a
`hive-NNNN` name IS a community whatever the body claims, with the subdomain
required to equal the community id.

## Deployment Models

### Model A: Shared Container (Recommended for Scale)
All tenants share a single nginx container with dynamic config routing.

```
┌─────────────────────────────────────┐
│           Nginx Container            │
│  /usr/share/nginx/html/             │
│  ├── index.html (shared SPA)        │
│  ├── static/ (shared assets)        │
│  └── configs/                       │
│      ├── alice.json                 │
│      ├── bob.json                   │
│      └── carol.json                 │
│                                     │
│  Config routing via $host header    │
└─────────────────────────────────────┘
```

### Model B: Container Per Tenant (NOT IMPLEMENTED)
Recorded as the alternative that was rejected. The stack runs Model A; nothing
provisions a per-tenant container.

Each tenant gets their own container. Higher resource usage but better isolation.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Alice     │  │    Bob      │  │   Carol     │
│  Container  │  │  Container  │  │  Container  │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Files

- `docker-compose.yml` - Full hosting stack
- `nginx-multi-tenant.conf` - Multi-tenant nginx config (a file, not a `nginx/` directory)
- `default-config.json` - Config served for a subdomain with no tenant
- `api/` - Hosting management API
- `db/` - Schema and migrations
- `scripts/` - Utility scripts
- `origin/` - Host-level config (edge vhost, certificates). Applied by hand,
  never by CI; see its README.
- `traefik/` - **Unused.** Traefik is not in the stack and nothing loads
  this. Note before wiring it in: `dynamic/middlewares.yml` sets
  `X-Robots-Tag: noindex, nofollow` on every response, which would deindex
  every tenant blog.

CI copies only `docker-compose.yml`, `nginx-multi-tenant.conf`,
`default-config.json` and `db/*` to the host, so adding a file beside them
does not deploy it, and editing one of them on the host is reverted by the
next deploy.

## Quick Start

```bash
# Start the hosting platform
docker-compose up -d

# Add a new tenant
./scripts/add-tenant.sh alice

# Check tenant status
curl -s https://api.blogs.ecency.com/v1/tenants/alice/status
docker logs ecency-hosting-api
```

## Hivesigner redirect URIs

Hivesigner matches an OAuth callback with `redirect_uris.includes(callback)` against the app
account's on-chain `posting_json_metadata`. Exact string match, no wildcards, so an instance whose
`/auth` URI is not listed verbatim cannot complete a Hivesigner login. The self-hosted app hides the
method when the instance has no usable client, which is why hosted blogs currently offer Keychain
and HiveAuth only.

Registration and enablement are one operation, run on a schedule by
`scripts/hivesigner-redirect-uris.py`. Each pass:

1. reads the live tenants and the account's current array,
2. appends whatever is missing (`account_update2`, posting authority),
3. confirms the additions are actually on chain,
4. asks the hosting API to reconcile every tenant's `general.hivesigner.clientId`.

**Where the key lives.** Step 2 is the only step that signs, and it does not happen in this
service. The hosting API is internet-facing, holds tenant and payment data, and has never held a
key of any kind; it is not going to acquire one so that a scheduled job can be saved a hop. The
job runs on the host that already runs the key-holding scheduled services, and the API's part of
the work is read-only: it fetches the account itself and writes a client id only for a tenant
whose URIs it has confirmed for itself. `api/src/no-signing-capability.test.ts` fails the build if
anything in the API imports a signing primitive.

**Why the two halves cannot disagree.** A client id on an instance whose URI is not registered is
a login button that leads to an error page with no explanation, which is the state #1317 exists to
prevent. So nothing writes a client id except `POST /v1/internal/hivesigner/reconcile`, and that
endpoint reads **no request body at all**: what it enables is decided from the on-chain array and
from each tenant's own row. Holding the shared secret is not enough to enable an unregistered
instance, and neither is a bug in the script.

- **A failed broadcast leaves nothing set.** The additions are confirmed by re-reading the account
  before anything is enabled, and the reconcile independently refuses any tenant whose URIs it
  cannot find on chain.
- **A run that dies between the two halves repairs itself.** The reconcile runs every pass, not
  only after a broadcast, so a pass that registered a URI and then died enables it on the next
  tick with nobody told.
- **An unreadable account writes nothing.** Metadata that fails to parse is an error, never an
  empty registration; treating it as empty would withdraw the login method from every tenant at
  once on one bad RPC response.
- **Overlapping runs are prevented** by a lock file, and would be harmless anyway: every pass
  merges onto whatever is on chain at the time and never removes an entry.
- **A config save racing the reconcile cannot lose.** The listing the pass iterates is a
  snapshot, so each tenant's row is re-read `FOR UPDATE` and the decision is taken again from
  it, inside the transaction that then writes. Without that, an owner saving their own
  Hivesigner app in that window would have it overwritten with the shared one and never
  restored, and a custom domain verified in that window would be enabled on one origin while
  the other was still unregistered.
- **The served file cannot go stale either.** The same hazard applies one step later: a row
  committed a moment ago is the wrong thing to write to disk if something else committed after
  it. Both writers of a tenant's file publish by name through `publishConfigFile`, which
  re-reads inside the per-tenant write lock, so the file always ends up carrying the newest
  committed config whichever order they land in. A file and a row that disagree are worse than
  either being stale on its own, because the row no longer explains what readers are served.

Report only, writing the payload someone else would broadcast (unchanged behaviour, no key
needed):

```
DATABASE_URL=... ./scripts/hivesigner-redirect-uris.py
```

Unattended, which is what the timer runs:

```
./scripts/hivesigner-redirect-uris.py --broadcast \
  --key-file <path> --api-base <hosting api> --internal-secret-file <path>
```

`--broadcast` refuses to start without all three, because registering without enabling leaves the
work invisible and enabling without registering is the broken button.

Notes:

- Existing entries are never dropped, so a URI added by hand for something outside this script's
  view survives. Entries that are registered but no longer live are reported for review rather than
  removed.
- Only `active` tenants are registered, matching the only status the API will write a client id
  for. An unverified custom domain is skipped, since registering a domain someone merely claimed
  would let whoever controls that name receive callbacks for the app.
- A tenant with a verified custom domain needs **both** its URIs registered before the method is
  enabled. One config file serves both origins and the SPA builds its `redirect_uri` from
  `window.location.origin`, so enabling on one would give every visitor on the other a button that
  fails.
- An owner who configured their own Hivesigner app is never touched. Only the shared client id is
  managed, in both directions.
- The payload carries the account's whole existing profile, which on an app account includes its
  secret. Do not paste it into a shared terminal, and delete the file afterwards.

### Installing the scheduled job

`hivesigner-redirect-uris.service` and `.timer` are the unit definitions; nothing in CI installs
them. On the host that holds the key:

1. Create an unprivileged user for it and a working directory; copy
   `hivesigner-redirect-uris.py` there.
2. Make a virtualenv beside it with `psycopg[binary]` (tenant list) and `lighthive` (signing).
   `lighthive` serialises through the node's own `get_transaction_hex`, so nothing here carries a
   client-side operation table that could fall behind the chain.
3. Put the posting key and the hosting API's internal secret in separate **mode 0600** files owned
   by that user. The script refuses to read either if group or other can. They are passed as paths,
   never as environment variables, so they do not appear in `systemctl show`, the journal, or
   `/proc/<pid>/environ`.
4. Put `DATABASE_URL` and `HOSTING_API_BASE` in the unit's `EnvironmentFile`.
5. Add the job's address to the API's internal allowlist (`hosting-internal-allow.conf` on the
   origin, and `HOSTING_INTERNAL_ALLOWED_IPS` if it is set) **before** enabling the timer, or every
   reconcile returns 403. See `origin/README.md`.
6. Install both units, then `systemctl enable --now hivesigner-redirect-uris.timer`.

Check it with `systemctl list-timers hivesigner-redirect-uris` and
`journalctl -u hivesigner-redirect-uris`. A pass that found nothing to do prints `nothing to add`
and the reconcile summary; that is the steady state.

The interval is five minutes, matching the two loops a new instance already waits on (the API
regenerates served configs every five minutes, the origin issues certificates and vhosts every
five). A blog is not finished arriving before those have run, so a shorter interval would not make
the login button appear any sooner, and a longer one would be the only thing its owner was still
waiting for. A pass with nothing to do costs one query, one RPC read and one local API call; a
broadcast happens only when an instance is genuinely unregistered.
