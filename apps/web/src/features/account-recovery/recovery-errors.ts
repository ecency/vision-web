import i18next from "i18next";

export interface RecoveryApiResult {
  status: number;
  data?: { error?: string; attempts_left?: number; retry_after?: string } | null;
}

/** Errors that mean this page cannot help and the user should contact support. */
export const MANUAL_HELP_ERRORS = new Set([
  "not_ecency_recovery",
  "no_email",
  "no_recent_owner_change",
  "key_not_recent",
  "key_not_sufficient"
]);

/** Errors that end the current request; the user has to start again. */
export const RESTART_ERRORS = new Set([
  "too_many_attempts",
  "code_expired",
  "bad_state",
  "not_found",
  "expired",
  "failed",
  "recovery_account_changed"
]);

export function recoveryErrorCode(result: RecoveryApiResult): string {
  if (result.data?.error) return result.data.error;
  if (result.status >= 500 || result.status === 0) return "unavailable";
  return "generic";
}

export function recoveryErrorMessage(code: string): string {
  return i18next.t(`recover-account.errors.${code}`);
}
