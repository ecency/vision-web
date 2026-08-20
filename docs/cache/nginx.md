# Nginx Cache Alignment

Nginx (`ssrcache` zone) sits between the CF worker and vision_web. It runs on each
origin server (EU and US; the asia origin was decommissioned). Because the worker has
already keyed on auth-class and only forwards cacheable requests, **nginx
does NOT need to gate on `active_user` cookie itself** — origin's
`Cache-Control` is the source of truth.

## Cache zone

```nginx
proxy_cache_path /var/cache/nginx/ssr levels=1:2
                 keys_zone=ssrcache:200m
                 max_size=32g
                 inactive=2h;
```

- `keys_zone=200m` — supports ~1.6M keys (~125 bytes each)
- `max_size=32g` — total disk; LRU evicts beyond this
- `inactive=2h` — entries not accessed in 2 hours are evicted regardless of
  s-maxage. Picked as a compromise between honoring the policy intent (some
  tiers want 30d) and bounding edit-staleness for long-tail content. A
  separate `last_update`-based invalidation system would be required to
  honor full s-maxage safely.

## Per-host config

### The bot map is CANONICAL here — do not remove it

⛔ This block is **not** documentation of the config, it IS a copy the test suite reads.
`apps/web/src/specs/features/next-middleware/social-bot-metadata.spec.ts` parses it out of
this file and asserts term-for-term parity with `htmlLimitedBots` in `next.config.js`. The
two drifting is invisible in dev, where nothing is cached, and in production means a page
primed by a browser is served to a crawler from the wrong cache namespace with streamed
metadata (#1257). Keep the fenced `nginx` block and the `"~*( … )"` shape — the test matches
on them.

The live definition sits at `http` level in `/etc/nginx/nginx.conf`, which is not tracked.

```nginx
map $http_user_agent $html_limited_bot {
  default "";
  "~*(Googlebot|[\w-]+-Google|Google-[\w-]+|googleweblight|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|TelegramBot|WhatsApp|SkypeUriPreview|Yeti)" "|htmlbot";
}
```

### The rest of the vhost is tracked, so read it there

⛔ **Read `infra/origin/eu.ecency.com.conf` and `us.ecency.com.conf` rather than a snippet
here.** This section used to carry a
hand-copied `server { … }` block, which drifted and began contradicting the real config
— it showed `add_header X-Cache-Tier $upstream_http_x_cache_tier always;`, which the
tracked file explicitly forbids because the upstream already sets that header and nginx
proxies it through, so adding it emitted the header **twice on every response**. It also
showed `always` on `X-Cache-Status`, which the real config deliberately omits: that value
is a cache diagnostic, not something we owe an error response.

What matters conceptually, and is stable:

```nginx
proxy_cache      ssrcache;
proxy_cache_key  "$request_uri$html_limited_bot";   # see the next section
proxy_cache_valid 200 0;                            # defer to origin Cache-Control
proxy_cache_valid any 30s;
proxy_cache_use_stale updating error timeout http_500 http_502 http_503 http_504;
proxy_cache_background_update on;
proxy_cache_lock on;
```


## Why the bot UA class is in the cache key

`htmlLimitedBots` in `apps/web/next.config.js` makes Next.js render metadata
(title, description, og:*, canonical) into `<head>` for crawlers that do not
execute JavaScript, and for Googlebot. Every other client gets **streaming
metadata**, where those tags are emitted far down the body instead. Googlebot
renders JS and reads a streamed title or robots tag, but it does not register a
streamed `rel=canonical`, so it is on the list as well (see the comment on
`htmlLimitedBots` in `next.config.js`).

That means one URL has two legitimate response shapes. Keying the SSR cache on
`$request_uri` alone let them share a single entry — and since real users vastly
outnumber crawlers, the streamed variant is the one that got stored and then
served to the very bots the setting exists for. `htmlLimitedBots` was effectively
inert. It also failed the other way: a bot-primed entry served `<head>` metadata
to browsers.

`$html_limited_bot` splits them into two namespaces.

Notes for anyone touching this:

- **The default must stay empty.** Non-bot keys are then byte-identical to the
  old key, so deploying the change does not invalidate the existing cache or
  stampede the origin.
- **The match must be case-insensitive** (`~*`). Next.js rebuilds the pattern as
  `new RegExp(htmlLimitedBots, 'i')`, so it matches lowercase `bingbot` no matter
  what flags the config regex carries. A case-sensitive match here would put
  `bingbot` and `Bingbot` in one namespace while Next.js treated them as
  different, reintroducing the bug for whichever spelling lost the race.
- **The UA list is duplicated** between `next.config.js` and this nginx map. The
  config is the source of truth; keep them in sync.
- **Do not "simplify" this by making metadata blocking for everyone.** Blocking
  delays the first byte until `generateMetadata` resolves. Measured on cold
  renders that is hundreds of milliseconds to several seconds, versus tens of
  milliseconds when streaming. TTFB is the dominant term in content-page LCP, so
  the one-line version of this fix is a significant real-user regression.

## Why no cookie in cache key

The CF worker keys on `https://cache.internal/<authClass><path><query>`
where `authClass` ∈ `{anon, loggedin}`. Nginx is downstream of the worker
and never sees both auth classes — the worker has already split traffic.
Including `$cookie_active_user` in the nginx cache key would just create a
3rd-level fragmentation that doesn't help.

For the rare case of nginx being hit directly (e.g. internal monitoring,
direct origin access bypassing CF), the response is still safe because
origin's middleware emits the right Cache-Control regardless of how the
request arrived.

## Verification

Hit nginx directly (its listen port, with the right `Host:` header) to
isolate the nginx + middleware layers from CF. Going through port 3000
would bypass nginx and exercise only the upstream Next.js process —
useful for middleware-only checks but won't show `X-Cache-Status`.
Browser sessions remain the right way to verify the full edge stack
end-to-end.

```bash
# Anon post page — second request should HIT in nginx ssrcache
curl -sI -H "Host: ecency.com" \
  "http://127.0.0.1/<community>/<author>/<permlink>" | grep -iE 'cache|tier'
# expect X-Cache-Status: MISS first, HIT on replay

# Logged-in (cacheable route) — origin emits public/s-maxage; nginx caches
curl -sI --cookie "active_user=alice" -H "Host: ecency.com" \
  "http://127.0.0.1/@<author>" | grep -iE 'cache|tier'
# expect Cache-Control: public ... s-maxage=300
# expect X-Cache-Status: MISS first, HIT on replay

# Logged-in (feed) — never cached, X-Cache-Status: BYPASS or MISS each time
curl -sI --cookie "active_user=alice" -H "Host: ecency.com" \
  "http://127.0.0.1/created" | grep -iE 'cache|tier'
# expect Cache-Control: private, no-store
# expect X-Cache-Tier: feed-created-loggedin
```

## Rollout

1. Apply config in staging, verify config test (`nginx -t`).
2. Reload via `systemctl reload nginx` (zero downtime).
3. Watch `$upstream_cache_status` distribution in access logs — HIT% should
   climb on cacheable routes within a few hours of warmup under normal load.
