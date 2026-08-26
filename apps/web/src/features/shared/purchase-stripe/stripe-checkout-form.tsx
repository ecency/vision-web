"use client";

import { Button } from "@ui/button";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import i18next from "i18next";
import { useState } from "react";

interface Props {
  /** Where redirect-based methods return to; card resolves in-page (redirect: if_required). */
  returnUrl: string;
  payLabel: string;
  /**
   * Mints the PaymentIntent at Pay time and resolves to its client_secret. Called only
   * after the Payment Element validated (elements.submit), so an abandoned checkout never
   * creates an intent. A rejection keeps the form mounted so the buyer can retry.
   */
  createIntent: () => Promise<string>;
  /** Fired with the confirmed PaymentIntent id (drives the caller's delivery poll). */
  onPaid: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

/**
 * The Payment Element + confirm button, in Stripe's deferred-intent flow. Rendered ONLY
 * inside an <Elements> initialized with mode/amount/currency (no clientSecret) - it uses
 * the Stripe context. On submit: validate the element, mint the intent via createIntent,
 * then confirm with the fresh client secret. Card payments resolve in-place; a
 * redirect-only method would bounce to returnUrl.
 */
export function StripeCheckoutForm({ returnUrl, payLabel, createIntent, onPaid, onError }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      // Validate the Payment Element (and collect wallet data) BEFORE minting, so an
      // incomplete card never creates an intent. On error the form stays usable.
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(submitError.message ?? i18next.t("stripe-points.pay-failed"));
        return;
      }

      // Mint the PaymentIntent now, at the Pay click. Upstream throws raw i18n keys /
      // axios technical strings; show a stable friendly message and keep the form
      // mounted so the buyer can retry.
      let clientSecret: string;
      try {
        clientSecret = await createIntent();
      } catch {
        onError(i18next.t("stripe-points.create-failed"));
        return;
      }

      // Card confirms in-place; a redirect-based method (if enabled in the dashboard)
      // navigates to return_url and the calling page resumes the flow on return.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        redirect: "if_required",
        confirmParams: { return_url: returnUrl }
      });
      if (error) {
        // card declined / validation / network -- surface Stripe's localized message
        onError(error.message ?? i18next.t("stripe-points.pay-failed"));
        return;
      }
      if (paymentIntent && ["succeeded", "processing"].includes(paymentIntent.status)) {
        onPaid(paymentIntent.id);
        return;
      }
      // requires_action handled by Stripe.js; anything else here is unexpected
      onError(i18next.t("stripe-points.pay-failed"));
    } finally {
      // guarantee the button unlocks even if confirmPayment throws
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Wallets (Google Pay / Apple Pay) explicitly opted in. They render only
          when the Permissions-Policy `payment` feature is delegated to Stripe (see
          next.config.js), the browser/device supports a wallet, and -- for Apple
          Pay -- the domain is registered in the Stripe Dashboard. Card entry is
          unaffected by all of that. */}
      <PaymentElement
        onReady={() => setReady(true)}
        options={{ wallets: { applePay: "auto", googlePay: "auto" } }}
      />
      <Button
        type="submit"
        full={true}
        disabled={!stripe || !elements || !ready || submitting}
        isLoading={submitting}
      >
        {payLabel}
      </Button>
    </form>
  );
}
