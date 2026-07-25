import { NextRequest, NextResponse } from "next/server";

/**
 * Cache-Control for the category -> canonical entry redirect.
 *
 * The mapping is permanent and purely syntactic (drop the leading category
 * segment), so it can never go stale the way rendered content can — a post
 * being edited, muted or deleted does not change which URL is canonical. That
 * makes a long edge TTL safe even though the entry page it points at is
 * cached far more conservatively.
 *
 * s-maxage matches the `entry-ancient` tier (30d) so the redirect and the
 * page it lands on age out on a comparable schedule. max-age is kept short
 * (1h) because a browser-cached permanent redirect is effectively impossible
 * to revoke, and we want an escape hatch if the canonical form ever changes.
 */
const REDIRECT_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=2592000, stale-while-revalidate=604800";

/** Matches `/:category/@:author/:permlink` — exactly three segments. */
const CATEGORY_ENTRY_PATH = /^\/([^/@][^/]*)\/(@[^/]+)\/([^/]+)$/;

/**
 * Consolidate category-prefixed post URLs onto the bare `/@author/permlink`
 * canonical with a 308.
 *
 * This lived in `next.config.js` `redirects()` until it became clear that Next
 * cannot attach a Cache-Control to it there: in
 * `next/dist/server/lib/router-utils/resolve-routes.js` the redirect branch is
 * the single return path that omits the accumulated `resHeaders`, so entries
 * from `headers()` are silently dropped on redirect responses. The CF worker
 * then fills in its `no-store` fallback for any HTML response that arrives
 * without a Cache-Control, and additionally refuses to store anything that
 * isn't a 200 — so every legacy inbound link cost a full origin round trip,
 * a meaningful and entirely avoidable share of post traffic.
 *
 * Emitting the redirect from middleware instead lets the response carry its
 * own cache policy, so the edge serves it and both URL forms converge on the
 * one canonical `/@author/permlink` cache entry.
 *
 * Matching is deliberately identical to the old `redirects()` rule:
 *   - exactly 3 segments, so edit URLs (`/:cat/@a/p/edit`) and other sub-paths
 *     are 4 segments and fall through to the rewrites that handle them
 *   - the category segment must not itself start with `@`, which rules out the
 *     `/@x/@y/z` edge case
 *   - the query string is preserved, as `redirects()` did
 *
 * Returns `null` when the path is not a category-prefixed entry URL.
 */
export function handleCategoryEntryRedirect(request: NextRequest): NextResponse | null {
  const match = request.nextUrl.pathname.match(CATEGORY_ENTRY_PATH);
  if (!match) return null;

  const [, , author, permlink] = match;

  const url = request.nextUrl.clone();
  url.pathname = `/${author}/${permlink}`;

  const response = NextResponse.redirect(url, 308);
  response.headers.set("Cache-Control", REDIRECT_CACHE_CONTROL);
  // Observability parity with the rest of the cache policy (see middleware.ts)
  // so these show up as their own tier in origin logs rather than as untiered.
  response.headers.set("x-cache-tier", "entry-redirect");
  return response;
}
