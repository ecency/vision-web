// Pure gating logic for the account-recovery form, extracted so it can be unit-tested
// without rendering the whole settings component.

import { utils as hiveUtils } from "@ecency/sdk/hive";
import { sanitizeWalletUsername } from "@/features/wallet/utils/sanitize-username";

/**
 * Turn what the user typed into an account name the chain accepts: drop surrounding
 * spaces and a leading "@", lowercase. "@Alice " becomes "alice".
 */
export function normalizeRecoveryAccount(value?: string | null): string {
  return sanitizeWalletUsername(value);
}

/** True when the (normalized) input follows Hive's account name rules. */
export function isValidRecoveryAccount(value?: string | null): boolean {
  return hiveUtils.validateUsername(normalizeRecoveryAccount(value)) === null;
}

export interface RecoverySubmitParams {
  /** The recovery account currently entered in the form. */
  newRecoveryAccount?: string;
  /** The account's existing recovery account (from chain). */
  currentRecoveryAccount?: string;
  /** The signed-in account. */
  activeUsername?: string;
  /** The Ecency-email edit flow was engaged (its pencil sets this). */
  formInitiated: boolean;
}

export interface RecoverySubmitState {
  /** The proposed recovery account is the account itself — never allowed. */
  isSelfRecovery: boolean;
  /** The proposed recovery account differs from the current one. */
  isRecoveryAccountChanged: boolean;
  /** Whether the Update button should be shown. */
  showUpdate: boolean;
  /** Whether a submit should be allowed to proceed. */
  canSubmit: boolean;
}

/**
 * Decide whether the recovery-account form can be submitted. The Update button must appear
 * for a plain recovery-account change (not only after the Ecency-email pencil is clicked),
 * and a self-recovery must never be submittable.
 */
export function computeRecoverySubmitState({
  newRecoveryAccount,
  currentRecoveryAccount,
  activeUsername,
  formInitiated
}: RecoverySubmitParams): RecoverySubmitState {
  newRecoveryAccount = normalizeRecoveryAccount(newRecoveryAccount);
  const isSelfRecovery = !!newRecoveryAccount && newRecoveryAccount === activeUsername;
  const isRecoveryAccountChanged =
    !!newRecoveryAccount && newRecoveryAccount !== currentRecoveryAccount;
  const showUpdate = isRecoveryAccountChanged || formInitiated;
  return {
    isSelfRecovery,
    isRecoveryAccountChanged,
    showUpdate,
    canSubmit: showUpdate && !isSelfRecovery
  };
}
