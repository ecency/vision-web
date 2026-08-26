"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { LoginRequired } from "@/features/shared/login-required";
import {
  DEFAULT_STRIPE_TIER_SKU,
  STRIPE_POINTS_TIERS,
  isStripeEnabled
} from "@/features/shared/purchase-stripe/stripe-tiers";
import { fetchStripeOrderStatus } from "@/features/shared/purchase-stripe/use-stripe-points-purchase";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { UilGift } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { GiftCardPreview } from "./gift-card-preview";
import { isValidGiftRecipient } from "./is-valid-gift-recipient";

// Lazy-load the card checkout so /gift doesn't pull @stripe/stripe-js (which injects the
// js.stripe.com script on import) into its bundle until the user actually pays.
const GiftCardCheckout = dynamic(
  () => import("./gift-card-checkout").then((m) => m.GiftCardCheckout),
  {
    ssr: false,
    loading: () => (
      <div className="py-6 text-center text-sm opacity-75">
        {i18next.t("points-gift.preparing-checkout")}
      </div>
    )
  }
);

const MESSAGE_MAX = 100;

// "delivering" is only used while resuming a redirect-based payment (poll before we know the
// outcome). "pending" means paid-but-not-confirmed (in flight); "done" means a real success.
type Step = "form" | "pay" | "delivering" | "done" | "pending" | "error";

