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
    data?: { required?: unknown; available?: unknown };
  };

  if (status === 402) {
    const required = data?.required;
    const available = data?.available;
    return typeof required === "number" && typeof available === "number"
      ? i18next.t("ai-assist.error-insufficient-points", { required, available })
      : i18next.t("ai-assist.error-insufficient-points-generic");
  }
  if (status === 422) {
    return i18next.t("ai-assist.error-content-policy");
  }
  if (status === 429) {
    return i18next.t("ai-assist.error-rate-limit");
  }
  return i18next.t("ai-assist.error-generic");
}
