import dayjs, { type Dayjs } from "./dayjs";

/**
 * Hive stores HBD with three decimals, so 0.001 HBD is the smallest balance
 * that can sit in savings at all, and the smallest amount the chain can pay.
 */
export const MINIMUM_HBD_SAVINGS_AMOUNT = 0.001;
/** HIVE_HBD_INTEREST_COMPOUND_INTERVAL_SEC, expressed in days. */
export const HBD_INTEREST_INTERVAL_DAYS = 30;
/** HIVE_SECONDS_PER_YEAR. */
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;
/** HIVE_100_PERCENT: hbd_interest_rate is expressed against this. */
const HUNDRED_PERCENT = 10000n;
/** HBD is stored with three decimals, so one satoshi is 0.001 HBD. */
const SATOSHIS_PER_HBD = 1000n;
/** What the chain reports for "never happened" on the savings timestamps. */
const UNIX_EPOCH = "1970-01-01T00:00:00";

interface Input {
  /**
   * `savings_hbd_balance`, e.g. "1.099 HBD". Nodes may also serve the
   * `{ amount, precision, nai }` object form.
   */
  savingsHbdBalance?: string | number | { amount?: unknown; precision?: unknown } | null;
  /** `savings_hbd_seconds`: HBD satoshi-seconds banked since the last payout. */
  savingsHbdSeconds?: number | string;
  /** `savings_hbd_seconds_last_update`. */
  savingsHbdSecondsLastUpdate?: string;
  /** `savings_hbd_last_interest_payment`. */
  savingsHbdLastInterestPayment?: string;
  /** `hbd_interest_rate` from the dynamic global properties, in basis points. */
  hbdInterestRate: number;
  /** Injectable for tests; defaults to now. */
  now?: Dayjs;
}

export interface HbdSavingsInterestState {
  savingsBalance: number;
  /**
   * Interest accrued but not yet paid out, in HBD. This is exactly what the
   * chain would pay, to the satoshi, so it always renders whole at three
   * decimals.
   */
  pendingInterest: number;
  /** The same figure in satoshis, which is the unit the chain settles in. */
  pendingInterestSatoshis: number;
  /** The savings balance is at or above the amount the chain can work with. */
  hasSavingsBalance: boolean;
  /** The chain would pay at least one satoshi. */
  hasPendingInterest: boolean;
  /** Nothing accrued and nothing saved: there is nothing to tell the user. */
  isEmpty: boolean;
  /** When the chain will next release interest, or null when unknown. */
  nextClaimDate: Dayjs | null;
  /** The 30-day compounding interval has elapsed. */
  isClaimDue: boolean;
  /**
   * Claiming works by broadcasting a 0.001 HBD transfer out of savings, which
   * makes the chain settle the interest first. With an empty savings balance
   * that transfer cannot be made, so the interest is real but unreachable
   * until something is deposited.
   */
  needsDepositToClaim: boolean;
  canClaim: boolean;
}

/**
 * `savings_hbd_seconds` counts satoshi-seconds and outgrows a double for large
 * balances, so nodes may serve it as a string. Read it as an integer either way.
 */
function parseBankedSeconds(value: number | string | undefined): bigint {
  if (typeof value === "number") {
    return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
  }

  if (typeof value === "string") {
    const digits = value.trim().match(/^\d+/);
    if (digits) {
      return BigInt(digits[0]);
    }
  }

  return 0n;
}

/**
 * The satoshi value of an HBD balance, read off the digits rather than through
 * a float so a large balance keeps every unit. Accepts the two shapes a Hive
 * node can serve: "1.099 HBD" from condenser_api, and the
 * `{ amount, precision, nai }` object from database_api. Anything else, a
 * negative included, reads as nothing rather than throwing: this runs during
 * render of the wallet page.
 */
function parseHbdSatoshis(value: unknown): bigint {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? BigInt(Math.round(value * 1000)) : 0n;
  }

  if (value && typeof value === "object") {
    const asset = value as { amount?: unknown; precision?: unknown };
    const digits = String(asset.amount ?? "").trim().match(/^\d+/);
    const precision = Number(asset.precision ?? 3);
    if (!digits || !Number.isInteger(precision) || precision < 0 || precision > 12) {
      return 0n;
    }
    // Rescale whatever precision the node used to HBD's three decimals.
    const raw = BigInt(digits[0]);
    return precision >= 3
      ? raw / 10n ** BigInt(precision - 3)
      : raw * 10n ** BigInt(3 - precision);
  }

  if (typeof value !== "string") {
    return 0n;
  }

  const matched = value.trim().match(/^(\d+)(?:\.(\d{0,3}))?/);
  if (!matched) {
    return 0n;
  }

  const fraction = (matched[2] ?? "").padEnd(3, "0");
  return BigInt(matched[1]) * SATOSHIS_PER_HBD + BigInt(fraction);
}

