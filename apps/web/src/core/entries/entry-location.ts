/**
 * A location parsed out of a body marker, in the SAME shape the publish flow
 * writes to `json_metadata.location`: numeric coordinates. This used to hand back
 * the raw captured strings, which every caller had to coerce and which would have
 * thrown in the metadata builder's `lat.toFixed(3)`.
 */
export interface ParsedEntryLocation {
  coordinates: { lat: number; lng: number };
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
  // `[-\d.]+` can capture something that is not a number ("12.5.6"), which used
  // to reach the UI as a broken map pin. No pin is the better answer.
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }

  const cleanedAddress = address?.trim();
  const fallbackAddress =
    !cleanedAddress || cleanedAddress === "<DESCRIPTION GOES HERE>" || cleanedAddress === "d3scr"
      ? `${lat}, ${lng}`
      : cleanedAddress;

  return {
    coordinates: { lat: latitude, lng: longitude },
    address: fallbackAddress
  };
}
