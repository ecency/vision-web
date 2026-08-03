/**
 * Hive reputation as something a reader can act on.
 *
 * The sidebar has always printed the bare integer, which means nothing to
 * anyone who has not learned the scale. The number stays, because it is the
 * thing other Hive tools show, but it is now labelled.
 *
 * Bands are on the converted 0-to-100ish scale the bridge API returns, not raw
 * rshares reputation.
 */
export type ReputationBand = 'new' | 'established' | 'longstanding';

export interface ResolvedReputation {
  band: ReputationBand;
  score: number;
}

/**
 * The band and rounded score, or null when there is nothing to say.
 *
 * Null for anything at or below zero. `getAccountFullQueryOptions` degrades to
 * `reputation: 0` when the bridge profile call fails, so zero is
 * indistinguishable from a transport fault. Labelling that "New" would assert
 * something the app has not established; printing "0" is what it does today and
 * is just as wrong. Saying nothing is the only honest option.
 */
export function resolveReputation(
  reputation: unknown,
): ResolvedReputation | null {
  if (typeof reputation !== 'number' || !Number.isFinite(reputation)) {
    return null;
  }
  if (reputation <= 0) return null;

  const score = Math.floor(reputation);
  if (score < 40) return { band: 'new', score };
  if (score < 70) return { band: 'established', score };
  return { band: 'longstanding', score };
}
