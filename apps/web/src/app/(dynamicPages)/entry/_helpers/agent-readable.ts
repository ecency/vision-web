import { markSsrDegraded, prefetchQuery } from "@/core/react-query";
import { loadDmcaLists } from "@/core/dmca-lists";
import { isTakenDownPost } from "@/core/dmca-posts";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { getContentQueryOptions, getProfilesQueryOptions } from "@ecency/sdk";
import { isIndexable, ReputationSource, threadRoot } from "@/utils/entry-indexability";
import { safeDecodeURIComponent } from "@/utils";
import { parseJsonMetadata, withinMetadataLimits } from "@/utils/json-metadata";
import type { Entry, JsonMetadata } from "@/entities";

// Load-bearing, and a call rather than a bare side-effect import (webpack
// prunes those here, see core/dmca-lists): these are route handlers, which
// never execute the root layout, so nothing else loads the takedown lists and
// every DMCA filter below would otherwise run against an empty list (#1862).
loadDmcaLists();

// Re-exported so route handlers have a single import surface for the endpoints.
export { selfUrl, renderEntryMarkdown } from "./entry-agent-format";

/**
 * Shared loader for the agent-readable post endpoints (.md / .json /
 * .discussion.json). One place for the fetch + suppression policy so all three
 * formats agree with each other and with what search engines are shown.
 */

// Edge-cacheable like the entry page's conservative tier; the CF worker/nginx
// absorb load. Public content, so safe to share across all clients.
export const AGENT_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=86400";

// Short negative TTL: a 404 here is usually "suppressed" or "not indexed yet",
// both of which can flip — don't let edges pin it for long.
const NOT_FOUND_CACHE_CONTROL = "public, max-age=0, s-maxage=60";

// Hive bodies are a markdown/HTML hybrid and CAN carry arbitrary raw HTML/JS
// (we serve the body verbatim, NOT through the HTML sanitizer). We never send a
// text/html content type, but harden every response so that raw body can never
// be content-sniffed or rendered as an executable document on our own origin:
//   - nosniff           → the declared text/markdown|application/json wins; the
//                         browser won't re-interpret it as HTML and run scripts.
//   - CSP default-src 'none'; sandbox → even if forced into a document context,
//                         nothing loads or executes.
//   - X-Robots-Tag noindex → alternate representation of the HTML post; keep it
//                         out of search (no duplicate-content competition).
// Agents fetching the URL still get the full content — these only govern how a
// browser would render it and how search engines index it.
const AGENT_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Robots-Tag": "noindex"
};

export type EntrySource = "hive_condenser" | "hive_bridge";

export interface LoadedEntry {
  entry: Entry;
  source: EntrySource;
}

/** 200 response with the shared cache + security headers for every format. */
export function agentResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": AGENT_CACHE_CONTROL,
      ...AGENT_SECURITY_HEADERS
    }
  });
}

export function agentNotFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": NOT_FOUND_CACHE_CONTROL,
      ...AGENT_SECURITY_HEADERS
    }
  });
}

/** The field in the shape the body promises: an object, always. */
const cappedMetadata = (value: unknown): JsonMetadata => {
  const parsed = parseJsonMetadata(value);
  return (parsed && withinMetadataLimits(parsed) ? parsed : {}) as JsonMetadata;
};

/**
 * How far a chain of quoted cross-posts is followed. Nothing in the app builds
 * one on these paths: `original_entry` is attached by the SDK's `resolvePost`,
 * which only `bridge/requests.ts`'s `getPost()` calls, and these routes do not
 * use it. They read `condenser_api.get_content`, then fall back to
 * `getPostQueryOptions`, which issues `bridge.get_post` through `callRPC`
 * directly, and to `bridge.get_discussion`. So a chain here would have to come
 * from a node rather than from us, and this bounds it.
 */
const MAX_QUOTE_CHAIN = 4;

/**
 * Give an entry the `json_metadata` shape the type (and this endpoint
 * family's documentation) promises, for the response body.
 *
 * Both sources are cast to `Entry`, whose `json_metadata` is an object, but
 * only `bridge.get_post` actually parses it: `condenser_api.get_content`
 * returns the raw string the author published. That made the field's TYPE
 * depend on which source answered, inside a public response body: on
 * 2026-09-21 one post served `content.json_metadata` as a string from `.json`
 * while all 13 entries of its `.discussion.json` came back parsed, so a
 * consumer reading `json_metadata.tags` got `undefined` from one endpoint and
 * the tags from the other.
 *
 * Metadata that is not a JSON object (unparseable, `null`, an array, a bare
 * number) or past the limits in @/utils/json-metadata becomes `{}`. An envelope
 * advertised as structured JSON should not hand back a raw string for a field
 * typed as an object, and every reader below already collapses unreadable
 * metadata to "no fields".
 *
 * ⛔ Applied where an entry is SERIALISED, never inside the loader. The
 * indexability gate must keep seeing the entry exactly as the source returned
 * it: `canonicalTarget` (entry-indexability.ts) deliberately does not parse a
 * declared `canonical_url`, and handing it a parsed entry would switch that
 * branch on for these endpoints alone, behind a product decision that says
 * not to. Gating on the raw entry is also what keeps `loadIndexableEntry` a
 * true mirror of generate-entry-metadata.ts.
 *
 * The entry is copied, never patched in place: it is the object held in the
 * query cache, which the entry page renders from in the same process. The
 * copy is shallow, so metadata that arrived parsed is still the cached
 * object: callers serialise the result and must not mutate it.
 */
