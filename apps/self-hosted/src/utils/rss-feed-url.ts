/**
 * The RSS feed URL for this instance, in priority order: an explicit
 * config override (an independent deployment that runs the SEO generator
 * and serves its own files), the managed instance's own /rss.xml (written
 * per tenant by the hosting API's sync pass), and finally the ecency.com
 * feed for the same account or community, so the link never points at a
 * file that does not exist.
 */
export function getRssFeedUrl(
  instanceType: string,
  username: string | undefined,
  communityId: string | undefined,
  managed?: boolean,
  override?: string,
): string | null {
  // Parsed, not prefix-matched: "https://" or "https://?x" would pass a
  // protocol regex and render a dead feed link instead of the fallback.
  if (typeof override === 'string') {
    try {
      const parsed = new URL(override.trim());
      if (/^https?:$/.test(parsed.protocol) && parsed.hostname) {
        return override.trim();
      }
    } catch {
      // Malformed override: fall through to the derived URLs.
    }
  }
  if (managed && typeof window !== 'undefined') {
    return `${window.location.origin}/rss.xml`;
  }
  if (instanceType === "community") {
    if (!communityId?.trim()) return null;
    return `https://ecency.com/created/${communityId.trim()}/rss`;
  }
  if (!username?.trim()) return null;
  return `https://ecency.com/@${username.trim()}/rss`;
}
