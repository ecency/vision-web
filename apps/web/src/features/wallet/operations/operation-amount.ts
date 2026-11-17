/**
 * Amount rules for the wallet operations dialog by asset (#2127): Hive Engine
 * tokens carry their own precision (up to 8 decimals), the rest use 3.
 */

const DEFAULT_PRECISION = 3;

export function operationAssetPrecision(
  isEngineToken: boolean,
  engineBalances:
    | ReadonlyArray<{ symbol: string; precision?: number; precisionKnown?: boolean }>
    | undefined,
  asset: string
): number | null {
  if (!isEngineToken) {
    return DEFAULT_PRECISION;
  }
  // Unknown until the token is found: guessing 3 would cut an 8-decimal
  // amount, so the dialog waits (null) instead.
  const token = engineBalances?.find((t) => t.symbol === asset);
  const precision = token?.precisionKnown === false ? undefined : token?.precision;
  return typeof precision === "number" && Number.isInteger(precision) && precision >= 0 && precision <= 8
    ? precision
    : null;
}

/** The smallest amount of an asset with this precision: 0.001 for 3, 1e-8 for 8. */
export function amountStep(precision: number): number {
  return Number(`1e-${precision}`);
}

/** The shortest decimal form of a number, never in exponent form. */
function plainDecimal(value: number): string {
  const s = String(Math.abs(value));
  const e = s.indexOf("e");
  if (e === -1) return s;
  const mantissa = s.slice(0, e);
  const exponent = Number(s.slice(e + 1));
  const dot = mantissa.indexOf(".");
  const digits = mantissa.replace(".", "");
  const point = (dot === -1 ? mantissa.length : dot) + exponent;
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return digits + "0".repeat(point - digits.length);
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * The amount written with exactly `precision` decimals, cut rather than rounded
 * up (never more than the balance), and never in exponent form (1e-8), which
 * a chain operation does not accept. Cut from the number's shortest decimal
 * form, so a typed 123456.00000001 is sent as typed, not one unit short.
 */
export function truncateAmount(value: number, precision: number): string {
  const [whole, fraction = ""] = plainDecimal(value).split(".");
  const sign = value < 0 ? "-" : "";
  return precision > 0
    ? `${sign}${whole}.${fraction.slice(0, precision).padEnd(precision, "0")}`
    : `${sign}${whole}`;
}