export function PointsGiftPage() {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  const [step, setStep] = useState<Step>("form");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [sku, setSku] = useState(DEFAULT_STRIPE_TIER_SKU);
  // Locked once the card is confirmed so a remount can't cancel the delivery poll.
  const [locked, setLocked] = useState(false);
  // True while a Pay submit is in flight (validate, mint, confirm). The selection controls
  // must be frozen for that whole window: once confirmPayment is dispatched the charge can
  // complete server side, so an edit mid-confirm would remount the keyed checkout and show
  // a fresh form for a purchase that already went through. A decline sets this back to
  // false so the buyer can still change selections after a failed attempt.
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [deliveredPoints, setDeliveredPoints] = useState<number | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState("");
  // Payment intent to resume delivery polling for after a redirect-based method returns.
  const [resumePi, setResumePi] = useState<string | undefined>(undefined);
  const pollingRef = useRef(false);

  // Prefill the recipient from ?to= (e.g. gifting from a post). Read from the URL directly
  // so we avoid the useSearchParams Suspense boundary; runs once on mount. Stripe preserves
  // this param across a redirect return, so a resumed flow still knows the recipient.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const to = new URLSearchParams(window.location.search).get("to");
    if (to) {
      setRecipient(to.replace(/^@/, ""));
    }
  }, []);

  // Resume a redirect-based payment. Stripe appends payment_intent + redirect_status to the
  // return URL (e.g. after a 3DS challenge). When a payment_intent is present we must NOT show
  // a fresh form -- that risks a second charge -- so we strip the params and either resume the
  // delivery poll (succeeded/processing) or report the failure. Mirrors /perks/points.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pi = params.get("payment_intent");
    if (!pi) return;
    const status = params.get("redirect_status");
    const url = new URL(window.location.href);
    ["payment_intent", "payment_intent_client_secret", "redirect_status"].forEach((k) =>
      url.searchParams.delete(k)
    );
    window.history.replaceState(window.history.state, "", url.toString());
    if (status === "succeeded" || status === "processing") {
      setLocked(true);
      setResumePi(pi);
      setStep("delivering");
    } else {
      // failed / canceled / requires_payment_method -> no charge landed; let them retry.
      setErrorMsg(i18next.t("points-gift.pay-failed"));
      setStep("error");
    }
  }, []);

  const cleanRecipient = useMemo(
    () => recipient.trim().replace(/^@/, "").toLowerCase(),
    [recipient]
  );
  const recipientValid = useMemo(() => isValidGiftRecipient(cleanRecipient), [cleanRecipient]);
  const selectedTier = useMemo(
    () => STRIPE_POINTS_TIERS.find((t) => t.sku === sku) ?? STRIPE_POINTS_TIERS[0],
    [sku]
  );

  // Delivery poll for a resumed payment intent. Starts once the buyer's username is available
  // (it may hydrate after the redirect landing). success -> done, failed -> error, timeout ->
  // pending (paid, in flight -- never a false success).
  useEffect(() => {
    if (step !== "delivering" || !resumePi || !username) return;
    pollingRef.current = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!pollingRef.current) return;
      tries += 1;
      try {
        const st = await fetchStripeOrderStatus(username, resumePi);
        if (!pollingRef.current) return;
        if (st.status === "success") {
          pollingRef.current = false;
          setDeliveredPoints(st.points);
          setStep("done");
          return;
        }
        if (st.status === "failed") {
          pollingRef.current = false;
          setErrorMsg(i18next.t("points-gift.delivery-failed"));
          setStep("error");
          return;
        }
      } catch {
        // transient (network / not-yet-recorded) -> keep polling
      }
      if (tries >= 45) {
        pollingRef.current = false;
        setStep("pending");
        return;
      }
      timer = setTimeout(poll, 2000);
    };
    poll();
    return () => {
      pollingRef.current = false;
      clearTimeout(timer);
    };
  }, [step, resumePi, username]);

  if (!isStripeEnabled()) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center opacity-75">
        {i18next.t("points-gift.card-unavailable")}
      </div>
    );
  }

  const resetToForm = () => {
    pollingRef.current = false;
    setStep("form");
    setLocked(false);
    setCardSubmitting(false);
    setResumePi(undefined);
    setDeliveredPoints(undefined);
    setErrorMsg("");
    setRecipient("");
    setMessage("");
    setSku(DEFAULT_STRIPE_TIER_SKU);
  };

  const donePoints = (deliveredPoints ?? selectedTier.points).toLocaleString();
  const isFormPhase = step === "form" || step === "pay";

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UilGift className="size-7 text-blue-dark-sky" />
          {i18next.t("points-gift.title")}
        </h1>
        <p className="opacity-75">{i18next.t("points-gift.subtitle")}</p>
      </div>

      {isFormPhase && (
        <GiftCardPreview
          points={selectedTier.points}
          recipient={cleanRecipient}
          message={message}
        />
      )}

      {step === "done" && (
        <div className="flex flex-col gap-4">
          <Alert appearance="success">
            {cleanRecipient
              ? i18next.t("points-gift.done", {
                  points: donePoints,
                  recipient: `@${cleanRecipient}`
                })
              : i18next.t("points-gift.done-generic", { points: donePoints })}
          </Alert>
          <div className="flex gap-2">
            <Button appearance="secondary" onClick={resetToForm}>
              {i18next.t("points-gift.send-another")}
            </Button>
            {cleanRecipient && (
              <Button appearance="link" href={`/@${cleanRecipient}`}>
                {i18next.t("points-gift.view-recipient")}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "pending" && <Alert appearance="primary">{i18next.t("points-gift.pending")}</Alert>}

      {step === "delivering" && (
        <div className="py-6 text-center text-sm opacity-75">
          {i18next.t("points-gift.delivering")}
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-3">
          <Alert appearance="danger">{errorMsg || i18next.t("points-gift.pay-failed")}</Alert>
          <Button appearance="secondary" onClick={resetToForm}>
            {i18next.t("points-gift.try-again")}
          </Button>
        </div>
      )}

      {isFormPhase && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">
              {i18next.t("points-gift.recipient-label")}
            </label>
            <FormControl
              type="text"
              value={recipient}
              disabled={locked || cardSubmitting}
              onChange={(e: any) => setRecipient(e.target.value)}
              placeholder={i18next.t("points-gift.recipient-placeholder")}
            />
            {recipient.trim() !== "" && !recipientValid && (
              <p className="text-sm text-red">{i18next.t("points-gift.recipient-invalid")}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">{i18next.t("points-gift.amount-label")}</label>
            <div className="grid grid-cols-2 gap-2">
              {STRIPE_POINTS_TIERS.map((t) => (
                <button
                  key={t.sku}
                  type="button"
                  disabled={locked || cardSubmitting}
                  onClick={() => setSku(t.sku)}
                  className={`rounded-lg p-3 text-left transition-colors disabled:opacity-60 ${
                    t.sku === sku
                      ? "border-2 border-blue-dark-sky bg-blue-dark-sky bg-opacity-10"
                      : "border border-gray-200 dark:border-gray-700 hover:border-blue-dark-sky"
                  }`}
                >
                  <div className="font-bold">
                    {t.points.toLocaleString()} {i18next.t("points-gift.points-unit")}
                  </div>
                  <div className="text-sm opacity-75">${t.usd.toFixed(2)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">
              {i18next.t("points-gift.message-label")}
            </label>
            <FormControl
              type="textarea"
              rows={2}
              value={message}
              disabled={locked || cardSubmitting}
              maxLength={MESSAGE_MAX}
              onChange={(e: any) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder={i18next.t("points-gift.message-placeholder")}
            />
            <div className="text-xs opacity-50 text-right">
              {message.length}/{MESSAGE_MAX}
            </div>
          </div>

          {step === "form" && (
            <LoginRequired>
              <Button full={true} disabled={!recipientValid} onClick={() => setStep("pay")}>
                {i18next.t("points-gift.pay", { usd: `$${selectedTier.usd.toFixed(2)}` })}
              </Button>
            </LoginRequired>
          )}

          {step === "pay" && username && (
            <GiftCardCheckout
              key={`${sku}:${cleanRecipient}`}
              username={username}
              sku={sku}
              recipient={cleanRecipient}
              message={message}
              payLabel={i18next.t("points-gift.pay", { usd: `$${selectedTier.usd.toFixed(2)}` })}
              returnUrl={typeof window !== "undefined" ? window.location.href : ""}
              onConfirmed={() => setLocked(true)}
              onSubmittingChange={setCardSubmitting}
              onDelivered={() => {
                setDeliveredPoints(selectedTier.points);
                setStep("done");
              }}
              onPending={() => setStep("pending")}
            />
          )}
        </div>
      )}
    </div>
  );
}
