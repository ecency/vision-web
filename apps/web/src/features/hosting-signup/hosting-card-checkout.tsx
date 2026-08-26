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
  /** The buyer / payer (authenticated). ePoints binds the Stripe order to this user; the token
   *  binds to the payer regardless of which tenant is activated. */
  username: string;
  /** The hosting SKU for the chosen term (e.g. "200hosting"). */
  sku: string;
  /** Optional: activate a DIFFERENT tenant than the payer -- e.g. a community (hive-NNNNN) whose
   *  owner (the `username` above) pays. Omit for a personal blog (the payer's own account is
   *  activated). */
  hostingTarget?: string;
  payLabel: string;
  returnUrl: string;
  onActivated: () => void;
  /** Fired once the card is confirmed (payment taken); the parent locks the term selector so
   *  a remount can't cancel the poll for an already-paid intent. */
  onConfirmed?: () => void;
  /** Forwarded from the payment form: true while a Pay submit is in flight (validate,
   *  mint, confirm), false once it settles. The parent must disable the term, add-on and
   *  method controls while true so an in-flight payment cannot be detached from what the
   *  buyer sees; a decline flips it back to false so the controls stay editable after a
   *  failed attempt. */
  onSubmittingChange?: (submitting: boolean) => void;
}

/**
 * Card payment for hosting, riding the shared ePoints Stripe rail. Deferred intent flow:
 * the Payment Element renders immediately and the PaymentIntent is minted only on the Pay
 * click, so switching terms or abandoning the form never creates an intent. After
 * confirmation the order status is polled; for a hosting SKU the order reaching "success"
 * means ePoints has already called the hosting service's activate endpoint, so the blog is
 * live. The activated tenant is `hostingTarget` when supplied (e.g. a community),
 * otherwise the payer's own account. The tenant must already exist (the signup flow
 * creates it before this renders).
 */
export function HostingCardCheckout({
  username,
  sku,
  hostingTarget,
  payLabel,
  returnUrl,
  onActivated,
  onConfirmed,
  onSubmittingChange
}: Props) {
  // The nonce is the create-intent idempotency key (user:sku:nonce server-side), so it must
  // change when the checkout identity (sku or target tenant) changes; otherwise a mint for a
  // new target would return the PaymentIntent already created for the previous one. Fresh
  // nonce per (sku, hostingTarget).
  const nonce = useMemo(genNonce, [sku, hostingTarget]);
  // Terminal states that replace the whole checkout (order failed, activation pending).
  // A card decline or a failed mint is NOT terminal -- it uses formError below so the user
  // can retry.
  const [error, setError] = useState("");
  const [errorAppearance, setErrorAppearance] = useState<"danger" | "primary">("danger");
  // Decline / validation / mint error shown ABOVE the still-mounted payment form so the
  // buyer can fix the card and try again instead of dead-ending on a red alert.
  const [formError, setFormError] = useState("");
  const [activating, setActivating] = useState(false);
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

  // Mints the PaymentIntent at Pay time with the CURRENT sku + target tenant, so the
  // intent always matches what the UI shows.
  const mintIntent = useCallback(async () => {
    const { client_secret } = await createIntent.mutateAsync({
      sku,
      nonce,
      hosting_target: hostingTarget
    });
    return client_secret;
  }, [createIntent, sku, nonce, hostingTarget]);

  // The poll takes the confirmed intent id from onPaid; with deferred minting there is no
  // client secret in render state to derive it from.
  const startPoll = useCallback(
    (intentId: string) => {
      if (!intentId || pollingRef.current) return;
      pollingRef.current = true;
      setActivating(true);
      // Payment is confirmed at this point -- lock the term selector in the parent so a remount
      // cannot cancel this poll and strand a paid user.
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
            onActivated();
            return;
          }
          if (st.status === "failed") {
            pollingRef.current = false;
            setActivating(false);
            setErrorAppearance("danger");
            setError(i18next.t("hosting.card-failed"));
            return;
          }
        } catch {
          // transient (network / not-yet-recorded) -> keep polling
        }
        attempts += 1;
        if (attempts >= MAX_ATTEMPTS) {
          // Payment succeeded; ePoints keeps retrying activation with backoff, so this is not a
          // hard failure -- stop the spinner and reassure (primary, not danger) rather than loop.
          pollingRef.current = false;
          setActivating(false);
          setErrorAppearance("primary");
          setError(i18next.t("hosting.activation-pending"));
          return;
        }
        timerRef.current = setTimeout(poll, 2000);
      };
      poll();
    },
    [username, onActivated, onConfirmed]
  );

  if (!stripePromise || amountCents === 0) {
    return <Alert appearance="danger">{i18next.t("hosting.card-unavailable")}</Alert>;
  }
  // Terminal states (order failed, activation pending) replace the checkout.
  if (error) {
    return <Alert appearance={errorAppearance}>{error}</Alert>;
  }
  if (activating) {
    return (
      <div className="py-6 text-center text-sm opacity-75">{i18next.t("hosting.activating")}</div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* A card decline or a failed mint keeps the form mounted so the buyer can retry. */}
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
