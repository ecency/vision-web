/**
 * Converts Hive's raw reputation to the human-readable 0-100 scale, passing
 * through values that are already on it (the bridge returns both shapes
 * depending on the endpoint).
 */
const isHumanReadable = (input: number): boolean =>
  Math.abs(input) > 0 && Math.abs(input) <= 100;

export function accountReputation(input: string | number): number {
  if (typeof input === "number" && isHumanReadable(input)) {
    return Math.floor(input);
  }

  if (typeof input === "string") {
    input = Number(input);

    if (isHumanReadable(input)) {
      return Math.floor(input);
    }
  }

  if (input === 0) {
    return 25;
  }

  let neg = false;

  if (input < 0) {
    neg = true;
  }

  let reputationLevel = Math.log10(Math.abs(input as number));
  reputationLevel = Math.max(reputationLevel - 9, 0);

  if (reputationLevel < 0) {
    reputationLevel = 0;
  }

  if (neg) {
    reputationLevel *= -1;
  }

  reputationLevel = reputationLevel * 9 + 25;

  return Math.floor(reputationLevel);
}
