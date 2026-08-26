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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const isDarkMode = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

// Fresh per-checkout nonce (guarded for insecure-origin / older WebViews).
const genNonce = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Props {
  /** The buyer / payer (authenticated). ePoints binds the Stripe order to this user; the
   *  recipient below is credited the Points, but the charge is on the payer. */
  username: string;
  /** The Points SKU for the chosen pack (e.g. "999points"). */
  sku: string;
  /** The Hive account credited the purchased Points (not the payer). */
  recipient: string;
  /** Optional short note carried with the gift. */
  message?: string;
  payLabel: string;
  returnUrl: string;
  /** Fired only on a real `success` order status (Points confirmed credited to the recipient). */
  onDelivered: () => void;
  /** Fired when the payment succeeded but delivery has not confirmed within the poll window --
   *  the gift is in flight, NOT confirmed. The parent must show a pending (not success) message. */
  onPending?: () => void;
  /** Fired once the card is confirmed (payment taken) so the parent can lock the form. */
  onConfirmed?: () => void;
  /** Forwarded from the payment form: true while a Pay submit is in flight (validate,
   *  mint, confirm), false once it settles. The parent must disable the gift selection
   *  controls while true so an in-flight payment cannot be detached from what the buyer
   *  sees; a decline flips it back to false so selections stay editable after a failed
   *  attempt. */
  onSubmittingChange?: (submitting: boolean) => void;
}

/**
 * Card payment for gifting Points, riding the shared ePoints Stripe rail. Deferred intent
 * flow: the Payment Element renders immediately and the PaymentIntent is minted only on
 * the Pay click -- passing `gift_recipient` + `gift_message` so ePoints credits the
 * recipient instead of the payer -- then confirmed, then the order status is polled until
 * the worker delivers. Browsing packs or abandoning the form never creates an intent.
 */
export function GiftCardCheckout({
  username,
  sku,
  recipient,
  message,
  payLabel,
  returnUrl,
  onDelivered,
  onPending,
  onConfirmed,
  onSubmittingChange
}: Props) {
  // The nonce is the create-intent idempotency key (user:sku:nonce server-side), so it
  // must change when the checkout identity (sku, recipient or message) changes: a Pay for
  // recipient A followed by an edit to recipient B and a second Pay would otherwise reuse
  // intent A with A's gift metadata. Fresh nonce per (sku, recipient, message).
  const nonce = useMemo(genNonce, [sku, recipient, message]);
  // Non-terminal problems (a decline, a failed mint, element validation): shown above the
  // still-mounted payment form so the buyer can correct and retry.
  const [formError, setFormError] = useState("");
  // Terminal states that replace the checkout (order failed after payment).
  const [error, setError] = useState("");
  const [delivering, setDelivering] = useState(false);
  const pollingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const createIntent = useCreateStripeIntent(username);
  const stripePromise = getStripePromise();
  const amountCents = skuUsdCents(sku);

  // Stop polling on unmount.
  useEffect(
    () => () => {
      pollingRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  // Mints the PaymentIntent at Pay time with the CURRENT gift fields, so the intent's
  // metadata always matches what the UI shows.
  const mintIntent = useCallback(async () => {
    const { client_secret } = await createIntent.mutateAsync({
      sku,
      nonce,
      gift_recipient: recipient,
      gift_message: message?.trim() || undefined
    });
    return client_secret;
  }, [createIntent, sku, nonce, recipient, message]);

  // The poll takes the confirmed intent id from onPaid; with deferred minting there is no
  // client secret in render state to derive it from.
  const startPoll = useCallback(
    (intentId: string) => {
      if (!intentId || pollingRef.current) return;
      pollingRef.current = true;
      setDelivering(true);
      // Payment is confirmed -- tell the parent to lock the form so a remount can't cancel
      // this poll and strand a paid user.
      onConfirmed?.();
      let attempts = 0;
      const MAX_ATTEMPTS = 45; // ~90s
      const poll = async () => {
        if (!pollingRef.current) return;
        try {
          const st = await fetchStripeOrderStatus(username, intentId);
          if (!pollingRef.current) return;
          if (st.status === "success") {
            pollingRef.current = false;
            onDelivered();
            return;
          }
          if (st.status === "failed") {
            pollingRef.current = false;
            setDelivering(false);
            setError(i18next.t("points-gift.delivery-failed"));
            return;
          }
        } catch {
          // transient (network / not-yet-recorded) -> keep polling
        }
        attempts += 1;
        if (attempts >= MAX_ATTEMPTS) {
          // Payment succeeded but delivery never confirmed within the window. ePoints keeps
          // retrying, so this is not a hard failure -- but we have NOT seen `success`, so report
          // it as pending (in flight) rather than telling the buyer the gift was delivered.
          pollingRef.current = false;
          onPending?.();
          return;
        }
        timerRef.current = setTimeout(poll, 2000);
      };
      poll();
    },
    [username, onDelivered, onPending, onConfirmed]
  );

  if (!stripePromise || amountCents === 0) {
    return <Alert appearance="danger">{i18next.t("points-gift.card-unavailable")}</Alert>;
  }
  if (error) {
    return <Alert appearance="danger">{error}</Alert>;
  }
  if (delivering) {
    return (
      <div className="py-6 text-center text-sm opacity-75">
        {i18next.t("points-gift.delivering")}
      </div>
    );
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
          payLabel={payLabel}
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
