/**
 * 3Speak takes an 11% beneficiary share on posts that embed one of its videos.
 *
 * This lives in the SDK because the rule is a payout contract that both the web app and the
 * mobile app have to apply identically. It was previously duplicated in each, which meant a
 * change to the weight, or to what counts as an embed, could land on one platform and not the
 * other and silently misroute revenue.
 */

/** A beneficiary route as it appears in `comment_options`. */
export interface ThreeSpeakBeneficiaryRoute {
  account: string;
  weight: number;
  src?: string;
}

export const THREESPEAK_BENEFICIARY_ACCOUNT = "threespeakfund";

/** Beneficiary weight in basis points: 1100 = 11%. */
export const THREESPEAK_BENEFICIARY_WEIGHT = 1100;

/**
 * Whether the body embeds a 3Speak video.
 *
 * Matches an actual embed url (e.g. `https://play.3speak.tv/embed?v=user/id`), not a plain
 * text mention of "3speak.tv/embed", which would otherwise attach an 11% route to a post that
 * merely talks about 3Speak.
 *
 * Note this requires an `/embed` path segment. The embed url is not built locally, it comes
 * back from 3Speak on upload, so if that shape ever changes this predicate stops recognising
 * it and the route is silently not attached.
 */
export function hasThreeSpeakEmbed(body: string): boolean {
  return /https?:\/\/[a-z.]*3speak\.tv\/embed[?/]/.test(body);
}

/**
 * Ensures the 3Speak beneficiary is present, at the correct weight, when the body embeds a
 * 3Speak video. Other beneficiaries are preserved and the input is never mutated. Returns the
 * original array reference untouched when there is nothing to change, so callers can use it as
 * a cheap equality check.
 */
export function enforceThreeSpeakBeneficiary<T extends ThreeSpeakBeneficiaryRoute>(
  beneficiaries: T[],
  body: string
): (T | ThreeSpeakBeneficiaryRoute)[] {
  if (!hasThreeSpeakEmbed(body)) {
    return beneficiaries;
  }

  const existing = beneficiaries.find((b) => b.account === THREESPEAK_BENEFICIARY_ACCOUNT);

  if (existing && existing.weight === THREESPEAK_BENEFICIARY_WEIGHT) {
    return beneficiaries;
  }

  if (existing) {
    return beneficiaries.map((b) =>
      b.account === THREESPEAK_BENEFICIARY_ACCOUNT
        ? { ...b, weight: THREESPEAK_BENEFICIARY_WEIGHT }
        : b
    );
  }

  return [
    ...beneficiaries,
    { account: THREESPEAK_BENEFICIARY_ACCOUNT, weight: THREESPEAK_BENEFICIARY_WEIGHT }
  ];
}

/** Whether a beneficiary entry is the 3Speak route, which the UI locks from editing. */
export function isThreeSpeakBeneficiary(account: string): boolean {
  return account === THREESPEAK_BENEFICIARY_ACCOUNT;
}
