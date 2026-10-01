import i18next from "i18next";

/**
 * Toast text for a rejected useAiAssist call. Every caller goes through this so the
 * status branches cannot drift apart again (#1825).
 *
 * The SDK attaches the HTTP status and the parsed JSON body to the thrown error. A 402
 * from ePoints carries numeric `required` and `available`; when either is missing the
 * value-free variant is used instead of rendering `{{required}}` or inventing a number.
 */
export function getAiAssistErrorMessage(err: unknown): string {
  const { status, data } = (err ?? {}) as {
    status?: number;
    data?: { required?: unknown; available?: unknown; error?: unknown };
  };

  if (status === 402) {
    const required = data?.required;
    const available = data?.available;
    return typeof required === "number" && typeof available === "number"
      ? i18next.t("ai-assist.error-insufficient-points", { required, available })
      : i18next.t("ai-assist.error-insufficient-points-generic");
  }
  // The SDK already waited and re-asked with the same key. The first request is
  // still running and may be charged, so a new click must not look like a free retry.
  // An attempt cut off at the SDK's deadline (AbortError) is just as unresolved.
  if (
    (status === 409 && data?.error === "in_progress") ||
    (err as { name?: unknown } | null)?.name === "AbortError"
  ) {
    return i18next.t("ai-assist.error-in-progress");
  }
  if (status === 422) {
    return i18next.t("ai-assist.error-content-policy");
  }
  if (status === 429) {
    return i18next.t("ai-assist.error-rate-limit");
  }
  return i18next.t("ai-assist.error-generic");
}
