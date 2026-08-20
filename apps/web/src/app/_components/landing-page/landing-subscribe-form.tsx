"use client";

import { FormEvent, useRef, useState } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { newsletterApi, NewsletterApiError } from "@/features/newsletter";
import type { DigestCadence } from "@/features/newsletter";
import { error, success } from "@/features/shared/feedback";
import { LinearProgress } from "@/features/shared/linear-progress";
import { Turnstile, TURNSTILE_SITEKEY, type TurnstileHandle } from "@/features/shared/turnstile";
import i18next from "i18next";
import { handleInvalid, handleOnInput } from "@/utils";

/**
 * The homepage newsletter form. It subscribes the address to the site-wide Ecency
 * digest through the newsletter service (via /api/newsletter/subscribe), which double
 * opts it in: the reply to an unproven caller is a bare "pending", and the person's
 * next step is their inbox. A signed-in account is attributed so the service can treat
 * a proven account's request as one action.
 *
 * It replaced a form that wrote to a legacy table nothing ever read.
 */
export function LandingSubscribeForm() {
  const { activeUser } = useActiveAccount();
  const [email, setEmail] = useState("");
  const [cadence, setCadence] = useState<DigestCadence>("weekly");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<"pending" | "active" | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const turnstileRef = useRef<TurnstileHandle>(null);

  // The route challenges a caller with no verified ACCOUNT, and being signed in locally
  // is not the same thing: ensureValidToken returns undefined when the token cannot be
  // refreshed or its stored record is gone, and newsletterApi.subscribe then omits `code`
  // entirely, so the request arrives anonymous. Hiding the widget on activeUser alone
  // would leave that person 403ing forever with no challenge on screen to complete.
  //
  // Rather than predict token health at render time, take the server's word for it: a 403
  // means it wanted a token, so reveal the widget and let them retry.
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const needsCaptcha = !activeUser || captchaRequired;

  // Single-use tokens: a retry that reuses one fails as though the service were down.
  const resetCaptcha = () => {
    setCaptchaToken("");
    turnstileRef.current?.reset();
  };

  const handleSubscribe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // The disabled button is only the visible half: a form can still be submitted from
    // the keyboard while its button is disabled, and posting an empty token would spend
    // a round trip to be told 403.
    if (needsCaptcha && !captchaToken) return;
    setLoading(true);
    try {
      const result = await newsletterApi.subscribe(
        {
          email: email.trim(),
          type: "site",
          target: "ecency",
          cadence,
          source: "landing-page",
          ...(needsCaptcha ? { captchaToken } : {})
        },
        activeUser?.username
      );
      if (result.status === "active") {
        setDone("active");
        success(i18next.t("landing-page.success-message-subscribe"));
      } else if (result.status === "pending_confirmation") {
        setDone("pending");
        success(i18next.t("landing-page.check-inbox"));
      } else {
        // Only a proven, signed-in caller ever sees "refused"; it means a bounce or
        // complaint is on record for that address.
        error(i18next.t("newsletter.refused"));
        if (needsCaptcha) resetCaptcha();
      }
      setEmail("");
    } catch (err) {
      const status = err instanceof NewsletterApiError ? err.status : 0;
      // 403 means the route wanted a token and got none. For a signed-out visitor that is
      // a spent or refused challenge; for a signed-in one it means the token could not be
      // refreshed, so the widget has to appear now or they can never satisfy it.
      if (status === 403) setCaptchaRequired(true);
      const key =
        status === 502 || status === 503 || status === 504
          ? "newsletter.error-unavailable"
          : status === 403
            ? "newsletter.error-captcha"
            : status === 429
              ? "newsletter.error-too-many"
              : "landing-page.error-occured";
      error(i18next.t(key));
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <p className="text-sm">
        {done === "pending"
          ? i18next.t("landing-page.check-inbox")
          : i18next.t("landing-page.success-message-subscribe")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubscribe}>
      <input
        type="email"
        placeholder={i18next.t("landing-page.enter-your-email-adress")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required={true}
        autoComplete="email"
        aria-label={i18next.t("landing-page.enter-your-email-adress")}
        onInvalid={(e: any) => handleInvalid(e, "landing-page.", "validation-email")}
        onInput={handleOnInput}
      />
      <select
        value={cadence}
        onChange={(e) => setCadence(e.target.value as DigestCadence)}
        aria-label={i18next.t("newsletter.cadence-label")}
      >
        <option value="weekly">{i18next.t("newsletter.cadence.weekly")}</option>
        <option value="monthly">{i18next.t("newsletter.cadence.monthly")}</option>
      </select>
      {needsCaptcha && (
        <Turnstile
          ref={turnstileRef}
          sitekey={TURNSTILE_SITEKEY}
          action="newsletter-subscribe"
          onVerify={setCaptchaToken}
          onExpire={() => setCaptchaToken("")}
          onError={() => setCaptchaToken("")}
        />
      )}
      <button disabled={loading || (needsCaptcha && !captchaToken)}>
        {loading ? (
          <span>
            <LinearProgress />
          </span>
        ) : (
          i18next.t("landing-page.send")
        )}
      </button>
    </form>
  );
}
