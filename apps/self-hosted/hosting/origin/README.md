# Origin configuration for managed blog hosting

Config that lives on the machine terminating TLS for `*.blogs.ecency.com`, kept here so it
is reviewable and restorable rather than existing only on that box.

**Nothing here is deployed automatically.** The CI job copies only `docker-compose.yml`,
`nginx-multi-tenant.conf`, `default-config.json` and `db/*` from the parent directory.
These files need root and an nginx reload, and a bad edit takes every hosted blog offline,
so they are applied by hand via `install.sh`. That means the box stays the source of truth
in practice — **re-copy any change made there back into this directory.**

## Files

| file | on the origin | purpose |
|---|---|---|
| `blogs.ecency.com.conf` | `/etc/nginx/sites-available/` | TLS termination and proxying for the apex, the API, and tenant subdomains |
| `sync-custom-domains.py` | cron, every 5 min | issues certificates and writes vhosts for custom domains and dotted tenant names |
| `install.sh` | once, idempotent | nginx include dir, certbot deploy hook, cron entry |
| `hosting-internal-allow.conf` | `/etc/nginx/` **only** (not in git) | who may reach `/v1/internal` |

## What the sync does

1. Reads verified custom domains of active pro tenants from the hosting DB (read-only),
   plus any tenant whose Hive account name contains a dot.
2. Confirms the host resolves to this origin before asking for a certificate, which keeps
   domains pointed elsewhere from burning Let's Encrypt failure limits.
3. Issues via HTTP-01 webroot and writes a vhost that proxies to the blog container with
   `X-Tenant-Id` set.
4. Removes vhosts and stops renewing certificates for anything no longer in the DB, then
   reloads nginx if something changed. A vhost that fails `nginx -t` is quarantined as
   `.broken` rather than wedging every later reload.

## origin-ips (not in git)

The DNS check above needs this origin's own addresses. They are read from an `origin-ips`
file next to the script — one per line, `#` comments allowed — or from
`HOSTING_ORIGIN_IPS` as a comma-separated override.

They are not committed because this repository is public and those addresses sit behind
Cloudflare; publishing them would amount to handing out an origin-bypass list. The script
exits with an explanatory error when the file is missing, rather than silently failing
every DNS check and never issuing a certificate again.

## hosting-internal-allow.conf (not in git)

`/v1/internal` activates subscriptions, attaches custom domains and grants free Pro terms.
It is service-to-service only, so the vhost restricts it to the services that call it:

```nginx
location /v1/internal/ {
    include /etc/nginx/hosting-internal-allow*.conf;
    deny all;
    ...
}
```

The list itself is not committed, for the same reason `origin-ips` is not: this repository is
public and these are origin addresses.

**What belongs in the file.** One `allow` directive per line, terminated with a semicolon,
nothing else. Plain addresses and CIDR both work:

```nginx
# <who and why>
allow 203.0.113.10;      # example only, not a real entry
allow 198.51.100.0/24;   # example only, not a real entry
```

Everything not listed is refused by the `deny all` that follows the include. Who needs to be
on it: every origin that runs the web app's `/api/hosting/*` server routes (one of them is
co-located with this stack and arrives on the local docker bridge, so that is a range rather
than a single address), and the ePoints host that posts card activations. Read them off the
access log rather than guessing - `awk '$7 ~ /^\/v1\/internal/'` over `access.log*` gives the
requests that have actually been made; take the peer column (the first field with the stock
`combined` format, the third with the `realip` format this origin uses, since that one leads
with `$http_cf_connecting_ip`). Adding 127.0.0.1 as well is convenient for on-box
diagnostics.

**Why the include path has a `*` in it.** nginx refuses to start on an `include` naming a
file that does not exist:

```
nginx: [emerg] open() "/etc/nginx/hosting-internal-allow.conf" failed (2: No such file
or directory) in /etc/nginx/sites-enabled/blogs.ecency.com.conf:67
```

That is a hard failure of the whole config, so a vhost with a plain include would take every
tenant blog offline on any box where the file has not been created yet, including a rebuilt
origin. A glob that matches nothing is skipped silently and the config still tests clean, so
the worst case degrades to `deny all` on `/v1/internal` alone while everything else serves.
Do not "tidy" the `*` away.

**Both API prefixes are gated.** The vhost also exposes the API under `/hosting/`, which
strips its prefix, so `/hosting/v1/internal/...` reaches the same handlers. There is a second
location for that path with the same include. If you ever add another prefix that proxies to
the hosting API, it needs the same treatment.

### Applying it

Order matters: create the allowlist first, or the window between reloading nginx and writing
the file is a window where card activation and Pro blog claims return 403.

