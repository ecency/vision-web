/** The shape of a tag on chain; anything else never reaches a URL. */
export const NOTIFICATION_TAG_SHAPE = /^[a-z0-9-]{1,32}$/;

/**
 * The tag a `tags` notification is about, read from the wire with the wire's
 * own types checked rather than the declared ones: a post row lists its matches
 * in `tags` and shows the first, a bundle names its one tag in `tag`. Anything
 * that is not a well-formed string tag reads as "", so a number does not become
 * a `/created/123` route and a bare string is not indexed into its first letter.
 */
export function notificationTag(row: { tag?: unknown; tags?: unknown } | null | undefined): string {
  if (!row) {
    return "";
  }
  const first = Array.isArray(row.tags) ? row.tags[0] : undefined;
  const candidate = typeof first === "string" ? first : typeof row.tag === "string" ? row.tag : "";
  return NOTIFICATION_TAG_SHAPE.test(candidate) ? candidate : "";
}
