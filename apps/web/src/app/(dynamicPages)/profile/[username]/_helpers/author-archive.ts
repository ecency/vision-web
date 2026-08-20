import { Entry } from "@/entities";
import { fetchQuery } from "@/core/react-query";
import { getAccountPostsQueryOptions } from "@ecency/sdk";
import { withSlimEntries } from "@/core/entries/slim-entry";

// Hive's bridge.get_account_posts caps `limit` at 20, and it's cursor-based
// (start_author/start_permlink, exclusive). So archive pages use O(1)
// cursor-token pagination: one 20-post fetch per page, the "Older" link carries
// the next cursor. No walking, no depth cap.
export const ARCHIVE_PAGE_SIZE = 20;

// Content sections that expose a crawlable archive.
export const ARCHIVE_SECTIONS = ["posts", "blog", "comments", "replies"];

// Sections whose card content IS the post body, so they cannot be slimmed.
const BODY_BACKED_SECTIONS = ["comments", "replies"];

export interface ArchiveCursor {
  author: string;
  permlink: string;
}

/**
 * Single source of truth for "is this an archive request, and what's the
 * cursor". Used by BOTH the page and generateMetadata so their archive detection
 * can never diverge. Returns null (default/search view) unless there's a valid
 * `before=<author>/<permlink>` cursor, no active search, and a content section.
 */
export function archiveCursor(
  section: string,
  params: { query?: string; before?: string }
): ArchiveCursor | null {
  if (params.query || !params.before || !ARCHIVE_SECTIONS.includes(section)) {
    return null;
  }
  const idx = params.before.indexOf("/");
  if (idx <= 0 || idx >= params.before.length - 1) {
    return null; // must be "author/permlink"
  }
  return { author: params.before.slice(0, idx), permlink: params.before.slice(idx + 1) };
}

/** Serialize a cursor back to its `before=` token. */
export function cursorToken(c: { author: string; permlink: string }): string {
  return `${c.author}/${c.permlink}`;
}

/**
 * Fetch one archive page (the 20 posts older than `cursor`). O(1) — a single
 * bridge call. `hasNext`/`nextCursor` use the same full-page heuristic the feed
 * uses (a full page means there is probably more).
 */
export async function fetchAuthorCursorPage(
  username: string,
  section: string,
  cursor: ArchiveCursor
): Promise<{ entries: Entry[]; hasNext: boolean; nextCursor: ArchiveCursor | null }> {
  const options = getAccountPostsQueryOptions(
    username,
    section,
    cursor.author,
    cursor.permlink,
    ARCHIVE_PAGE_SIZE
  );
  // Comment and reply archives keep their bodies: those cards have no title or
  // metadata to render instead. Post/blog archives render summary cards.
  const entries =
    ((await fetchQuery(
      BODY_BACKED_SECTIONS.includes(section)
        ? options
        : // Own cache identity: this SDK page key is also read by deck columns,
          // which render whole posts.
          withSlimEntries(options, { isolateKey: true })
    )) as unknown as Entry[] | undefined) ?? [];

  const hasNext = entries.length === ARCHIVE_PAGE_SIZE;
  const last = entries[entries.length - 1];
  const nextCursor = hasNext && last ? { author: last.author, permlink: last.permlink } : null;
  return { entries, hasNext, nextCursor };
}