/** Chain timestamps carry no zone marker and are UTC. */
function asUtcInstant(value: string): string {
  return value.indexOf(".") !== -1 || value.indexOf("+") !== -1 ? value : `${value}.000Z`;
}

/**
 * Reads a chain timestamp as the instant it denotes. Passing the bare string to
 * dayjs would read it as LOCAL time, which shifts the claim schedule by the
 * viewer's offset: up to 14 hours, enough to say "ready to claim now" while the
 * chain would still refuse. The result stays in local mode so it still formats
 * and reads relative in the viewer's own timezone.
 */
function parseChainDate(value: string | undefined): Dayjs | null {
  if (!value || value === UNIX_EPOCH) {
    return null;
  }

  const parsed = dayjs(asUtcInstant(value));
  return parsed.isValid() ? parsed : null;
}

/** Mirrors `utils/parse-date`'s secondDiff, but against an injectable `now`. */
function secondsSince(value: string | undefined, now: Dayjs): number {
  if (!value || value === UNIX_EPOCH) {
    return 0;
  }

  const parsed = new Date(asUtcInstant(value)).getTime();
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.abs(Math.round((now.valueOf() - parsed) / 1000));
}

/**
 * Reproduces the chain's savings interest accounting (`adjust_savings_balance`
 * in hived) so the wallet can show what a claim would release.
 *
 * `savings_hbd_seconds` is the balance-seconds the chain has already banked,
 * in satoshis, and it only resets when interest is actually paid. Everything
 * since `savings_hbd_seconds_last_update` has not been banked yet, so it has to
 * be added back. A payout needs both a savings balance change and 30 days since
 * the last payment, which is why a zero balance does not imply zero interest:
 * withdrawing everything inside that window leaves the accrued seconds standing.
 */
export function getHbdSavingsInterestState({
  savingsHbdBalance,
  savingsHbdSeconds,
  savingsHbdSecondsLastUpdate,
  savingsHbdLastInterestPayment,
  hbdInterestRate,
  now = dayjs()
}: Input): HbdSavingsInterestState {
  const balanceSatoshis = parseHbdSatoshis(savingsHbdBalance);
  const savingsBalance = Number(balanceSatoshis) / Number(SATOSHIS_PER_HBD);

  // Everything the chain has banked, plus everything earned since it last
  // looked, in satoshi-seconds.
  const totalSatoshiSeconds =
    parseBankedSeconds(savingsHbdSeconds) +
    balanceSatoshis * BigInt(secondsSince(savingsHbdSecondsLastUpdate, now));

  // hived's own arithmetic, in the same order: both divisions truncate, so
  // computing this in floating point rounds the estimate UP past what the
  // chain will actually pay.
  // A malformed dynamic-properties payload must not throw out of a render.
  const rate = Number.isFinite(hbdInterestRate)
    ? BigInt(Math.max(0, Math.trunc(hbdInterestRate)))
    : 0n;
  const pendingInterestSatoshis =
    rate > 0n ? ((totalSatoshiSeconds / SECONDS_PER_YEAR) * rate) / HUNDRED_PERCENT : 0n;
  const pendingInterest = Number(pendingInterestSatoshis) / Number(SATOSHIS_PER_HBD);

  const hasSavingsBalance = balanceSatoshis >= 1n;
  const hasPendingInterest = pendingInterestSatoshis >= 1n;

  // The chain measures the interval from the last payment. Accounts that have
  // never been paid fall back to when the seconds started accumulating, which
  // is the earliest point a payout could have been due.
  const claimReference =
    parseChainDate(savingsHbdLastInterestPayment) ??
    parseChainDate(savingsHbdSecondsLastUpdate);
  const nextClaimDate = claimReference
    ? claimReference.add(HBD_INTEREST_INTERVAL_DAYS, "day")
    : null;
  const isClaimDue = nextClaimDate ? now.isAfter(nextClaimDate) : false;

  return {
    savingsBalance,
    pendingInterest,
    pendingInterestSatoshis: Number(pendingInterestSatoshis),
    hasSavingsBalance,
    hasPendingInterest,
    isEmpty: !hasSavingsBalance && !hasPendingInterest,
    nextClaimDate,
    isClaimDue,
    needsDepositToClaim: hasPendingInterest && !hasSavingsBalance,
    canClaim: hasPendingInterest && hasSavingsBalance && isClaimDue
  };
}
