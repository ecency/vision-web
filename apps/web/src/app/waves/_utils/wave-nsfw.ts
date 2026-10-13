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
 * The hint a covered card puts on the link to its wave page.
 *
 * The wave page loads its entry from the chain, which knows nothing about the
 * image check, so without a hint the picture a card was covering would be shown
 * full size one navigation later. It travels in the URL rather than in memory
 * because a card can be opened in a new tab (a separate realm with its own
 * storage), and so that a link copied from that tab stays covered too.
 *
 * It can only ADD a cover, and it is the fallback: the wave page also asks the
 * API for the verdict on the server (see server/wave-nsfw.ts), which is what
 * covers a wave opened by a plain link.
 */
export const WAVE_NSFW_PARAM = "sensitive";

export function withNsfwHint(path: string, flagged: boolean): string {
  return flagged ? `${path}?${WAVE_NSFW_PARAM}=1` : path;
}

export function hasNsfwHint(params: { get(name: string): string | null } | null | undefined): boolean {
  return params?.get(WAVE_NSFW_PARAM) === "1";
}
