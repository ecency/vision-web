/**
 * Author-supplied body-image size, as a pair of pixel lengths.
 *
 * Both sides have to be present. A lone width, a percentage, or `auto` does
 * not give the browser an aspect ratio, so it cannot reserve the box and is
 * left stripped. Each side is at most 8192px, and a side more than 40× the
 * other is rejected. That rules out a 1×8192 pair. A 40:1 pair such as
 * 200×8000 is still inside the cap.
 */
export const MAX_IMAGE_DIMENSION_PX = 8192;
/** A side more than this many times the other is not a usable picture ratio. */
export const MAX_IMAGE_DIMENSION_RATIO = 40;

export function parsePixelDimension(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  // Four digits is the whole accepted range (1..8192). Rejecting longer
  // strings here also skips Number() on a multi-kilobyte digit run.
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (n < 1 || n > MAX_IMAGE_DIMENSION_PX) return null;
  return n;
}

/**
 * Both attributes, or nothing. The returned strings are the canonical decimal
 * form (`"0800"` becomes `"800"`) so the same source does not render two ways.
 */
export function authorPixelSize(
  width: string | null | undefined,
  height: string | null | undefined
): { width: string; height: string } | null {
  const w = parsePixelDimension(width);
  const h = parsePixelDimension(height);
  if (w == null || h == null) return null;
  const larger = Math.max(w, h);
  const smaller = Math.min(w, h);
  if (larger / smaller > MAX_IMAGE_DIMENSION_RATIO) return null;
  return { width: String(w), height: String(h) };
}
