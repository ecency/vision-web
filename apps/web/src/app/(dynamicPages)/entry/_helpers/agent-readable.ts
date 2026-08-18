import { prefetchQuery } from "@/core/react-query";
import { EcencyEntriesCacheManagement } from "@/core/caches";
import { getContentQueryOptions, getProfilesQueryOptions } from "@ecency/sdk";
import { isIndexable, ReputationSource } from "@/utils/entry-indexability";
import { safeDecodeURIComponent } from "@/utils";
import type { Entry } from "@/entities";

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

  // Shared-Redis read; pass a singleton set so isIndexable keeps its

  if (!isIndexable(entry, account, accountFetchFailed)) return null;

  return loaded;
}
