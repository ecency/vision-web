import { prefetchQuery } from "@/core/react-query";
import { getDiscussionQueryOptions } from "@ecency/sdk";
import {
  agentNotFound,
  agentResponse,
  loadIndexableEntry,
  selfUrl,
  stringifyAgentEnvelope
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
    const body = stringifyAgentEnvelope((metadata) => ({
      type: "discussion",
      canonical_url: selfUrl({ author: rootAuthor, permlink: rootPermlink }),
      source: "hive_bridge",
      content: Object.fromEntries(
        Object.entries((discussion ?? {}) as Record<string, Entry>).map(([key, value]) => [
          key,
          value ? metadata(value) : value
        ])
      )
    }));

    return agentResponse(body, "application/json; charset=utf-8");
  } catch {
    return agentNotFound();
  }
}
