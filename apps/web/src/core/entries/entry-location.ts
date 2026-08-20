/**
 * A location parsed out of a body marker. Its coordinates are the raw captured
 * strings: that is what this marker has always produced, and every consumer
 * either interpolates them into a map URL or runs them through `Number(...)`.
 * The publish flow writes numeric coordinates instead, hence the separate shape.
 */
export interface ParsedEntryLocation {
  coordinates: { lat: string; lng: string };
  address?: string;
}

// Worldmappin/pinmapple publish a post's coordinates as an HTML-comment marker in
// the body, so the pin can only be recovered while the body is still around.
const WORLDMAPPIN_RE =
  /\[\/\/\]:#\s\(\!(?:worldmappin|pinmapple)\s+([-\d.]+)\s+lat\s+([-\d.]+)\s+long(?:\s+(.*?))?(?:\s+d3scr)?\)/i;

/**
 * Coordinates parsed out of a worldmappin/pinmapple body marker, or undefined.
 *
 * Shared by `useEntryLocation` (which reads a full entry at render time) and the
 * feed slim step (which lifts the result into `json_metadata.location` before it
 * drops the body), so a feed card and a post page resolve the same pin.
 */
export function parseEntryLocationFromBody(body?: string): ParsedEntryLocation | undefined {
  if (!body) {
    return undefined;
  }

  const match = body.match(WORLDMAPPIN_RE);
  if (!match) {
    return undefined;
  }

  const [, lat, lng, address] = match;
  const cleanedAddress = address?.trim();
  const fallbackAddress =
    !cleanedAddress || cleanedAddress === "<DESCRIPTION GOES HERE>" || cleanedAddress === "d3scr"
      ? `${lat}, ${lng}`
      : cleanedAddress;

  return {
    coordinates: { lat, lng },
    address: fallbackAddress
  };
}
