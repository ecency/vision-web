import dayjs, { type Dayjs } from "./dayjs";
import { parseAsset } from "./parse-asset";

/**
 * Hive stores HBD with three decimals, so 0.001 HBD is both the smallest
 * balance that can accrue interest and the smallest amount the chain can pay
 * out. An estimate under it rounds to nothing and cannot be claimed.
 */
export const MINIMUM_HBD_SAVINGS_AMOUNT = 0.001;
/** HIVE_HBD_INTEREST_COMPOUND_INTERVAL_SEC, expressed in days. */
export const HBD_INTEREST_INTERVAL_DAYS = 30;
/** HIVE_SECONDS_PER_YEAR. */
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
/** What the chain reports for "never happened" on the savings timestamps. */
const UNIX_EPOCH = "1970-01-01T00:00:00";

interface Input {
  /** `savings_hbd_balance`, e.g. "1.099 HBD". */
  savingsHbdBalance?: string;
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
  /** Interest accrued but not yet paid out, in HBD. */
  pendingInterest: number;
  /** The savings balance is at or above the amount the chain can work with. */
  hasSavingsBalance: boolean;
  /** There is at least 0.001 HBD of interest waiting. */
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

function parseSeconds(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function parseChainDate(value: string | undefined): Dayjs | null {
  if (!value || value === UNIX_EPOCH) {
    return null;
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

/**
 * Mirrors `utils/parse-date`'s secondDiff, but against an injectable `now`:
 * chain timestamps carry no zone marker and are UTC.
 */
function secondsSince(value: string | undefined, now: Dayjs): number {
  if (!value || value === UNIX_EPOCH) {
    return 0;
  }

  const zoned = value.indexOf(".") !== -1 || value.indexOf("+") !== -1 ? value : `${value}.000Z`;
  const parsed = new Date(zoned).getTime();
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
  const savingsBalance = parseAsset(savingsHbdBalance ?? "0.000 HBD").amount;
  const safeSavingsBalance = Number.isFinite(savingsBalance) ? savingsBalance : 0;

  // savings_hbd_seconds counts satoshi-seconds; HBD has three decimals.
  const bankedHbdSeconds = parseSeconds(savingsHbdSeconds) / 1000;
  const unbankedHbdSeconds =
    safeSavingsBalance * secondsSince(savingsHbdSecondsLastUpdate, now);

  const pendingInterest =
    hbdInterestRate > 0
      ? ((bankedHbdSeconds + unbankedHbdSeconds) / SECONDS_PER_YEAR) * (hbdInterestRate / 10000)
      : 0;

  const hasSavingsBalance = safeSavingsBalance >= MINIMUM_HBD_SAVINGS_AMOUNT;
  const hasPendingInterest = pendingInterest >= MINIMUM_HBD_SAVINGS_AMOUNT;

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
    savingsBalance: safeSavingsBalance,
    pendingInterest,
    hasSavingsBalance,
    hasPendingInterest,
    isEmpty: !hasSavingsBalance && !hasPendingInterest,
    nextClaimDate,
    isClaimDue,
    needsDepositToClaim: hasPendingInterest && !hasSavingsBalance,
    canClaim: hasPendingInterest && hasSavingsBalance && isClaimDue
  };
}