```bash
# 1. Write the allowlist (root, 0644, world-readable so the nginx workers can read it)
sudo install -m 0644 /dev/null /etc/nginx/hosting-internal-allow.conf
sudo nano /etc/nginx/hosting-internal-allow.conf      # allow ...;  one per line

# 2. Back up the live vhost, then copy the new one in
sudo cp /etc/nginx/sites-available/blogs.ecency.com.conf{,.bak}
sudo cp blogs.ecency.com.conf /etc/nginx/sites-available/blogs.ecency.com.conf

# 3. Test BEFORE reloading. A failed test here means nothing has changed yet.
sudo nginx -t && sudo systemctl reload nginx
```

Verify from a host that should be allowed and one that should not. A refused caller gets a
bare nginx 403; an allowed one gets whatever the API says (405/404 for a GET on these
POST-only routes is a pass - it means the request reached the container):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.blogs.ecency.com/v1/internal/activate
curl -s -o /dev/null -w '%{http_code}\n' https://api.blogs.ecency.com/hosting/v1/internal/activate
```

Refusals are logged as `access forbidden by rule` in `/var/log/nginx/error.log`, with the
client address - that is where to look when a legitimate caller starts failing.

### Rolling back

Adding an address is a reload, not a rollback:

```bash
sudo nano /etc/nginx/hosting-internal-allow.conf && sudo nginx -t && sudo systemctl reload nginx
```

To drop the restriction entirely and go back to the previous behaviour:

```bash
sudo cp /etc/nginx/sites-available/blogs.ecency.com.conf.bak \
        /etc/nginx/sites-available/blogs.ecency.com.conf
sudo nginx -t && sudo systemctl reload nginx
```

Do **not** roll back by deleting the allowlist file: the vhost still has `deny all`, so that
refuses everyone rather than restoring service. If the backup is gone, the equivalent
emergency fix is a temporary `allow all;` as the only line in the allowlist file, followed
by a reload - it neutralises the check without editing the vhost.

### The container-side allowlist is separate

`HOSTING_INTERNAL_ALLOWED_IPS` in the hosting stack's `.env` is the same restriction enforced
inside the API, for traffic that reaches the container without passing through here. It is
unset by default and allows everything until it is set; it takes the same comma-separated
addresses and CIDRs. Restart `hosting-api` after setting it.

Two differences from this file, both worth knowing before copying values across:

- **Give it the caller addresses, not `127.0.0.1`.** A request proxied from here arrives at the
  container from the docker bridge, which the API recognises as a trusted proxy and therefore
  judges on the `X-Real-IP` this vhost set, meaning the real caller. Loopback is never the
  identity being matched, so an entry for it does nothing there. It stays useful *here*, where
  it is what lets an on-box `curl --resolve api.blogs.ecency.com:443:127.0.0.1 ...` through.
- **It cannot see a process on the origin itself.** Anything local can reach the API's
  published port directly, and that is indistinguishable from this vhost doing the same. What
  it does stop is a caller that is neither: another container on the compose network, which
  arrives as its own address and is checked as itself. This vhost is the gate for everything
  arriving over the network, and the shared secret is what stands behind both.

Because the API believes `X-Real-IP` for proxied requests, it stays correct only as long as
these locations keep setting that header.

## Two things in the vhost that are load-bearing

- **`location /.well-known/acme-challenge/` on port 80.** Without it the block below
  redirects to HTTPS, and a host with no certificate yet can never obtain one — the
  challenge follows the redirect into a certificate that does not cover it. Dotted Hive
  account names depend on this: a wildcard certificate matches exactly one label, so
  `alice.dev.blogs.ecency.com` needs its own.
- **`proxy_set_header X-Tenant-Id ""` on the tenant vhost.** Only the generated
  custom-domain vhosts are entitled to set that header. Clearing it here stops a client
  supplying its own, which would otherwise reach the container's tenant lookup.

## Notes

- Domains under `ecency.com` are refused regardless of what the DB says.
- Removal is driven by the domain leaving the DB, never by a failed DNS lookup. A lookup
  failure only holds back a first issuance. This matters because `getaddrinfo` errors are
  indistinguishable from "points somewhere else", so treating them as removal meant a
  resolver blip could delete a live vhost and its certificate.
- A domain that stops resolving here keeps its vhost, which is harmless once traffic no
  longer arrives, and simply fails to renew until it lapses.
- Renewals run from `certbot.timer`; the deploy hook reloads nginx, which also closes a
  pre-existing gap where the wildcard renewed but nginx kept serving the old certificate.
