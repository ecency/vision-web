# Web origin nginx config

The vhosts that serve ecency.com from the two origins. They were edited by hand on each
box until now, which meant a change was invisible to review, the two origins drifted from
each other, and a host rebuild lost the lot.

This mirrors `apps/self-hosted/hosting/origin/`, which does the same job for the
blog-hosting origin. Read that README too: the contract is the same one.

## The contract, because this repository is PUBLIC

**Structure is committed. Numbers and addresses are not.**

Anything that tells a reader where a limit sits, or which addresses are trusted, stays on
the host and is pulled in with a wildcard `include`, so that a missing file fails closed
rather than silently serving with no protection.

| file | lives | why not here |
|---|---|---|
| `rate-limits.conf` | `/etc/nginx/` **only** | the request-rate thresholds. Committing them would say exactly where the line is and how to sit under it |
| `conn-limits.conf` | `/etc/nginx/` **only** | the concurrency ceiling, for the same reason |
| `verified-crawlers.conf` | `/etc/nginx/` **only** | crawler source addresses |
| `newsletter-relay-allow.conf` | `/etc/nginx/` **only** | who may reach the newsletter service, see the hosting origin README |

What IS committed and deliberately so:

- `proxy_pass` targets, which are loopback only and reachable by nothing off-box. The
  hosting origin already commits the same shape.
- `burst=` values on `limit_req`. A burst is meaningless without the rate it bursts
  against, and the rates are not here. Effective limits are discoverable by anyone
  willing to send a dozen requests and count the 429s, so hiding the shape buys nothing
  while costing reviewability.
- bot-detection patterns, which are public crawler names.

**Comments count as published.** A threshold quoted in a comment is as disclosed as one in
a directive, so the vhost comments name the include rather than the number. The audit
reads comments for exactly this reason: an earlier version stripped them and reported a
clean run while every rate sat in prose two lines above.

## What these files depend on

The vhosts reference things defined at `http` level in `/etc/nginx/nginx.conf`, which is
not tracked here because it is mostly stock. A rebuilt origin needs these to exist before
the vhosts will load:

- `map $http_user_agent $is_slow_bot` and `map $is_slow_bot$http_cf_connecting_ip $bot_limit_key`
- `geo $http_cf_connecting_ip $is_verified_crawler` and `map $is_verified_crawler $rl_ssr_key`
- `include /etc/nginx/rate-limits*.conf;` placed AFTER those maps, since the zones use the
  variables they define
- the `apicache` and SSR `proxy_cache_path` entries
- `map $cookie_active_user $skip_cache` and the other cache-decision maps

## Restoring an origin

```bash
# 1. the parts that are not in git, first, so nothing serves unprotected
#    (rate-limits.conf, verified-crawlers.conf, newsletter-relay-allow.conf)

# 2. the vhost for this origin
cp infra/origin/eu.ecency.com.conf /etc/nginx/sites-enabled/eu.ecency.com   # or us

# 3. verify BEFORE reloading
nginx -t && systemctl reload nginx
```

Never test with a scratch config that omits the `user` directive: doing that once reset
`/var/lib/nginx` ownership and the whole site answered 200 with an empty body.

## Keeping the two origins in step

EU and US are separate machines with near-identical vhosts. A change to one is almost
always a change to both, and the limit on the newsletter subscribe path is a worked
example of why: while only one origin had it, the protection was bypassable simply by
being routed to the other.

The files here differ only where they must. Diff them before assuming a difference is
intentional.
