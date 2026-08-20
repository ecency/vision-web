import { Entry } from "@/entities";
import { withSlimEntries } from "@/core/entries/slim-entry";
import { fetchQuery } from "@/core/react-query";
import { getPostsRankedQueryOptions } from "@ecency/sdk";

// bridge.get_ranked_posts caps `limit` at 20 and its cursor
// (start_author/start_permlink) is exclusive (verified), so tag/community
// archives use O(1) cursor-token pagination — one 20-post fetch per page.
export const ARCHIVE_PAGE_SIZE = 20;

// Feed/community sorts that get a crawlable archive (content ordering only;
// payout/muted/promoted are not content histories).
export const ARCHIVE_FILTERS = ["created", "trending", "hot"];

export interface ArchiveCursor {
  author: string;
  permlink: string;
}

export function parseArchiveCursor(before?: string): ArchiveCursor | null {
  if (!before) {
    return null;
  }
  const idx = before.indexOf("/");
  if (idx <= 0 || idx >= before.length - 1) {
    return null; // must be "author/permlink"
  }
  return { author: before.slice(0, idx), permlink: before.slice(idx + 1) };
}

export function cursorToken(c: ArchiveCursor): string {
  return `${c.author}/${c.permlink}`;
}

/** Whether a feed/community sort has a crawlable archive. */
export function isArchivableFilter(filter: string): boolean {
  return ARCHIVE_FILTERS.includes(filter);
}

// HISTORICAL shrink allowance: the SDK's ranked-feed select used to keep one
// pinned entry and drop the rest, so a full raw community page could surface
// as 16-19 entries. The SDK now keeps every pin (processed length == raw
// length), so callers use the exact full-page gate; `allowPinShrink` remains
// only as a documented fallback should that select ever regress. Pin presence
// alone never implies fullness (a 5-post community with one pin also shows a
// pin), hence the bounded window.
export const PIN_DEDUPE_ALLOWANCE = 4;

/**
 * Cursor token for the page-1 "Older" archive link, or null when page 1 gives
 * no evidence that older content exists (emitting a link whose target
 * immediately redirects back would be a crawl trap).
 *
 * Callers should only emit the link for the `created` sort: the SDK re-sorts
 * processed pages by created date, so a cursor taken from a processed
 * trending/hot page would not match the bridge's rank order (overlapping
 * chain), and the created chain already reaches every post.
 */
export function olderCursorToken(
  entries: (Entry | null | undefined)[],
  allowPinShrink = false
): string | null {
  const page = entries.filter((e): e is Entry => !!e);
  const last = page[page.length - 1];
  if (!last) return null;
  const full = page.length >= ARCHIVE_PAGE_SIZE;
  const pinShrunk =
    allowPinShrink &&
    page.length >= ARCHIVE_PAGE_SIZE - PIN_DEDUPE_ALLOWANCE &&
    page.some((e) => e.stats?.is_pinned);
  return full || pinShrunk
    ? cursorToken({ author: last.author, permlink: last.permlink })
    : null;
}

/** A tag page is archivable on content sorts, for a real topic tag only. */
export function isArchivableTag(filter: string, tag: string): boolean {
  return (
    isArchivableFilter(filter) &&
    !!tag &&
    tag !== "my" &&
    !tag.startsWith("@") &&
    !tag.startsWith("%40")
  );
}

/**
 * Fetch one ranked-feed archive page (the 20 posts older than `cursor`) for a
 * tag or a community id. O(1) — a single bridge.get_ranked_posts call.
 * `observer` mirrors the default feed so a logged-in user's muted-user/content
 * filtering applies to archive pages too.
 */
export async function fetchRankedCursorPage(
  sort: string,
  tag: string,
  cursor: ArchiveCursor,
  observer = ""
): Promise<{ entries: Entry[]; nextCursor: ArchiveCursor | null }> {
  const entries =
    ((await fetchQuery(
      // Slim like the live feed: these pages render the same cards, and they are
      // the crawler-facing copy, where payload weight matters most.
      withSlimEntries(
        getPostsRankedQueryOptions(
          sort,
          cursor.author,
          cursor.permlink,
          ARCHIVE_PAGE_SIZE,
          tag,
          observer
        ),
        // Own cache identity: this SDK page key is also read by deck columns,
        // which render whole posts.
        { isolateKey: true }
      )
    )) as unknown as Entry[] | undefined) ?? [];
  const last = entries[entries.length - 1];
  const nextCursor =
    entries.length === ARCHIVE_PAGE_SIZE && last
      ? { author: last.author, permlink: last.permlink }
      : null;
  return { entries, nextCursor };
}
