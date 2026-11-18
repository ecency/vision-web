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

/** A portfolio layer is Hive Engine whatever its case (the API sends "engine"). */
export function isEngineLayer(layer: string | undefined | null): boolean {
  return layer?.toLowerCase() === "engine";
}

/**
 * Why an engine token's amount cannot be entered yet: its details are still
 * loading, or they did not come (no precision, so no safe amount). Null when
 * nothing is missing.
 */
export function enginePrecisionStatus(
  isEngineToken: boolean,
  knownPrecision: number | null,
  loading: boolean
): "loading" | "unavailable" | null {
  if (!isEngineToken || knownPrecision !== null) {
    return null;
  }
  return loading ? "loading" : "unavailable";
}

/** A finite number as the decimal it prints as: digits x 10^exp. */
function decimalOf(v: number): { digits: bigint; exp: number } {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(v));
  if (!m) return { digits: BigInt(0), exp: 0 };
  const frac = m[3] ?? "";
  return { digits: BigInt(`${m[1]}${m[2]}${frac}`), exp: Number(m[4] ?? 0) - frac.length };
}

/**
 * HP that can be powered down: held, less delegated and already powering
 * down, cut down to whole thousandths (HP has 3 decimals) so it is never more
 * than is available (100.0006 - 20.0004 is 80.000, not 80.001).
 *
 * The sum is done on the decimals the numbers print as, not in floating
 * point, so 0.3 - 0.1 is exactly 0.200 (not 0.199) and a balance just short
 * of the next thousandth (1000000.0009995) is never rounded up, at any size
 * a balance can have (exact up to 2^53 thousandths, about 9e12 HP).
 */
export function availableForPowerDown(hp: number, delegated: number, pending: number): number {
  const parts = [hp, delegated, pending].map((v) => decimalOf(Number.isFinite(v) ? v : 0));
  const exp = Math.min(...parts.map((p) => p.exp));
  const ten = BigInt(10);
  const [h, d, p] = parts.map((x) => x.digits * ten ** BigInt(x.exp - exp));
  const net = h - d - p;
  if (net <= BigInt(0)) return 0;
  // net x 10^exp HP, in thousandths, cut down (net is positive, so BigInt
  // division is a floor).
  const milli = exp + 3 >= 0 ? net * ten ** BigInt(exp + 3) : net / ten ** BigInt(-(exp + 3));
  return Number(milli) / 1000;
}

/** An asset string ("200001.600000 VESTS") or integer count in millionths. */
function micro(v: string | number | undefined, scaled: boolean): bigint {
  const m = /^\s*(\d+)(?:\.(\d*))?/.exec(String(v ?? ""));
  if (!m) return BigInt(0);
  if (!scaled) return BigInt(m[1]);
  return BigInt(m[1] + (m[2] ?? "").padEnd(6, "0").slice(0, 6));
}

interface PowerDownVests {
  vesting_shares: string;
  delegated_vesting_shares: string;
  to_withdraw: string | number;
  withdrawn: string | number;
}

/**
 * HP that can be powered down, worked out from the account's VESTS: held,
 * less delegated and still to withdraw, then converted and cut down to whole
 * thousandths. The HP figures in the wallet parts are each rounded to 3
 * decimals before they are subtracted (100.0008 - 20.0003 becomes
 * 100.001 - 20.000 = 80.001), so they can allow more than the account has.
 */
export function powerDownAvailableFromVests(account: PowerDownVests, hivePerMVests: number): number {
  const held = micro(account.vesting_shares, true);
  const delegated = micro(account.delegated_vesting_shares, true);
  const pending = micro(account.to_withdraw, false) - micro(account.withdrawn, false);
  const net = held - delegated - (pending > BigInt(0) ? pending : BigInt(0));
  if (net <= BigInt(0) || !(hivePerMVests > 0)) return 0;
  // HP = microVESTS x hivePerMVests / 1e12, so thousandths of HP are
  // microVESTS x hivePerMVests / 1e9, done on the decimal of hivePerMVests.
  const rate = decimalOf(hivePerMVests);
  const ten = BigInt(10);
  const shift = rate.exp - 9;
  const milli = shift >= 0 ? net * rate.digits * ten ** BigInt(shift) : (net * rate.digits) / ten ** BigInt(-shift);
  return Number(milli) / 1000;
}
