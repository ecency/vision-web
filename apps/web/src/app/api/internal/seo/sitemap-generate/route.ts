/**
 * Internal cron route — regenerates the precomputed sitemap blobs in Redis
 * (read by the public /sitemap.xml + /sitemap/[shard] route handlers).
 * Secret-gated, POST-only, Node runtime. Reuses the *exact* in-process
 * isIndexable/canonicalTarget (single source of truth by construction).
 *
 * Bounded by design — never a corpus scan / never crashes a replica:
 *  - Hard wall-clock budget + max page cap on the `created` feed walk.
 *  - A rolling freshness set of the most-recent posts, regenerated hourly —
 *    bounded by whichever hits first: the ~48h cutoff, MAX_PAGES, or the
 *    time budget. In busy periods MAX_PAGES binds before 48h; that's fine
 *    (hourly regen keeps the head fresh — it's a discovery hint, not a
 *    complete archive).
 *  - Per-RPC try/catch: a failed page ends the walk and serves what we have.
 *  - Blacklist read fresh from Redis so just-flagged authors are excluded.
 *  - The reputation gate is applied from the author_reputation every ranked
 *    row already carries (no profile fetch, no fan-out). The post_count half
 *    of the page gate needs a profile and is not available here; reputation
 *    alone covers nearly every case, and SSR still applies both on crawl.
 */
import { getSeoRedisReady, SEO_REDIS_PREFIX } from "@/features/seo/seo-redis";
import { cronAuthorized, notFound } from "@/features/seo/cron-auth";
import { SITEMAP_SHARDS, OPERATOR_SHARDS } from "@/features/seo/sitemap-shards";
import { harvestPostTags, selectTopTags } from "@/features/seo/sitemap-tags";
import { isIndexable, canonicalTarget, isBelowReputationGate } from "@/utils/entry-indexability";
import { isNsfwCommunity } from "@/utils/nsfw-detection";
import { Entry } from "@/entities";
import defaults from "@/defaults";
// Hive-only entry: this is a server route handler — avoid pulling the
// React/react-query surface of the main SDK entry into it. `setNodes` is the
// same validated setter `ConfigManager.setHiveNodes` delegates to.
import { callRPC, setNodes, setUserAgent } from "@ecency/sdk/hive";
// App's curated RPC list (Ecency-first). The app applies this via
// ConfigManager in sdk-init, but App Router route handlers never execute the
// root layout, so sdk-init never runs here — configure the hive entry
// explicitly. Same file sdk-init feeds ConfigManager: one source of truth.
import publicNodes from "../../../../../../public/public-nodes.json";

export const dynamic = "force-dynamic";

