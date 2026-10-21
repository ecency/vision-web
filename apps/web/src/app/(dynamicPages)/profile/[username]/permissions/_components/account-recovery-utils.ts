// Pure gating logic for the account-recovery form, extracted so it can be unit-tested
// without rendering the whole settings component.

import i18next from "i18next";
import * as yup from "yup";
import { isValidAccountName, normalizeAccountName } from "@/utils/hive-account-name";

export const recoveryFormSchema = yup.object({
  isEcency: yup.boolean().optional(),
  newRecoveryAccount: yup
    .string()
    .required(i18next.t("validation.required"))
    .test("hive-account-name", i18next.t("validation.invalid-account-name"), isValidAccountName),
  recoveryEmail: yup.string().when("isEcency", {
    is: true,
    then: (s) =>
      s.required(i18next.t("validation.required")).email(i18next.t("validation.invalid-email")),
    otherwise: (s) => s.optional()
  })
});

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
  newRecoveryAccount = normalizeAccountName(newRecoveryAccount);
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
