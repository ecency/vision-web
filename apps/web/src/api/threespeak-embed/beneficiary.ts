import { BeneficiaryRoute } from "@/entities";

export const THREESPEAK_ACCOUNT = "threespeakfund";
export const THREESPEAK_WEIGHT = 1100; // 11%

/**
 * Check if body content contains a 3Speak embed URL.
 * Matches actual embed URLs (e.g. https://play.3speak.tv/embed?v=user/id),
 * not plain text mentions of "3speak.tv/embed".
 */
export function hasThreeSpeakEmbed(body: string): boolean {
  return /https?:\/\/[a-z.]*3speak\.tv\/embed[?/]/.test(body);
}

/**
 * Enforce the 3Speak beneficiary in a beneficiary list.
 * - If `threespeakfund` already exists, normalizes it to the correct weight.
 * - If missing, appends it.
 * Returns the original array unchanged if no 3Speak embed is detected.
 */
export function enforceThreeSpeakBeneficiary(
  beneficiaries: BeneficiaryRoute[],
  body: string
): BeneficiaryRoute[] {
  if (!hasThreeSpeakEmbed(body)) {
    return beneficiaries;
  }

  const existing = beneficiaries.find((b) => b.account === THREESPEAK_ACCOUNT);
  if (existing && existing.weight === THREESPEAK_WEIGHT) {
    return beneficiaries;
  }
  if (existing) {
    return beneficiaries.map((b) =>
      b.account === THREESPEAK_ACCOUNT ? { ...b, weight: THREESPEAK_WEIGHT } : b
    );
  }
  return [...beneficiaries, { account: THREESPEAK_ACCOUNT, weight: THREESPEAK_WEIGHT }];
}

/**
 * Check if a beneficiary entry is the locked 3Speak beneficiary.
 */
export function isThreeSpeakBeneficiary(account: string): boolean {
  return account === THREESPEAK_ACCOUNT;
}