const BASE = defaults.base;
const K = (s: string) => `${SEO_REDIS_PREFIX}sitemap:${s}`;
// Wall-clock backstop on the post walk, checked each page. 90s (was 50s): on
// slower upstream RPC nodes the 50s budget could truncate the walk before the
// 48h cutoff (reachedCutoff:false → only a partial freshness window published).
// 90s lets the walk reach the cutoff while staying inside the scheduler's
// curl --max-time even with a worst-case retrying trailing page
// (RPC_TIMEOUT_MS × (RPC_RETRY+1)).
const TIME_BUDGET_MS = 90_000;
// bridge.get_ranked_posts hard-caps `limit` at 20 — the RPC *rejects*
// anything higher with "limit = N outside valid range [1:20]" (confirmed
// against api.hive.blog; see packages/render-helper/scan-post-corpus.mjs).
// Walk paginates via start_author/start_permlink. 150 pages * 20 ≈ 3000
// most-recent posts, comfortably inside TIME_BUDGET_MS at ~0.2–0.3s/RPC.
const MAX_PAGES = 150;
const WINDOW_MS = 48 * 60 * 60_000;
const PAGE = 20;
// Tag hub shard: the top-N most-used tags seen in this walk, emitted as
// /created/<tag> (the canonical, internally-linked tag feed). TAG_MIN_COUNT
// drops one-off long-tail tags that aren't useful as standalone hub pages.
const TAGS_LIMIT = 200;
const TAG_MIN_COUNT = 2;
// Communities: a small, stable hub set (not a freshness walk). list_communities
// caps at 100/page → 5 pages ≈ top ~500 by rank. Cheap, independent of the
// post-walk time budget.
const COMM_PAGES = 5;
const COMM_LIMIT = 100;
// The community *list* changes slowly → re-fetch via list_communities at most
// weekly (names cached in Redis). The shard is still rebuilt every run from
// the cached names + fresh post-derived lastmod, so freshness stays hourly
// while the ~5 list_communities RPCs run only ~weekly.
const COMM_REFRESH_MS = 7 * 24 * 60 * 60_000;
const COMM_NAMES_KEY = `${SEO_REDIS_PREFIX}sitemap:communities:names`;
const COMM_BUILT_KEY = `${SEO_REDIS_PREFIX}sitemap:communities:builtAt`;
// Last accepted post count — the baseline for the stale-preserving guard so a
// budget/error-truncated walk can't overwrite a good posts/authors sitemap.
const POSTS_LASTGOOD_KEY = `${SEO_REDIS_PREFIX}sitemap:posts:lastgood`;
// Day (YYYY-MM-DD) the walk-derived shards were last *accepted*. Drives the
// sitemap-index <lastmod> for posts.xml/authors.xml when a walk is rejected,
// so a kept last-good blob doesn't advertise today's date to crawlers.
const POSTS_LASTGOOD_DAY_KEY = `${SEO_REDIS_PREFIX}sitemap:posts:lastgoodDay`;
// This is a background bulk paginated walk, not an interactive call: be more
// patient than the SDK's UI defaults (5s / retry 1 = only 2 nodes) so a
// momentarily slow/sick node fails over across more of the node list per page
// instead of bleeding the time budget. Worst case is bounded by TIME_BUDGET_MS
// (checked each iteration) + the seocron curl --max-time.
const RPC_TIMEOUT_MS = 8_000;
const RPC_RETRY = 4; // up to 5 nodes tried per page

interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

