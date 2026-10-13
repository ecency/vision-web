/**
 * Server-side verdict lookup for one wave: did the waves API's image check find
 * an explicit picture in it?
 *
 * The wave page loads its entry from the chain, which knows nothing about that
 * check, so a wave opened by its link would otherwise render its media with no
 * cover. Asked here, on the server, so the cover is in the first HTML rather
 * than appearing after the picture has already been painted.
 *
 * Fails to `false`: an unreachable API must not block or blank a wave page. The
 * author's own `nsfw` tag and the hint a covered card puts on its link still
 * apply when this cannot answer. Mirrors core/sdk-init host selection.
 */

const PRIVATE_API_HOST = process.env.INTERNAL_API_HOST || "https://ecency.com";

// The page is already waiting on the chain for the entry; this runs beside that
// fetch and must never be the slower of the two.
const TIMEOUT_MS = 1500;

export async function isWaveFlaggedNsfw(author: string, permlink: string): Promise<boolean> {
  const name = author.replace(/^@/, "").toLowerCase();
  if (!name || !permlink) {
    return false;
  }

  const url = new URL("/private-api/waves/nsfw", PRIVATE_API_HOST);
  url.searchParams.set("author", name);
  url.searchParams.set("permlink", permlink);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // A verdict lands seconds after a wave is posted and rarely changes after.
      next: { revalidate: 60 }
    });
    if (!res.ok) {
      return false;
    }
    const data: unknown = await res.json();
    const flagged = (data as { flagged?: unknown } | null)?.flagged;
    return Array.isArray(flagged) && flagged.includes(`${name}/${permlink}`);
  } catch {
    return false;
  }
}
