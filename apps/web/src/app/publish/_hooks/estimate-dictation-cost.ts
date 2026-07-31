interface DictationPricing {
  unitSeconds: number;
  unitCost: number;
  /** Free units left today. Zero for regular members; only Ecency Pro has any. */
  freeRemaining: number;
}

/**
 * Points a clip of this length will cost.
 *
 * Mirrors the server's arithmetic so the figure shown while recording matches what
 * is actually charged. Two rules carry the whole thing:
 *
 * Duration rounds UP to a whole unit, so a 5s clip and a 30s clip cost the same.
 * A clip shorter than one unit still costs one, because the vendor bills a minimum
 * per request regardless.
 *
 * The free allowance is denominated in units rather than requests, so it discounts
 * the first N units of a long clip instead of making the whole clip free.
 */
export function estimateDictationCost(
  seconds: number,
  { unitSeconds, unitCost, freeRemaining }: DictationPricing
): number {
  const units = Math.max(1, Math.ceil(seconds / unitSeconds));
  const billableUnits = Math.max(0, units - Math.max(0, freeRemaining));
  return billableUnits * unitCost;
}
