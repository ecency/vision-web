import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import {
  awaitPostCreatedMs,
  buildCacheControlHeader,
  getCachePolicyForPath,
  getEntryTierForAge,
  handleAgentReadableRewrite,
  handleCategoryEntryRedirect,
  handleDecodedPathRedirect,
  handleIndexRedirect,
  isIndexRedirect,
  isUserSpecificForLoggedIn,
  parseEntryUrl,
  refreshPostCreatedMs
} from "@/features/next-middleware";
import { ACTIVE_USER_COOKIE_NAME } from "@/consts/cookies";

// Node.js runtime is required so the post-age cache can talk to the per-host
// Redis container via ioredis (TCP). Edge runtime cannot import node:net.
// Requires `experimental.nodeMiddleware: true` in next.config.js (Next 15.x).
export const config = { runtime: "nodejs" };

// Short TTL for first-ever request to an entry page before post age is known.
// Prevents over-caching a fresh post (60s vs. the default 1h entry tier).
const ENTRY_COLD_MISS_POLICY = { tier: "entry-unknown", sMaxAge: 60, staleWhileRevalidate: 300 };

const METHOD_NOT_ALLOWED_HEADERS = { Allow: "GET, HEAD, OPTIONS" };

export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Reject write methods on page routes up-front. Without this, an unhandled
  // POST/PUT/DELETE/PATCH to a page URL (most commonly POST / from bots or
  // from the landing-page subscribe form falling back to native submit when
  // JS fails) still engages the Next.js request pipeline — reading the body,
  // stepping through rewrites, invoking render code — and can pin the event
  // loop for minutes under slow-loris style bodies. Returning 405 from the
  // Edge middleware short-circuits before any body is read.
  //
  // Carve-outs:
  //   - /api/*       — route handlers that explicitly accept write methods
  //   - /pl/*        — Plausible analytics proxy (see next.config.js rewrites)
  //   - next-action  — reserved for future Next.js Server Actions
  const isWriteMethod =
    method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
  if (isWriteMethod) {
    const isApiRoute = pathname.startsWith("/api/");
    const isPlausibleProxy = pathname.startsWith("/pl/");
    const isServerAction = request.headers.has("next-action");
    if (!isApiRoute && !isPlausibleProxy && !isServerAction) {
      return new NextResponse(null, {
        status: 405,
        headers: METHOD_NOT_ALLOWED_HEADERS
      });
    }
  }

  if (method !== "GET" && method !== "HEAD") return;

  if (isIndexRedirect(request)) {
    return handleIndexRedirect(request);
  }

  // Canonicalize percent-encoded paths (e.g. `/%40user` -> `/@user`), refusing
  // any decoded target that would redirect off-origin. See the helper for the
  // open-redirect (CWE-601) and redirect-loop reasoning.
  const decodedRedirect = handleDecodedPathRedirect(request);
  if (decodedRedirect) return decodedRedirect;

  // Category-prefixed post URLs -> bare /@author/permlink canonical. This used
  // to be a next.config.js redirects() rule, which runs ahead of ALL of this
  // middleware, so it must stay near the top to preserve that precedence over
  // the file-extension 404 and social-bot rewrite below. It moved here so the
  // 308 can carry a Cache-Control — see the helper for why redirects() cannot.
  const categoryEntryRedirect = handleCategoryEntryRedirect(request);
  if (categoryEntryRedirect) return categoryEntryRedirect;

  const path = request.nextUrl.pathname;

  // block invalid permlinks with file extensions
  if (path.match(/^\/[^\/]+\/@[\w\d.-]+\/[a-z0-9-]+\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
    console.warn("Blocked invalid permlink with file extension:", path);
    return new NextResponse("Not found", { status: 404 });
  }

  // Agentic-web read-only endpoints: /@author/permlink.md|.json|.discussion.json
  // rewrite to a Route Handler that serves clean Markdown/JSON for LLMs & agents.
  const agentRewrite = handleAgentReadableRewrite(request);
  if (agentRewrite) return agentRewrite;

  const userAgent = request.headers.get("user-agent") || "";
  const isSocialBot =
    /Discordbot|Twitterbot|facebookexternalhit|TelegramBot|LinkedInBot|Slackbot|WhatsApp|redditbot/i.test(
      userAgent
    );

  if (isSocialBot && path.match(/^\/[^\/]+\/@[^\/]+\/[^\/]+$/)) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname += "/redditbot";
    return NextResponse.rewrite(nextUrl);
  }

  // Expose the resolved pathname to server components via a request header — the
  // root layout reads it to skip the analytics script on the /embed/* WebView
  // routes (server components can't otherwise see the path).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", path);
  // Layouts cannot read searchParams, so expose the query string too — the feed
  // layout needs it to tell a cursor archive page (?before=) apart from page 1.
  requestHeaders.set("x-search", request.nextUrl.search);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  await applyCacheHeaders(request, response, path, event);
  return response;
}

async function applyCacheHeaders(
  request: NextRequest,
  response: NextResponse,
  path: string,
  event: NextFetchEvent
) {
  const basePolicy = getCachePolicyForPath(path);
  if (!basePolicy) return;

  const isLoggedIn = request.cookies.has(ACTIVE_USER_COOKIE_NAME);

  // For entry pages, refine TTL based on post age. The lookup hits L1 sync
  // first; on miss it falls through to Redis with a tight timeout. Without
  // the Redis step, the entry-unknown 60s response gets cached at every
  // edge layer until L1 happens to warm — which rarely converges for
  // long-tail posts under load-balanced traffic + L1 FIFO eviction.
  // Runs for both anon and logged-in users — entry tier is cacheable in
  // both cases (per buildCacheControlHeader).
  let policy = basePolicy;
  if (basePolicy.tier === "entry") {
    const parsed = parseEntryUrl(path);
    if (parsed) {
      const createdMs = await awaitPostCreatedMs(parsed.author, parsed.permlink);
      if (typeof createdMs === "number") {
        policy = getEntryTierForAge(Date.now() - createdMs);
      } else {
        // Both undefined (not cached anywhere) and null (cached as missing/
        // malformed in L1) get the conservative cold-miss TTL. Treating null
        // as the default entry tier (1h/1d) over-caches when the RPC reports
        // "no created" for a fresh post that simply isn't indexed yet on the
        // node we hit. Only undefined triggers a background refresh — for
        // null, the L1 negative entry is still fresh and re-RPC'ing would
        // just spam.
        policy = ENTRY_COLD_MISS_POLICY;
        if (createdMs === undefined) {
          event.waitUntil(refreshPostCreatedMs(parsed.author, parsed.permlink));
        }
      }
    }
  }

  response.headers.set("Cache-Control", buildCacheControlHeader(policy, isLoggedIn));
  // x-cache-tier is observability-only. Reflect actual gating so cached-vs-private
  // is distinguishable in nginx logs and CF analytics.
  const userSpecific = isUserSpecificForLoggedIn(policy, isLoggedIn);
  response.headers.set("x-cache-tier", userSpecific ? `${policy.tier}-loggedin` : policy.tier);
  // NOTE: we deliberately do NOT emit `Vary: Cookie`. That would fragment the
  // edge cache on every cookie (analytics, locale, experiments) and cripple
  // hit ratio. Auth bifurcation happens via cache-key suffix in the worker:
  //   - CF worker: cache key encodes auth-class (anon|loggedin) so anon and
  //     logged-in get separate cache entries (2 per URL) without Vary
  //   - Origin Cache-Control still gates writes: `private, no-store` for
  //     no-cache routes and (only when isLoggedIn) feed/profile-feed tiers
}
