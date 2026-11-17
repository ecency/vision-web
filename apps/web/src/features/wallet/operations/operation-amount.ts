/**
 * Amount rules for the wallet operations dialog by asset (#2127): Hive Engine
 * tokens carry their own precision (up to 8 decimals), the rest use 3.
 */

const DEFAULT_PRECISION = 3;

export function operationAssetPrecision(
  isEngineToken: boolean,
  engineBalances: ReadonlyArray<{ symbol: string; precision?: number }> | undefined,
  asset: string
): number {
  if (!isEngineToken) {
    return DEFAULT_PRECISION;
  }
  const precision = engineBalances?.find((token) => token.symbol === asset)?.precision;
  return typeof precision === "number" && Number.isInteger(precision) && precision >= 0 && precision <= 8
    ? precision
    : DEFAULT_PRECISION;
}

/** The smallest amount of an asset with this precision: 0.001 for 3, 1e-8 for 8. */
export function amountStep(precision: number): number {
  return Number(`1e-${precision}`);
}

/**
 * The amount written with exactly `precision` decimals, cut rather than rounded
 * up (never more than the balance), and never in exponent form (1e-8), which
 * a chain operation does not accept.
 */
export function truncateAmount(value: number, precision: number): string {
  const [whole, fraction = ""] = Math.abs(value).toFixed(Math.min(100, precision + 4)).split(".");
  const sign = value < 0 ? "-" : "";
  return precision > 0 ? `${sign}${whole}.${fraction.slice(0, precision)}` : `${sign}${whole}`;
}
