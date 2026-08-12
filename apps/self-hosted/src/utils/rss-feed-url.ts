/**
 * The RSS feed URL for this instance. A managed instance serves its own
 * /rss.xml (written per tenant by the hosting API's sync pass and served
 * statically by nginx); everywhere else the ecency.com feed for the same
 * account or community stands in, so the link never points at a file that
 * does not exist.
 */
export function getRssFeedUrl(
  instanceType: string,
  username: string | undefined,
  communityId: string | undefined,
  managed?: boolean,
): string | null {
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
