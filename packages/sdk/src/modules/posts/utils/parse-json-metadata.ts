/**
 * Read an entry's `json_metadata` as the object every reader assumes it is.
 *
 * Which shape it arrives in depends on the API that produced the entry:
 * `bridge.*` parses it, `condenser_api.get_content` hands back the raw string,
 * and both are cast to `Entry`, whose type says object. A reader that takes a
 * field straight off the value therefore reads `undefined` for half the app's
 * entries rather than the field the post published.
 *
 * On-chain metadata is also whatever the publishing client wrote: unparseable
 * text, a JSON array or a bare literal all reach here, and each returns null so
 * callers treat it as "no metadata" instead of indexing into junk.
 */
export function parseJsonMetadata(value: unknown): Record<string, unknown> | null {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }

  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}