export function withParsedMetadata(entry: Entry): Entry {
  const normalised: Entry = { ...entry, json_metadata: cappedMetadata(entry.json_metadata) };

  // A cross-post carries the entry it quotes, which can quote another. Each
  // one is serialised into the same body and the spread above is shallow, so
  // walk the chain rather than its first link, and cut a chain longer than
  // anything a real cross-post produces instead of serialising it unchecked.
  let quoting = normalised;
  for (let link = 0; quoting.original_entry; link += 1) {
    if (link >= MAX_QUOTE_CHAIN) {
      quoting.original_entry = undefined;
      break;
    }

    const quoted: Entry = {
      ...quoting.original_entry,
      json_metadata: cappedMetadata(quoting.original_entry.json_metadata)
    };
    quoting.original_entry = quoted;
    quoting = quoted;
  }

  return normalised;
}

/**
 * Fetch a post by author/permlink WITHOUT applying the indexability gate.
 *
 * Prefers condenser_api.get_content (carries root_author/root_permlink, needed
 * for accurate container/wave detection); falls back to bridge.get_post.
 * Returns null only when the post genuinely can't be resolved.
 *
 * Use this for surfaces that should render any real post (e.g. the oEmbed
 * provider, which our own in-post link cards consume) and gate visibility
 * elsewhere. For search-facing surfaces, use loadIndexableEntry instead.
 */
export async function loadEntry(
  rawAuthor: string,
  rawPermlink: string
): Promise<LoadedEntry | null> {
  const author = (rawAuthor || "").replace(/%40/g, "").replace("@", "");
  const permlink = safeDecodeURIComponent(rawPermlink || "").trim();
  if (!author || !permlink) return null;

  let entry: Entry | null = null;
  let source: EntrySource = "hive_condenser";

  try {
    // bridge.get_post below is the fallback, so this source alone failing does
    // not make the response degraded (the bridge prefetch marks it if both do).
    entry = (await prefetchQuery(getContentQueryOptions(author, permlink), {
      degradeOnFailure: false
    })) as Entry | null;
  } catch {
    entry = null;
  }

  if (!entry || !entry.body || !entry.created) {
    try {
      entry = (await prefetchQuery(
        EcencyEntriesCacheManagement.getEntryQueryByPath(author, permlink)
      )) as Entry | null;
      source = "hive_bridge";
    } catch {
      entry = null;
    }
  }

  if (!entry || !entry.body || !entry.created) return null;

  // bridge omits root_*: a deeper reply served from it cannot name its thread,
  // so the discussion route would answer a subtree. Not a render to cache.
  if (source === "hive_bridge" && !threadRoot(entry)) markSsrDegraded("fallback-incomplete");

  return { entry, source };
}

/**
 * Fetch a post and return it only if it passes the same indexability gate the
 * entry page uses (NSFW + reputation + thin-content). Anything we'd
 * noindex for Googlebot returns null here too → the route handler emits 404.
 *
 * Mirrors generate-entry-metadata.ts so gating decisions can't drift.
 */
export async function loadIndexableEntry(
  rawAuthor: string,
  rawPermlink: string
): Promise<LoadedEntry | null> {
  const loaded = await loadEntry(rawAuthor, rawPermlink);
  if (!loaded) return null;

  const { entry } = loaded;

  // A takedown suppresses the path outright here, ahead of the gate below.
  // llms.txt promises these endpoints 404 whatever is suppressed for policy
  // reasons, and a machine has no use for the notice the HTML page shows a
  // reader. It also has to come BEFORE isIndexable: the filter blanks the
  // metadata and replaces the body, which removes the NSFW tag and the
  // thin-content signal the gate would otherwise have rejected the post on,
  // so without this a listed post could answer 200 where it used to 404
  // (#1862). oEmbed keeps using loadEntry, so link cards still render the
  // censored card rather than breaking.
  if (isTakenDownPost(entry.author, entry.permlink)) return null;

  let account: ReputationSource = null;
  let accountFetchFailed = false;
  try {
    const profiles = await prefetchQuery(getProfilesQueryOptions([entry.author]));
    account = profiles?.[0] ?? null;
  } catch {
    accountFetchFailed = true;
  }

  if (!isIndexable(entry, account, accountFetchFailed)) return null;

  return loaded;
}
