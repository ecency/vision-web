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
                                   │        Load Balancer (Traefik)       │
                                   │  - SSL termination (Let's Encrypt)   │
                                   │  - Dynamic routing by hostname       │
                                   │  - Rate limiting                     │
                                   └──────────────────┬──────────────────┘
                                                      │
              ┌───────────────────────────────────────┼───────────────────────────────────────┐
              │                                       │                                       │
    ┌─────────▼─────────┐                ┌───────────▼───────────┐              ┌────────────▼────────────┐
    │   Blog Instance   │                │    Blog Instance      │              │    Hosting API          │
    │   (nginx + SPA)   │                │    (nginx + SPA)      │              │    (Node.js/Deno)       │
    │                   │                │                       │              │                         │
    │ alice.blogs.ec... │                │ bob.blogs.ecency...   │              │ api.ecency.com/hosting  │
    │ config: alice.json│                │ config: bob.json      │              │                         │
    └───────────────────┘                └───────────────────────┘              └────────────┬────────────┘
                                                                                              │
                                                                           ┌──────────────────┼──────────────────┐
                                                                           │                  │                  │
                                                                  ┌────────▼────────┐ ┌───────▼───────┐ ┌────────▼────────┐
                                                                  │   Config DB     │ │ HBD Payment   │ │ Domain Verify   │
                                                                  │  (PostgreSQL)   │ │   Listener    │ │    Service      │
                                                                  │                 │ │               │ │                 │
                                                                  │ - Tenant configs│ │ - Watch txs   │ │ - CNAME check   │
                                                                  │ - Subscriptions │ │ - Auto-renew  │ │ - SSL provision │
                                                                  │ - Custom domains│ │ - Receipts    │ │                 │
                                                                  └─────────────────┘ └───────────────┘ └─────────────────┘
```

## Components

### 1. Traefik (Edge Router)
- Handles all incoming traffic
- Dynamic routing based on hostname
- Automatic SSL via Let's Encrypt
- Wildcard cert for `*.blogs.ecency.com`

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

### Model B: Container Per Tenant (Isolation)
Each tenant gets their own container. Higher resource usage but better isolation.

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Alice     │  │    Bob      │  │   Carol     │
│  Container  │  │  Container  │  │  Container  │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Files

- `docker-compose.yml` - Full hosting stack
- `traefik/` - Traefik configuration
- `nginx/` - Multi-tenant nginx config
- `api/` - Hosting management API
- `scripts/` - Utility scripts

## Quick Start

```bash
# Start the hosting platform
docker-compose up -d

# Add a new tenant
./scripts/add-tenant.sh alice

# Check tenant status
./scripts/tenant-status.sh alice
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
