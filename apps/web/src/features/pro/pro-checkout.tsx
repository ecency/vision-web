"use client";

import { getStripePromise, skuUsdCents } from "@/features/shared/purchase-stripe";
import { StripeCheckoutForm } from "@/features/shared/purchase-stripe/stripe-checkout-form";
import {
  fetchStripeOrderStatus,
  useCreateStripeIntent
} from "@/features/shared/purchase-stripe/use-stripe-points-purchase";
import { Elements } from "@stripe/react-stripe-js";
import { Alert } from "@ui/alert";
import i18next from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { PRO_PRICE_USD, PRO_SKU } from "./pro-config";

const isDarkMode = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

// Fresh per-checkout nonce (guarded for insecure-origin / older WebViews).
const genNonce = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Props {
  /** The buyer (authenticated). ePoints binds the membership to this user. */
  username: string;
  returnUrl: string;
  onActivated: () => void;
  /** Set when returning from a redirect-based method: the intent already exists, so skip
   *  minting and go straight to polling it (Stripe re-appends payment_intent to returnUrl). */
  resumePaymentIntent?: string;
  /** Forwarded from the payment form: true while a Pay submit is in flight (validate,
   *  mint, confirm), false once it settles. The dialog uses it to block closing while a
   *  charge may be completing; a decline flips it back to false. */
  onSubmittingChange?: (submitting: boolean) => void;
}

/**
 * Card payment for Ecency Pro, riding the shared ePoints Stripe rail. Deferred intent
 * flow: the Payment Element renders immediately (mode/amount/currency only) and the
 * PaymentIntent is minted only when the buyer clicks Pay, so an opened-then-closed dialog
 * never creates an abandoned intent. After confirmation the order status is polled; when
 * it reaches "success" ePoints has granted the membership. No tenant step (unlike
 * hosting) -- the SKU alone drives the grant.
 */
export function ProCheckout({
  username,
  returnUrl,
  onActivated,
  resumePaymentIntent,
  onSubmittingChange
}: Props) {
  const [nonce] = useState(genNonce);
  // Non-terminal problems (a decline, a failed mint, element validation): shown above the
  // still-mounted payment form so the buyer can correct and retry.
  const [formError, setFormError] = useState("");
  // Terminal states that replace the checkout (order failed, activation pending).
  const [error, setError] = useState("");
  // On a redirect return the payment is already made; go straight to the activation poll.
  const [activating, setActivating] = useState(!!resumePaymentIntent);
  const pollingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const createIntent = useCreateStripeIntent(username);
  const stripePromise = getStripePromise();
  const amountCents = skuUsdCents(PRO_SKU);

  // Stop polling on unmount.
  useEffect(
    () => () => {
      pollingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  // Mints the PaymentIntent at Pay time (deferred flow). The same nonce is reused on a
  // retry so a double-submit returns the same intent instead of charging twice.
  const mintIntent = useCallback(async () => {
    const { client_secret } = await createIntent.mutateAsync({ sku: PRO_SKU, nonce });
    return client_secret;
  }, [createIntent, nonce]);

  // The poll takes the confirmed intent id as an argument (from onPaid or the resume
  // prop). With deferred minting there is no id in state when the submit closure is
  // created, so deriving it from render-time state here would poll with "".
  const startPoll = useCallback(
    (intentId: string) => {
      if (!intentId || pollingRef.current) return;
      pollingRef.current = true;
      setActivating(true);
      let attempts = 0;
      const MAX_ATTEMPTS = 45; // ~90s
      const poll = async () => {
        if (!pollingRef.current) return;
        try {
          const st = await fetchStripeOrderStatus(username, intentId);
          if (!pollingRef.current) return;
          if (st.status === "success") {
            pollingRef.current = false;
            onActivated();
            return;
          }
          if (st.status === "failed") {
            pollingRef.current = false;
            setActivating(false);
            setError(i18next.t("pro.card-failed"));
            return;
          }
        } catch {
          // transient (network / not-yet-recorded) -> keep polling
        }
        attempts += 1;
        if (attempts >= MAX_ATTEMPTS) {
          // Payment succeeded; ePoints keeps retrying the grant with backoff, so this is not a
          // hard failure -- stop the spinner and reassure rather than loop forever.
          pollingRef.current = false;
          setActivating(false);
          setError(i18next.t("pro.activation-pending"));
          return;
        }
        timerRef.current = setTimeout(poll, 2000);
      };
      poll();
    },
    [username, onActivated]
  );

  // Redirect return: the payment already completed off-page, so start the grant poll on mount.
  useEffect(() => {
    if (resumePaymentIntent) startPoll(resumePaymentIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumePaymentIntent]);

  if (!stripePromise || amountCents === 0) {
    return <Alert appearance="danger">{i18next.t("pro.card-unavailable")}</Alert>;
  }
  if (error) {
    return <Alert appearance="danger">{error}</Alert>;
  }
  if (activating) {
    return <div className="py-6 text-center text-sm opacity-75">{i18next.t("pro.activating")}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A decline or failed mint keeps the form mounted so the buyer can retry. */}
      {formError && <Alert appearance="danger">{formError}</Alert>}
      <Elements
        stripe={stripePromise}
        options={{
          mode: "payment",
          amount: amountCents,
          currency: "usd",
          appearance: { theme: isDarkMode() ? "night" : "stripe" }
        }}
      >
        <StripeCheckoutForm
          returnUrl={returnUrl}
          payLabel={i18next.t("pro.pay-now", { amount: PRO_PRICE_USD.toFixed(2) })}
          createIntent={mintIntent}
          onPaid={(paymentIntentId) => {
            setFormError("");
            startPoll(paymentIntentId);
          }}
          onError={setFormError}
          onSubmittingChange={onSubmittingChange}
        />
      </Elements>
    </div>
  );
}
