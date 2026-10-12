/**
 * Does a wave's media need a cover before the viewer sees it?
 *
 * Two independent reasons, and either is enough:
 * - `nsfw: true` on the row the waves API returned. The API sets it when its image
 *   check found an explicit picture or the wave is tagged `nsfw`. Such a wave is
 *   already left out of the shared feeds; it still reaches the client on its
 *   author's own feed, which is where this matters.
 * - the wave's own `nsfw` tag, read here too because an entry refetched from the
 *   chain replaces the API row and carries no `nsfw` field at all.
 *
 * The threshold lives on the server: this reads the boolean and never a score, so
 * the line can move without a web release.
 */
type MaybeFlagged =
  | {
      nsfw?: unknown;
      json_metadata?: { tags?: unknown } | null;
    }
  | null
  | undefined;

function taggedNsfw(entry: MaybeFlagged): boolean {
  const tags = entry?.json_metadata?.tags;
  return (
    Array.isArray(tags) &&
    tags.some((tag) => typeof tag === "string" && tag.trim().toLowerCase() === "nsfw")
  );
}

export function waveNeedsNsfwCover(...entries: MaybeFlagged[]): boolean {
  return entries.some((entry) => entry?.nsfw === true || taggedNsfw(entry));
}

/**
 * Flagged waves seen in a feed during this visit.
 *
 * The single wave page loads its entry from the chain, which knows nothing about
 * the image check. Without this, clicking a covered card (anywhere but its reveal
 * button) would open the same picture full size one navigation later. In memory
 * only: a cold link to a wave carries no verdict, and that case is not covered.
 */
const seenFlagged = new Set<string>();

export function rememberNsfwWave(author: string, permlink: string): void {
  seenFlagged.add(`${author}/${permlink}`);
}

export function isRememberedNsfwWave(author?: string, permlink?: string): boolean {
  return Boolean(author && permlink && seenFlagged.has(`${author}/${permlink}`));
}
