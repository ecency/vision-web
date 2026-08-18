"use client";

import { FormEvent, useState } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { newsletterApi, NewsletterApiError } from "@/features/newsletter";
import type { DigestCadence } from "@/features/newsletter";
import { error, success } from "@/features/shared/feedback";
import { LinearProgress } from "@/features/shared/linear-progress";
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

  const handleSubscribe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await newsletterApi.subscribe(
        { email: email.trim(), type: "site", target: "ecency", cadence, source: "landing-page" },
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
      }
      setEmail("");
    } catch (err) {
      const unavailable =
        err instanceof NewsletterApiError && (err.status === 502 || err.status === 503 || err.status === 504);
      error(i18next.t(unavailable ? "newsletter.error-unavailable" : "landing-page.error-occured"));
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
      <button disabled={loading}>
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
