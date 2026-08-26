"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { Elements } from "@stripe/react-stripe-js";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { Modal, ModalBody, ModalHeader, ModalTitle } from "@ui/modal";
import i18next from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { StripeCheckoutForm } from "./stripe-checkout-form";
import {
  DEFAULT_STRIPE_TIER_SKU,
  getStripePromise,
  isKnownTierSku,
  skuUsdCents,
  STRIPE_POINTS_TIERS
} from "./stripe-config";
import { fetchStripeOrderStatus, useCreateStripeIntent } from "./use-stripe-points-purchase";

interface Props {
  show: boolean;
  setShow: (v: boolean) => void;
  defaultSku?: string;
  /** Resume straight into the delivery poll after a redirect-method return (the PaymentIntent id). */
  resumePaymentIntent?: string;
  onDelivered?: (points?: number) => void;
}

type Step = "select" | "pay" | "delivering" | "done" | "error";

const isDarkMode = () =>
  typeof document !== "undefined" && document.documentElement.classList.contains("dark");

// A fresh per-checkout nonce; guarded for insecure-origin / older WebViews where
// crypto.randomUUID is absent.
const genNonce = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// An unknown defaultSku (a stale caller, a renamed tier) must not leave the dialog with no
// selected tile and a zero-cent pay step; fall back to the default tier instead.
const resolveTierSku = (sku?: string): string =>
  sku && isKnownTierSku(sku) ? sku : DEFAULT_STRIPE_TIER_SKU;

/**
 * Reusable card-payment dialog for buying Points. Flow: pick a tier -> render the Payment
 * Element (deferred: no intent yet) -> mint the PaymentIntent via vapi on the Pay click ->
 * confirm -> poll the order status until the worker delivers. Credits the authenticated
 * user (vapi forces it). Deferring the mint to the Pay click means browsing tiers or
 * closing the dialog never creates an abandoned intent. Card payment is hidden entirely
 * when the publishable key is unconfigured.
 */
