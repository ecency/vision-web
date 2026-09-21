import { prefetchQuery } from "@/core/react-query";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { getContentQueryOptions, getProfilesQueryOptions } from "@ecency/sdk";
import { isIndexable, ReputationSource } from "@/utils/entry-indexability";
import { safeDecodeURIComponent } from "@/utils";
import { parseJsonMetadata } from "@/utils/json-metadata";
import type { Entry, JsonMetadata } from "@/entities";

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

/**
 * Metadata is dropped past this nesting depth. Real metadata is shallow: of
 * 357 posts sampled from bridge.get_ranked_posts on 2026-09-21 the deepest
 * was 5 levels (Liketu) and 334 were 2, so this sits an order of magnitude
 * above anything a person publishes. It sits far below the ~4400 levels where
 * JSON.stringify blows the stack on node 24, which matters because the
 * envelope is serialised whole: metadata nested deeper than the serialiser
 * can emit would throw and take a perfectly good post down with it, and the
 * route's catch would answer 404 where a raw string used to serve fine.
 * Capping by depth keeps that deterministic, so the same post always gets the
 * same body, instead of depending on how much stack was left when it landed.
 */
const MAX_METADATA_DEPTH = 64;

/** Iterative: measuring a metadata bomb must not overflow the stack itself. */
function withinDepth(value: unknown, max: number): boolean {
  const stack: [unknown, number][] = [[value, 1]];

  while (stack.length > 0) {
    const [current, depth] = stack.pop() as [unknown, number];
    if (current === null || typeof current !== "object") continue;
    if (depth > max) return false;
    for (const child of Object.values(current)) stack.push([child, depth + 1]);
  }

  return true;
}

/** The field in the shape the body promises: an object, always. */
const cappedMetadata = (value: unknown): JsonMetadata => {
  const parsed = parseJsonMetadata(value);
  return (parsed && withinDepth(parsed, MAX_METADATA_DEPTH) ? parsed : {}) as JsonMetadata;
};

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
 * number) or nested past MAX_METADATA_DEPTH becomes `{}`. An envelope
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
 * Copied, never patched in place: `entry` is the object held in the query
 * cache, which the entry page renders from in the same process.
 */
export function withParsedMetadata(entry: Entry): Entry {
  const normalised: Entry = { ...entry, json_metadata: cappedMetadata(entry.json_metadata) };

  // A cross-post carries the entry it quotes, whose own metadata is serialised
  // into the same body and can be just as deep. The spread above is shallow,
  // so it would otherwise travel unchecked.
  if (normalised.original_entry) {
    normalised.original_entry = {
      ...normalised.original_entry,
      json_metadata: cappedMetadata(normalised.original_entry.json_metadata)
    };
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
    entry = (await prefetchQuery(getContentQueryOptions(author, permlink))) as Entry | null;
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
