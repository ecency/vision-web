import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { similar } from "../requests";
import { SearchResult } from "../types/search-response";
import { isDmcaCurationPath } from "@/modules/curation/dmca";

// Without a recency window the backend ranks across the entire historical
// index and surfaces years-old posts. Constrain suggestions to the last
// ~6 months so related posts stay fresh (it also bounds the backend's
// more_like_this candidate set, which is what keeps it fast).
const SIMILAR_ENTRIES_SINCE_MS = 182 * 24 * 60 * 60 * 1000;

// How many results the suggestions strip renders at most.
const SIMILAR_ENTRIES_TARGET = 4;

// more_like_this only extracts a handful of significant terms, so an excerpt is
// enough signal and keeps the request payload small.
const SIMILAR_ENTRIES_BODY_LIMIT = 3000;

// On the server the prefetch sits on the entry-page render path, and the search
// backend is single-region (EU) — so anything slower than this stalls SSR for a
// non-essential "related posts" strip. Keep the SSR cap short and let the strip
// fall back to a client fetch (only that render misses the in-HTML strip; it's
// ISR-cached anyway). Do NOT raise this — 2s is the SSR budget.
const SIMILAR_ENTRIES_SSR_TIMEOUT_MS = 2000;

// The client fetch doesn't block paint, so it previously had no cap and fell
// through to the SDK's generic INTERNAL_API_TIMEOUT_MS (10s; CF's worker further
// truncates at ~8s). Combined with React Query's default client retry (3×), a
// /search-api/similar outage turned this best-effort strip into a multi-second
// post-onload tail (observed as a ~29s "fully loaded" in GTmetrix). Cap the
// client call short and disable retry (below) so a degraded backend just hides
// the strip quickly instead of churning.
const SIMILAR_ENTRIES_CLIENT_TIMEOUT_MS = 4000;

// The strip is hidden below this many results. A lone suggestion looks
// sparse. Exported so the web component shares one threshold (filter == render).
export const SIMILAR_ENTRIES_MIN_RENDER = 2;

// Strip markdown image/link/URL noise before truncating, so more_like_this
// keys on prose terms instead of image-CDN domains and file hashes (which
// rarely match the index's sanitized body and just waste the term budget).
function toMltExcerpt(body: string, limit: number): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // markdown images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links -> keep link text
    .replace(/<[^>]+>/g, " ") // html tags
    .replace(/https?:\/\/\S+/g, " ") // bare URLs
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

// Compact deterministic fingerprint (djb2) of the MLT inputs. Folded into the
// cache key so an edited post (title/tags/body changed) refetches instead of
// serving stale recommendations under the same author/permlink. Deterministic
// so the SSR prefetch and the client compute the same key from the same entry.
function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

interface Entry {
  author: string;
  permlink: string;
  title?: string;
  body?: string;
  json_metadata?: {
    // Hive's json_metadata is user-controlled and untyped on-chain: `tags` is
    // usually a string[] but some posts store it as a bare string (or other
    // junk). Typed as unknown on purpose so callers can't assume an array —
    // it's narrowed with a runtime guard below.
    tags?: unknown;
  };
}

export function getSimilarEntriesQueryOptions(entry: Entry) {
  const title = entry.title ?? "";
  // `?? []` only guards null/undefined; a non-array tags value (e.g. a bare
  // string from json_metadata) slips through and crashes `.filter` — which
  // took down the entry-page SSR prefetch (Sentry ECENCY-NEXT-1FMA). Guard on
  // Array.isArray so only real arrays reach the filter.
  const rawTags = entry.json_metadata?.tags;
  const tags = (Array.isArray(rawTags) ? rawTags : []).filter(
    (tag): tag is string => typeof tag === "string" && tag !== ""
  );
  const body = toMltExcerpt(entry.body ?? "", SIMILAR_ENTRIES_BODY_LIMIT);
  const contentKey = fingerprint(`${title}|${tags.join(",")}|${body}`);

  return queryOptions({
    queryKey: QueryKeys.search.similarEntries(entry.author, entry.permlink, contentKey),
    queryFn: async ({ signal }) => {
      // Naive `YYYY-MM-DDTHH:mm:ss` (no `Z`) matches the search-api date
      // contract used elsewhere; a <14h skew on a 182-day boundary is immaterial.
      const since = new Date(Date.now() - SIMILAR_ENTRIES_SINCE_MS).toISOString().slice(0, 19);

      // Elasticsearch more_like_this recommendations: content-based "related
      // posts" ranked by shared significant terms in title/body/tags, scoped
      // to the recency window. The backend already excludes the source author,
      // spam and nsfw.
      const response = await similar(
        {
          author: entry.author,
          permlink: entry.permlink,
          title,
          body,
          tags,
          since
        },
        signal,
        // Short cap server-side so a slow cross-region call can't stall SSR;
        // a slightly longer (but still bounded) cap client-side so a degraded
        // backend can't hang the request on the SDK's generic 8s timeout.
        typeof window === "undefined"
          ? SIMILAR_ENTRIES_SSR_TIMEOUT_MS
          : SIMILAR_ENTRIES_CLIENT_TIMEOUT_MS
      );

      // Light client guard mirroring the render contract: never the source
      // post, never nsfw, never a taken-down post (`similar` masks it, but a
      // blank card is no suggestion), one per author, capped at the render
      // target.
      const collected: SearchResult[] = [];
      const seenAuthors = new Set<string>();
      for (const r of response.results) {
        if (collected.length >= SIMILAR_ENTRIES_TARGET) break;
        if (r.permlink === entry.permlink) continue;
        if ((r.tags ?? []).indexOf("nsfw") !== -1) continue;
        if (isDmcaCurationPath(r.author, r.permlink)) continue;
        if (seenAuthors.has(r.author)) continue;
        seenAuthors.add(r.author);
        collected.push(r);
      }

      return collected;
    },
    // The entry page server-prefetches this query and dehydrates it. Without a
    // staleTime, React Query treats the hydrated data as stale and refetches on
    // mount — issuing a *redundant* /search-api/similar XHR right after
    // hydration even though SSR already provided the data. That refetch was the
    // long post-onload tail in the waterfall (held open to the client timeout),
    // inflating GTmetrix "Fully Loaded" while the visible strip was already
    // populated from SSR. A staleTime makes the hydrated data fresh so the
    // client skips that refetch; if SSR delivered nothing (empty cache), the
    // client still fetches. Recommendations are stable per post (and the cache
    // key is content-fingerprinted), so 5 min matches the page's ISR cadence.
    staleTime: 5 * 60 * 1000,
    // Best-effort suggestions strip — never retry-storm a degraded backend.
    // The web QueryClient only disables retries on the server; the browser
    // client keeps React Query's default retry (3×) — and other SDK consumers
    // (e.g. mobile) may too — so pin retry:false here to cover every caller.
    retry: false
  });
}