export function StripePointsDialog({
  show,
  setShow,
  defaultSku,
  resumePaymentIntent,
  onDelivered
}: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  const [step, setStep] = useState<Step>("select");
  const [sku, setSku] = useState(() => resolveTierSku(defaultSku));
  const [nonce, setNonce] = useState("");
  // The confirmed PaymentIntent id, handed over by onPaid. With deferred minting there is
  // no client secret in state to derive it from; the confirm result is the source.
  const [paidIntentId, setPaidIntentId] = useState("");
  const [deliveredPoints, setDeliveredPoints] = useState<number | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState("");
  // True while a Pay submit is in flight (validate, mint, confirm). The dialog must not
  // close in that window: once confirmPayment is dispatched the charge can complete
  // server side; a closed dialog would show the buyer a fresh checkout for a payment
  // that already went through. Delivering stays closable (the payment is acknowledged by
  // then) and a decline flips this back to false so the dialog closes normally again.
  const [submitting, setSubmitting] = useState(false);
  const pollingRef = useRef(false);

  const createIntent = useCreateStripeIntent(username);
  const stripePromise = getStripePromise();

  // Fresh per-checkout nonce on open; full reset on open/close.
  useEffect(() => {
    if (show) {
      setNonce(genNonce());
      setSku(resolveTierSku(defaultSku));
      setPaidIntentId("");
      setDeliveredPoints(undefined);
      setErrorMsg("");
      setSubmitting(false);
      pollingRef.current = true;
      // Returning from a redirect-based method: skip straight to the delivery poll.
      setStep(resumePaymentIntent ? "delivering" : "select");
    } else {
      pollingRef.current = false;
    }
  }, [show, defaultSku, resumePaymentIntent]);

  // The PaymentIntent id is the resume value (redirect return) or the one from onPaid.
  const paymentIntentId = resumePaymentIntent || paidIntentId;

  // Mints the PaymentIntent at Pay time (deferred flow) for the selected tier. The nonce
  // is stable for the session, so a double-submit returns the same intent. Clears the
  // inline pay-step error so a retry starts clean.
  const mintIntent = useCallback(async () => {
    setErrorMsg("");
    const { client_secret } = await createIntent.mutateAsync({ sku, nonce });
    return client_secret;
  }, [createIntent, sku, nonce]);

  // After the intent is confirmed, poll until the worker delivers the Points.
  useEffect(() => {
    if (step !== "delivering" || !username || !paymentIntentId) {
      return;
    }
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!pollingRef.current) {
        return;
      }
      tries += 1;
      try {
        const st = await fetchStripeOrderStatus(username, paymentIntentId);
        if (!pollingRef.current) {
          return;
        }
        if (st.status === "success") {
          setDeliveredPoints(st.points);
          setStep("done");
          onDelivered?.(st.points ?? 0);
          return;
        }
        if (st.status === "failed") {
          setErrorMsg(i18next.t("stripe-points.delivery-failed"));
          setStep("error");
          return;
        }
      } catch {
        // transient (network / not-yet-recorded) -- keep polling
      }
      if (tries >= 20) {
        // Paid but not delivered after ~40s: reassure rather than error; it is in flight.
        // Still notify the caller so it can refetch the balance once it lands.
        onDelivered?.();
        setStep("done");
        return;
      }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => clearTimeout(timer);
  }, [step, username, paymentIntentId, onDelivered]);

  const selectedTier = STRIPE_POINTS_TIERS.find((t) => t.sku === sku);
  const amountCents = skuUsdCents(sku);

  return (
    // dismissViaOnHide routes the close button, backdrop and Escape through onHide, so
    // the submitting guard below actually decides whether the dialog closes.
    <Modal
      show={show}
      centered={true}
      onHide={() => {
        // No close while a Pay submit is in flight: the confirm may already have charged
        // the card and the buyer must stay on this dialog to see the outcome.
        if (submitting) {
          return;
        }
        setShow(false);
      }}
      dismissViaOnHide={true}
      size="md"
    >
      <ModalHeader closeButton={true}>
        <ModalTitle>{i18next.t("stripe-points.title")}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        {username && (
          <div className="text-sm opacity-75 mb-3">
            {i18next.t("stripe-points.credited-to", { username })}
          </div>
        )}

        {step === "select" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {STRIPE_POINTS_TIERS.map((t) => (
                <button
                  key={t.sku}
                  type="button"
                  onClick={() => setSku(t.sku)}
                  className={`rounded-lg p-3 text-left transition-colors ${
                    t.sku === sku
                      ? "border-2 border-blue-dark-sky bg-blue-dark-sky bg-opacity-10"
                      : "border border-gray-200 dark:border-gray-700 hover:border-blue-dark-sky"
                  }`}
                >
                  <div className="font-bold">${t.usd.toFixed(2)}</div>
                  <div className="text-sm opacity-75">
                    {t.points.toLocaleString()} {i18next.t("stripe-points.points")}
                  </div>
                </button>
              ))}
            </div>
            {/* Advances to the payment form only; the intent is minted on the Pay click. */}
            <Button
              full={true}
              onClick={() => {
                setErrorMsg("");
                setStep("pay");
              }}
            >
              {i18next.t("stripe-points.continue")}
            </Button>
          </div>
        )}

        {step === "pay" && stripePromise && amountCents > 0 && (
          <div className="flex flex-col gap-3">
            {/* A mint failure or card decline surfaces HERE, above the still-mounted form,
                so the buyer retries without retyping the card. The terminal error step is
                reserved for a failed delivery poll. */}
            {errorMsg && <Alert appearance="danger">{errorMsg}</Alert>}
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
                returnUrl={typeof window !== "undefined" ? window.location.href : ""}
                payLabel={
                  selectedTier
                    ? i18next.t("stripe-points.pay", { usd: `$${selectedTier.usd.toFixed(2)}` })
                    : i18next.t("stripe-points.pay-generic")
                }
                createIntent={mintIntent}
                onPaid={(paymentIntent) => {
                  setErrorMsg("");
                  setPaidIntentId(paymentIntent);
                  setStep("delivering");
                }}
                onError={setErrorMsg}
                onSubmittingChange={setSubmitting}
              />
            </Elements>
          </div>
        )}

        {step === "delivering" && (
          <Alert appearance="primary">{i18next.t("stripe-points.delivering")}</Alert>
        )}

        {step === "done" && (
          <Alert appearance="success">
            {deliveredPoints
              ? i18next.t("stripe-points.done", { points: deliveredPoints.toLocaleString() })
              : i18next.t("stripe-points.done-pending")}
          </Alert>
        )}

        {step === "error" && (
          <div className="flex flex-col gap-3">
            <Alert appearance="danger">
              {errorMsg || i18next.t("stripe-points.create-failed")}
            </Alert>
            <Button
              appearance="secondary"
              onClick={() => {
                // fresh nonce so a retry with a different tier never reuses a prior intent
                setNonce(genNonce());
                setStep("select");
              }}
            >
              {i18next.t("stripe-points.try-again")}
            </Button>
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