const esc = (s: string) =>
  s.replace(/[&<>'"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" })[c]!
  );

const urlset = (urls: SitemapUrl[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `<url><loc>${esc(u.loc)}</loc>` +
        (u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : "") +
        `</url>`
    )
    .join("\n") +
  `\n</urlset>\n`;

const indexXml = (children: { name: string; lastmod: string }[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  children
    .map(
      (c) =>
        `<sitemap><loc>${esc(`${BASE}/sitemap/${c.name}`)}</loc>` +
        `<lastmod>${esc(c.lastmod)}</lastmod></sitemap>`
    )
    .join("\n") +
  `\n</sitemapindex>\n`;

function normalize(p: Record<string, unknown>): Entry {
  const e = p as unknown as Entry;
  if (typeof e.json_metadata === "string") {
    try {
      e.json_metadata = JSON.parse(e.json_metadata);
    } catch {
      e.json_metadata = null;
    }
  }
  return e;
}

export async function POST(req: Request): Promise<Response> {
  if (!cronAuthorized(req)) return notFound();
  const redis = await getSeoRedisReady(5000);
  if (!redis) {
    return new Response(JSON.stringify({ error: "redis-unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Configure the hive entry with the app's curated (Ecency-first) RPC list
  // before any callRPC below. Idempotent and re-applied each run so a hot
  // route module can't drift from public-nodes.json.
  setNodes(publicNodes);
  // App Router route handlers never run sdk-init (no root layout), so label this
  // route's server-side RPC traffic the same way sdk-init labels the rest of web
  // SSR — otherwise it would go out as the default `ecency-sdk` UA.
  setUserAgent("ecency-web-ssr (+https://ecency.com)");

  const started = Date.now();
  const cutoff = started - WINDOW_MS;
  // Community name list — changes slowly, so refresh it from list_communities
  // at most weekly and cache the names in Redis. Every run still rebuilds the
  // communities shard (below) from these names + the post-derived lastmod, so
  // freshness stays hourly while the ~5 list_communities RPCs run only weekly.
  let communityNames: string[] = [];
  try {
    const [builtAt, cached] = await Promise.all([
      redis.get(COMM_BUILT_KEY),
      redis.get(COMM_NAMES_KEY)
    ]);
    if (cached) {
      const arr: unknown = JSON.parse(cached);
      if (Array.isArray(arr)) {
        // Re-screen on every load: a code-side NSFW_COMMUNITIES addition
        // must take effect on the next run, not only when the weekly cache
        // expires. (The response `is_nsfw` bonus signal can't be re-applied
        // here — names only — but the curated set is the source of truth.)
        communityNames = arr.filter(
          (x): x is string =>
            typeof x === "string" && /^hive-\d+$/.test(x) && !isNsfwCommunity(x)
        );
      }
    }
    const fresh =
      communityNames.length > 0 &&
      !!builtAt &&
      Date.now() - Date.parse(builtAt) < COMM_REFRESH_MS;
    if (!fresh) {
      const prevCount = communityNames.length; // screened cached baseline
      const fetched: string[] = [];
      const seenComm = new Set<string>();
      let commLast = "";
      let aborted = false; // an RPC error mid-pagination → likely truncated
      for (let cp = 0; cp < COMM_PAGES; cp++) {
        let cbatch: Record<string, unknown>[];
        try {
          cbatch = (await callRPC(
            "bridge.list_communities",
            { sort: "rank", limit: COMM_LIMIT, last: commLast },
            RPC_TIMEOUT_MS,
            RPC_RETRY
          )) as Record<string, unknown>[];
        } catch {
          aborted = true;
          break;
        }
        if (!Array.isArray(cbatch) || cbatch.length === 0) break;
        for (const c of cbatch) {
          const name = typeof c.name === "string" ? c.name : "";
          if (!name || seenComm.has(name)) continue;
          seenComm.add(name);
          commLast = name;
          // Defensive: only the verified self-canonical /created/hive-NNN
          // form. Hive community accounts are always hive-<digits>; guard is
          // after the cursor advance so a freak value can't stall pagination.
          if (!/^hive-\d+$/.test(name)) continue;
          if (isNsfwCommunity(name) || c.is_nsfw === true) continue;
          fetched.push(name);
        }
        if (cbatch.length < COMM_LIMIT) break;
      }
      // Stale-preserving sanity (delta-guard): only
      // adopt/recache a fetch that completed without an RPC abort and isn't
      // implausibly smaller than the baseline. A truncated/partial fetch
      // (page-2+ RPC error) or a >50% shrink is rejected — keep the cached
      // (time-stale but complete) names and DON'T recache, so the weekly
      // refresh keeps retrying instead of persisting a bad list for a week.
      const sane =
        fetched.length > 0 &&
        !aborted &&
        (prevCount === 0 || fetched.length >= prevCount * 0.5);
      if (sane) {
        communityNames = fetched;
        try {
          await redis.set(COMM_NAMES_KEY, JSON.stringify(fetched));
          await redis.set(COMM_BUILT_KEY, new Date().toISOString());
        } catch {
          /* best-effort cache; in-memory names still used this run */
        }
      }
    }
  } catch {
    /* Redis read failed — communityNames stays []; shard just omits them */
  }

  const seen = new Set<string>();
  const postUrls: SitemapUrl[] = [];
  const authors = new Set<string>();
  // community id -> newest post day (YYYY-MM-DD) seen in the freshness
  // window. Free: derived from the post walk below, no extra RPC.
  const communityLatest = new Map<string, string>();
  // tag -> #posts using it in the freshness window. Also free from the walk;
  // feeds the top-N /created/<tag> hub shard (tags.xml).
  const tagCounts = new Map<string, number>();
  // author -> newest indexable post day, tag -> newest indexable post day.
  // Both free from the walk; they give authors.xml and tags.xml a real
  // per-entry lastmod instead of today's date on every line (a lastmod that
  // moves without the page changing teaches crawlers to discount the field,
  // which also devalues the honest dates in posts.xml).
  const authorLatest = new Map<string, string>();
  const tagLatest = new Map<string, string>();
  let repGated = 0;
  let startAuthor: string | undefined;
  let startPermlink: string | undefined;
  let pages = 0;
  let reachedCutoff = false;

  while (pages < MAX_PAGES && Date.now() - started < TIME_BUDGET_MS && !reachedCutoff) {
    let batch: Record<string, unknown>[];
    try {
      batch = (await callRPC(
        "bridge.get_ranked_posts",
        {
          sort: "created",
          tag: "",
          observer: "",
          limit: PAGE,
          start_author: startAuthor ?? "",
          start_permlink: startPermlink ?? ""
        },
        RPC_TIMEOUT_MS,
        RPC_RETRY
      )) as Record<string, unknown>[];
    } catch {
      break; // serve what we have
    }
    if (!Array.isArray(batch) || batch.length === 0) break;
    pages += 1;

    for (const raw of batch) {
      const e = normalize(raw);
      const id = `${e.author}/${e.permlink}`;
      if (seen.has(id)) continue; // pagination overlaps by the cursor item
      seen.add(id);
      startAuthor = e.author;
      startPermlink = e.permlink;
      if (e.created && Date.parse(`${e.created}Z`) < cutoff) {
        reachedCutoff = true;
        break;
      }
      // Community freshness (free, from this walk): newest post day per
      // community, before the indexable filter — a new post makes the hub
      // fresh even if that post itself is rep-gated/non-indexable.
      const comm = typeof raw.community === "string" ? raw.community : "";
      if (comm) {
        const day = (e.updated || e.created || "").slice(0, 10);
        const prev = communityLatest.get(comm);
        if (day && (!prev || day > prev)) communityLatest.set(comm, day);
      }
      // Reputation gate from the row itself. A listed URL that then renders
      // noindex is a wasted hint and coverage-report noise. Only when the
      // field is present: an absent value must not gate (the page decides).
      const rep = raw.author_reputation;
      const hasRep = typeof rep === "number" || (typeof rep === "string" && rep.trim() !== "");
      if (hasRep && isBelowReputationGate(rep as number | string)) {
        repGated += 1;
        continue;
      }
      // 4th arg = true: keep isIndexable in lockstep with the sitemap-mode
      // canonicalTarget call below, so the indexable count can't drift from
      // the emitted posts.xml (a reply with only an off-host declared
      // canonical and no resolvable on-domain root is rejected here, not
      // silently dropped by the same-host guard a few lines down).
      if (!isIndexable(e, null, true, true)) continue;
      // Sitemap mode (3rd arg = true): canonicalTarget NEVER consults the
      // declared json_metadata.canonical_url here — resolution is purely
      // structural and can only yield `${BASE}/…` or null. inLeo/PeakD/
      // hive.blog are just other frontends over the same on-chain post we also
      // render on ecency.com; the Sitemaps protocol permits only same-host
      // URLs, and sitemap membership is a discovery hint, NOT a canonical claim
      // (the entry page still rel-canonicals to the declared URL; Google
      // decides attribution). This is what fixed GSC's "URL not allowed"
      // (cross-host <loc> in an ecency.com sitemap) and forecloses any future
      // 3rdparty.tld/xyz leak by construction.
      const loc = canonicalTarget(e, BASE, true);
      // Defensive protocol-boundary guard: even if a future canonicalTarget
      // edit regressed, no cross-host URL may enter any shard.
      if (!loc || !loc.startsWith(`${BASE}/`)) continue;
      const postDay = (e.updated || e.created || "").slice(0, 10);
      postUrls.push({ loc, lastmod: postDay });
      if (e.author) {
        authors.add(e.author);
        const prev = authorLatest.get(e.author);
        if (postDay && (!prev || postDay > prev)) authorLatest.set(e.author, postDay);
      }
      // Tag popularity and freshness from the same indexable posts
      // (NSFW/reputation/thin already filtered above). Free — no extra RPC.
      harvestPostTags(tagCounts, e.category, e.json_metadata?.tags, tagLatest, postDay);
    }
  }

  const nowDay = new Date().toISOString().slice(0, 10);
  // Hub pages whose listed content changes daily → lastmod = today.
  // Info/legal pages rarely change → no lastmod (honest: don't claim a
  // daily change). All verified on prod: 200, not noindex, no
  // canonical-away. /market excluded (307 → /market/swap). /waves
  // excluded: a volatile microblog feed with no stable landing value —
  // its substantive content is already covered by posts.xml (depth-1
  // container/wave items passing the wave quality gate).
  const hubPaths = ["", "discover", "communities", "witnesses", "proposals", "tags"];
  const infoPaths = [
    "about",
    "faq",
    "perks",
    "hosting",
    "mobile",
    "contributors",
    "creator-economy",
    "whitepaper",
    "privacy-policy",
    "terms-of-service",
    "child-safety"
  ];
  const staticUrls: SitemapUrl[] = [
    ...hubPaths.map((p) => ({ loc: p ? `${BASE}/${p}` : `${BASE}/`, lastmod: nowDay })),
    ...infoPaths.map((p) => ({ loc: `${BASE}/${p}` }))
  ];
  // Emit the CANONICAL profile URL. Profile pages canonicalize /@a → /@a/posts,
  // so listing the bare /@a made Google report every author entry as "Alternate
  // page with proper canonical tag" — the canonical /@a/posts indexes fine, but
  // the sitemap'd URL itself doesn't, and a crawl is spent resolving the
  // canonical. A sitemap must list canonical URLs — the same rule posts.xml
  // already follows via canonicalTarget.
  // lastmod = the author's newest indexable post day in the window (the
  // only event that changes /@a/posts), never today's date for everyone.
  const authorUrls: SitemapUrl[] = Array.from(authors).map((a) => {
    const lastmod = authorLatest.get(a);
    return lastmod ? { loc: `${BASE}/@${a}/posts`, lastmod } : { loc: `${BASE}/@${a}/posts` };
  });
  // Cached/weekly name list + free hourly post-derived lastmod. A community
  // with no post in the freshness window simply omits lastmod (honest: it
  // signals staleness by absence rather than a fabricated date).
  const communityUrls: SitemapUrl[] = communityNames.map((name) => {
    const lastmod = communityLatest.get(name);
    return lastmod
      ? { loc: `${BASE}/created/${name}`, lastmod }
      : { loc: `${BASE}/created/${name}` };
  });
  // Top-N tag hub pages (/created/<tag>) — community ids/NSFW/long-tail dropped
  // by selectTopTags. lastmod = the tag's newest indexable post day: that is
  // when /created/<tag> last changed.
  const tagUrls: SitemapUrl[] = selectTopTags(tagCounts, TAGS_LIMIT, TAG_MIN_COUNT).map((tag) => {
    const lastmod = tagLatest.get(tag);
    return lastmod ? { loc: `${BASE}/created/${tag}`, lastmod } : { loc: `${BASE}/created/${tag}` };
  });

  // Stale-preserving guard (mirrors the communities delta-sanity):
  // a budget- or error-truncated walk must NOT overwrite a good posts/authors
  // sitemap. Accept iff the walk completed (reachedCutoff — authoritative even
  // in a quiet period), there's no baseline yet, or it's within 50% of the
  // last accepted count. On reject, posts.xml + authors.xml keep their
  // last-good blobs; the independent communities/static/index still refresh.
  let lastGood = 0;
  // When the walk-derived shards were last accepted: a full datetime, or a
  // bare day written by older deploys (both valid W3C lastmod values).
  let lastGoodAt = "";
  try {
    lastGood = parseInt((await redis.get(POSTS_LASTGOOD_KEY)) ?? "", 10) || 0;
    lastGoodAt = (await redis.get(POSTS_LASTGOOD_DAY_KEY)) ?? "";
  } catch {
    lastGood = 0;
    lastGoodAt = "";
  }
  // 50% guard. Math.ceil (not floor) so a stored baseline of 1 doesn't
  // collapse the threshold to 0 and silently accept an empty walk; the
  // explicit lastGood === 0 short-circuit still covers the true bootstrap.
  const acceptWalk =
    reachedCutoff || lastGood === 0 || postUrls.length >= Math.ceil(lastGood * 0.5);
  const WALK_DERIVED = new Set<string>(["posts.xml", "authors.xml", "tags.xml"]);

  // Writer/index/route stay in lockstep: every shard we emit comes from the
  // shared SITEMAP_SHARDS allowlist, and the index may additionally list an
  // OPERATOR_SHARDS entry while its blob exists (below). The public route
  // validates against both. A generated name that isn't in SITEMAP_SHARDS is
  // a compile error (keyof typeof), not a silent prod 404.
  const shardXml: Record<(typeof SITEMAP_SHARDS)[number], string> = {
    "posts.xml": urlset(postUrls),
    "authors.xml": urlset(authorUrls),
    "communities.xml": urlset(communityUrls),
    "tags.xml": urlset(tagUrls),
    "static.xml": urlset(staticUrls)
  };

  try {
    // Per-shard lastmod, kept in Redis. A shard's lastmod advances only when
    // its bytes change, so an hourly run that rebuilds an identical
    // authors.xml or communities.xml does not advertise a change it did not
    // make (a lastmod that moves without content teaches crawlers to discount
    // the field). A walk-derived shard kept from last-good keeps its recorded
    // lastmod; the first run after this deploy falls back to the last
    // accepted timestamp, then today.
    const nowIso = new Date().toISOString();
    let recorded: Record<string, string> = {};
    try {
      const raw = await redis.get(K("lastmod"));
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object") recorded = parsed as Record<string, string>;
    } catch {
      recorded = {};
    }
    // Decide every lastmod first, then persist in the order record -> shards
    // -> index. If a write fails midway, the retry still does the right
    // thing: a shard not yet written still differs from its stored blob (so
    // it is stamped again), and a shard already written reads back the
    // timestamp this run recorded for it. Writing the record last instead
    // would let a changed shard keep its previous timestamp forever.
    const lastmods: Record<string, string> = {};
    const toWrite: (typeof SITEMAP_SHARDS)[number][] = [];
    for (const name of SITEMAP_SHARDS) {
      if (!acceptWalk && WALK_DERIVED.has(name)) {
        lastmods[name] = recorded[name] || lastGoodAt || nowDay; // keep last-good
        continue;
      }
      const previous = await redis.get(K(name));
      const changed = previous !== shardXml[name];
      lastmods[name] = changed || !recorded[name] ? nowIso : recorded[name];
      toWrite.push(name);
    }
    // Operator-seeded shards ride along in the index while their blob
    // exists; their lastmod is whatever the operator set beside the blob (or
    // the previously recorded one), never this run's time: nothing here
    // changed them.
    const children: { name: string; lastmod: string }[] = SITEMAP_SHARDS.map((name) => ({
      name,
      lastmod: lastmods[name]
    }));
    for (const name of OPERATOR_SHARDS) {
      // Present means a non-empty blob, the same rule the public route
      // applies (it 404s an operator shard whose value is missing or empty),
      // so the index never advertises a URL that answers 404. STRLEN is 0 for
      // both cases and never loads the payload, which may be large.
      if (!(await redis.strlen(K(name)))) continue;
      const lastmod = (await redis.get(`${K(name)}:lastmod`)) || recorded[name] || nowDay;
      lastmods[name] = lastmod;
      children.push({ name, lastmod });
    }
    await redis.set(K("lastmod"), JSON.stringify(lastmods));
    for (const name of toWrite) await redis.set(K(name), shardXml[name]);
    await redis.set(K("index"), indexXml(children));
    if (acceptWalk) {
      await redis.set(POSTS_LASTGOOD_KEY, String(postUrls.length));
      // Full datetime, so a later rejected walk advertises exactly the
      // freshness the last accepted walk had, not a coarser day.
      await redis.set(POSTS_LASTGOOD_DAY_KEY, nowIso);
    }
    await redis.set(
      `${SEO_REDIS_PREFIX}sitemap:meta`,
      JSON.stringify({
        ts: new Date().toISOString(),
        posts: postUrls.length,
        authors: authorUrls.length,
        communities: communityUrls.length,
        tags: tagUrls.length,
        pages,
        repGated,
        ms: Date.now() - started,
        reachedCutoff,
        acceptedWalk: acceptWalk,
        lastGood,
        lastGoodAt
      })
    );
  } catch (e) {
    // 500 (not 200): the deploy-time prime keys its retry/break on a 2xx
    // here, and monitoring must see a write failure rather than a false ok.
    console.error("[seo/sitemap-generate] write failed:", e);
    return new Response(
      JSON.stringify({ error: "write-failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      posts: postUrls.length,
      authors: authorUrls.length,
      communities: communityUrls.length,
      tags: tagUrls.length,
      pages,
      repGated,
      ms: Date.now() - started,
      reachedCutoff,
      acceptedWalk: acceptWalk,
      lastGood,
      lastGoodAt
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
