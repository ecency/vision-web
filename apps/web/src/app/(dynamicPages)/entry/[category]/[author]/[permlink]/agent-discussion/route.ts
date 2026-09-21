import { prefetchQuery } from "@/core/react-query";
import { getDiscussionQueryOptions } from "@ecency/sdk";
import {
  agentNotFound,
  agentResponse,
  loadIndexableEntry,
  selfUrl,
  withParsedMetadata
} from "@/app/(dynamicPages)/entry/_helpers/agent-readable";
import type { Entry } from "@/entities";

// Reached via the middleware rewrite of `/@author/permlink.discussion.json`.
// Serves the full comment thread (bridge.get_discussion map) as JSON.
export const dynamic = "force-dynamic"; // handler runs; CDN caches via headers

interface Props {
  params: Promise<{ category: string; author: string; permlink: string }>;
}

export async function GET(_request: Request, { params }: Props): Promise<Response> {
  try {
    const { author, permlink } = await params;

    // Gate on the requested entry: if it's suppressed, so is its thread.
    const loaded = await loadIndexableEntry(author, permlink);
    if (!loaded) return agentNotFound();

    // Always return the FULL thread. bridge.get_discussion rooted at a comment
    // only yields that comment's subtree, so resolve to the discussion root
    // (root_author/root_permlink when this entry is a reply; itself otherwise).
    const rootAuthor = loaded.entry.root_author || loaded.entry.author;
    const rootPermlink = loaded.entry.root_permlink || loaded.entry.permlink;

    const discussion = await prefetchQuery(getDiscussionQueryOptions(rootAuthor, rootPermlink));

    // bridge parses json_metadata today, so this is a guarantee rather than a
    // repair: the thread and the .json envelope must not be able to disagree
    // about the shape of the same field for the same post, whichever node
    // answered either request.
    // Anything that is not an entry object is dropped rather than spread: a
    // string value would otherwise be emitted character by character and an
    // array index by index, and every entry in the map has to carry the
    // json_metadata the docs promise.
    const content = Object.fromEntries(
      Object.entries((discussion ?? {}) as Record<string, Entry>)
        .filter(([, value]) => !!value && typeof value === "object" && !Array.isArray(value))
        .map(([key, value]) => [key, withParsedMetadata(value)])
    );

    // Checked on the map that is actually served, after the filter. prefetchQuery
    // resolves undefined when the RPC fails or the SSR budget runs out, and
    // bridge.get_discussion always includes the root post itself, so an empty
    // thread means the lookup failed rather than that nobody replied. Serving
    // 200 with it would pin that lie in the edge cache for five minutes, where
    // a 404 is capped at sixty seconds.
    if (Object.keys(content).length === 0) return agentNotFound();

    const body = JSON.stringify({
      type: "discussion",
      canonical_url: selfUrl({ author: rootAuthor, permlink: rootPermlink }),
      source: "hive_bridge",
      content
    });

    return agentResponse(body, "application/json; charset=utf-8");
  } catch {
    return agentNotFound();
  }
}
