"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { withFeatureFlag } from "@/core/react-query";
import { error, success } from "@/features/shared";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { Button, FormControl } from "@/features/ui";
import { getAccessToken, ensureValidToken } from "@/utils";
import {
  getAiGeneratePriceQueryOptions,
  getPointsQueryOptions,
  useAddImage,
  useGenerateImage,
  type AiImagePowerTier,
} from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import i18next from "i18next";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Props {
  onInsert?: (url: string) => void;
  showInsertAction?: boolean;
  suggestedPrompt?: string;
}

const ASPECT_RATIO_LABELS: Record<string, string> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
  "3:2": "3:2",
  "2:3": "2:3",
};

const POWER_LABELS: Record<number, string> = {
  1: "1x",
  2: "2x",
  4: "4x",
  6: "6x",
};

// A key matching the backend validator [A-Za-z0-9_-]{8,64}. Reused across retries of the
// same attempt so a delivery-pending image is recovered instead of re-generated (re-billed).
function makeIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

// Bounded automatic polling for a generation the backend answered 202/409 for: it is paid
// (or still running) server-side and a retry with the SAME key only fetches it. Past the
// budget the manual button remains, still carrying the key.
const AUTO_FETCH_MAX_ATTEMPTS = 24;
const AUTO_FETCH_DEFAULT_DELAY_S = 5;

export function AiImageGenerator({ onInsert, showInsertAction = true, suggestedPrompt }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  const accessToken = username ? getAccessToken(username) : "";

  const { data: activeUserPoints, isPending: isPointsPending } = useQuery(
    withFeatureFlag(
      ({ visionFeatures }) => visionFeatures.points.enabled,
      getPointsQueryOptions(username)
    )
  );

  const { data: priceData, isLoading: isPricesLoading } = useQuery(
    getAiGeneratePriceQueryOptions(accessToken ?? "")
  );

  const prices = priceData?.prices;
  const powerTiers = priceData?.power;

  const { mutateAsync: generateImage, isPending: isGenerating } = useGenerateImage(
    username,
    accessToken
  );

  const { mutateAsync: addToGallery } = useAddImage(username, accessToken);

  const [prompt, setPrompt] = useState("");
  const [selectedRatio, setSelectedRatio] = useState<string | null>(null);
  const [selectedPower, setSelectedPower] = useState<AiImagePowerTier | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  // Set while the backend reports the attempt as still in flight: "generating" for a 409
  // in_progress (prediction still running), "finishing" for a 202 delivery_pending (paid,
  // upload pending). Either way the SAME key fetches it with no new charge.
  const [pendingPhase, setPendingPhase] = useState<"generating" | "finishing" | null>(null);
  const deliveryPending = pendingPhase !== null;

  // Idempotency key for the current attempt. Kept stable across a delivery-pending retry so
  // the backend recovers the paid generation; reset whenever the inputs change (below) so a
  // genuinely new request gets a fresh key.
  const idempotencyKeyRef = useRef<string | null>(null);

  // Bounded auto-poll while the attempt is pending server-side.
  const autoFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFetchAttemptsRef = useRef(0);

  // Identifies the attempt (user + inputs + key) that the outstanding request and any
  // armed timer belong to. Bumped whenever those change, and on unmount, so a resolution
  // or timer from an earlier attempt is dropped instead of acting on state it no longer
  // owns: an old 202/409 must never schedule a poll that would submit the NEW inputs
  // under a fresh key (an unrequested, billed generation) or bill another account.
  const attemptRef = useRef(0);
  // Synchronous re-entrancy guard: a timer firing around a manual fetch must not start a
  // second concurrent request racing the same key's pending/success state.
  const inFlightRef = useRef(false);

  const clearAutoFetch = useCallback(() => {
    if (autoFetchTimerRef.current) {
      clearTimeout(autoFetchTimerRef.current);
      autoFetchTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      // Unmount invalidates the in-flight resolution too, not just the armed timer --
      // otherwise its 202/409 handler re-arms and keeps polling a dead dialog.
      attemptRef.current += 1;
      clearAutoFetch();
    },
    [clearAutoFetch]
  );

  useEffect(() => {
    if (prices && prices.length > 0 && !selectedRatio) {
      const defaultRatio = prices.find((p) => p.aspect_ratio === "16:9");
      setSelectedRatio(defaultRatio?.aspect_ratio ?? prices[0].aspect_ratio);
    }
  }, [prices, selectedRatio]);

  useEffect(() => {
    if (powerTiers && powerTiers.length > 0 && !selectedPower) {
      setSelectedPower(powerTiers[0]);
    }
  }, [powerTiers, selectedPower]);

  // Changing any request input (or the account) starts a fresh attempt: invalidate the
  // outstanding request/timer and drop the reused key + pending state.
  useEffect(() => {
    attemptRef.current += 1;
    idempotencyKeyRef.current = null;
    autoFetchAttemptsRef.current = 0;
    clearAutoFetch();
    setPendingPhase(null);
  }, [prompt, selectedRatio, selectedPower, username, clearAutoFetch]);

  const charsRemaining = 1000 - prompt.length;

  const baseCost = useMemo(() => {
    if (prices && prices.length > 0) return prices[0].cost;
    return 150;
  }, [prices]);

  const cost = useMemo(() => {
    return baseCost * (selectedPower?.multiplier ?? 1);
  }, [baseCost, selectedPower]);

  const isInsufficientBalance = useMemo(() => {
    if (activeUserPoints) {
      return +activeUserPoints.points < cost;
    }
    return false;
  }, [activeUserPoints, cost]);

  const canGenerate =
    prompt.trim().length > 0 &&
    selectedRatio &&
    // A delivery-pending retry replays the already-paid generation (same idempotency key),
    // so it must not be blocked by the balance gate even if the last points were just spent.
    (deliveryPending || !isInsufficientBalance) &&
    !isGenerating;

  // Always points at the latest handleGenerate so an auto-poll timer never fires a stale
  // closure (e.g. one holding an outdated points balance).
  const handleGenerateRef = useRef<() => void>(() => {});

  const handleGenerate = useCallback(async () => {
    if (!selectedRatio || !prompt.trim()) return;

    // A manual click replaces any armed poll timer, and nothing ever runs two requests
    // for the same attempt concurrently -- overlapping completions would race the
    // pending/success state and duplicate the gallery insert.
    clearAutoFetch();
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const attempt = attemptRef.current;

    try {
      const token = username ? await ensureValidToken(username) : undefined;
      if (!token) {
        error(i18next.t("ai-image-generator.error-auth"));
        return;
      }

      // Reuse the key across a delivery-pending retry so the backend recovers the paid
      // generation; otherwise this is a fresh attempt and gets a fresh key.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = makeIdempotencyKey();
      }

      const result = await generateImage({
        prompt: prompt.trim(),
        aspect_ratio: selectedRatio,
        power: selectedPower?.power ?? 1,
        idempotency_key: idempotencyKeyRef.current,
      });

      // Inputs, account, or mount state changed while this request was in flight: the
      // response belongs to an abandoned attempt, so drop it without touching state.
      if (attempt !== attemptRef.current) return;

      setPendingPhase(null);
      idempotencyKeyRef.current = null;
      autoFetchAttemptsRef.current = 0;
      clearAutoFetch();
      setGeneratedUrl(result.url);
      success(i18next.t("ai-image-generator.success"));

      // Auto-add to user's gallery (non-blocking)
      addToGallery({ url: result.url, code: token }).catch(() => {});
    } catch (err: any) {
      // Same stale-attempt gate as the success path: this failure (or pending answer)
      // belongs to an abandoned attempt and must not touch state or schedule a poll.
      if (attempt !== attemptRef.current) return;

      const status = err?.status;
      const data = err?.data;

      // 202 = paid, upload finishing. 409 in_progress = the prediction is still running
      // server-side. Both mean: keep the key (a retry only fetches, never re-bills) and
      // poll automatically at the backend's suggested cadence, up to a bounded budget.
      const stillInFlight =
        status === 202 || (status === 409 && data?.error === "in_progress");
      if (stillInFlight) {
        setPendingPhase(status === 202 ? "finishing" : "generating");
        if (autoFetchAttemptsRef.current < AUTO_FETCH_MAX_ATTEMPTS) {
          autoFetchAttemptsRef.current += 1;
          const delayS =
            typeof data?.retry_after === "number" && data.retry_after > 0
              ? data.retry_after
              : AUTO_FETCH_DEFAULT_DELAY_S;
          clearAutoFetch();
          autoFetchTimerRef.current = setTimeout(() => {
            autoFetchTimerRef.current = null;
            if (attempt !== attemptRef.current) return;
            handleGenerateRef.current();
          }, delayS * 1000);
        }
        return;
      }

      // Any hard failure ends this attempt: drop the key so a retry is a fresh request.
      idempotencyKeyRef.current = null;
      autoFetchAttemptsRef.current = 0;
      clearAutoFetch();
      setPendingPhase(null);

      if (status === 402) {
        error(
          i18next.t("ai-image-generator.error-insufficient-points", {
            required: data?.required ?? cost,
            available: data?.available ?? "0",
          })
        );
      } else if (status === 422) {
        error(i18next.t("ai-image-generator.error-content-policy"));
      } else if (status === 429) {
        error(i18next.t("ai-image-generator.error-rate-limit"));
      } else {
        error(i18next.t("ai-image-generator.error-generic"));
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [selectedRatio, selectedPower, prompt, username, generateImage, addToGallery, cost,
      clearAutoFetch]);

  handleGenerateRef.current = handleGenerate;

  const handleGenerateAgain = useCallback(() => {
    setGeneratedUrl(null);
  }, []);

  const handleDownload = useCallback(() => {
    if (generatedUrl) {
      window.open(generatedUrl, "_blank");
    }
  }, [generatedUrl]);

  // Result view
  if (generatedUrl) {
    return (
      <div className="animate-fade-in-up flex flex-col gap-4">
        <div className="font-semibold">{i18next.t("ai-image-generator.result-title")}</div>
        <div className="border border-[--border-color] rounded-xl overflow-hidden">
          <Image
            src={generatedUrl}
            alt={prompt}
            width={1024}
            height={1024}
            className="w-full h-auto"
            unoptimized={true}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showInsertAction && onInsert && (
            <Button size="sm" onClick={() => onInsert(generatedUrl)}>
              {i18next.t("ai-image-generator.insert-button")}
            </Button>
          )}
          <Button size="sm" appearance="gray" onClick={handleDownload}>
            {i18next.t("ai-image-generator.download-button")}
          </Button>
          <Button size="sm" appearance="gray-link" onClick={handleGenerateAgain}>
            {i18next.t("ai-image-generator.generate-again")}
          </Button>
        </div>
      </div>
    );
  }

  // Generator form
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="opacity-50">{i18next.t("ai-image-generator.balance-label")}:</div>
          <div className="text-blue-dark-sky">
            {isPointsPending
              ? "..."
              : `${activeUserPoints?.points ?? "0"} ${i18next.t("ai-image-generator.points-unit")}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="opacity-50">{i18next.t("ai-image-generator.cost-label")}:</div>
          <div className="text-blue-dark-sky font-semibold">
            {cost} {i18next.t("ai-image-generator.points-unit")}
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1 block">
          {i18next.t("ai-image-generator.prompt-label")}
        </label>
        <FormControl
          type="textarea"
          value={prompt}
          onChange={(e: any) => setPrompt(e.target.value.slice(0, 1000))}
          placeholder={i18next.t("ai-image-generator.prompt-placeholder")}
          rows={3}
        />
        <div className={clsx("text-xs mt-1", charsRemaining < 50 ? "text-red" : "opacity-50")}>
          {i18next.t("ai-image-generator.prompt-chars-remaining", { count: charsRemaining })}
        </div>
        {suggestedPrompt && !prompt.trim() && (
          <button
            type="button"
            className="text-xs mt-2 px-3 py-1.5 rounded-full border border-blue-dark-sky/30 bg-blue-dark-sky/5 text-blue-dark-sky hover:bg-blue-dark-sky/10 transition-colors truncate max-w-full text-left"
            onClick={() => setPrompt(suggestedPrompt.slice(0, 1000))}
          >
            {i18next.t("ai-image-generator.use-suggestion", {
              suggestion: suggestedPrompt.length > 80 ? suggestedPrompt.slice(0, 80) + "…" : suggestedPrompt
            })}
          </button>
        )}
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">
          {i18next.t("ai-image-generator.select-aspect-ratio")}
        </label>
        {isPricesLoading ? (
          <div className="opacity-50">...</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {prices?.map((price, i) => (
              <div
                key={price.aspect_ratio}
                style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}
                className={clsx(
                  "animate-fade-in-up border px-3 py-2 rounded-lg cursor-pointer text-sm font-medium",
                  selectedRatio === price.aspect_ratio
                    ? "border-blue-dark-sky bg-blue-dark-sky/10 text-blue-dark-sky"
                    : "border-[--border-color] hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
                onClick={() => setSelectedRatio(price.aspect_ratio)}
              >
                {ASPECT_RATIO_LABELS[price.aspect_ratio] ?? price.aspect_ratio}
              </div>
            ))}
          </div>
        )}
      </div>

      {powerTiers && powerTiers.length > 1 && (
        <div>
          <label className="text-sm font-medium mb-2 block">
            {i18next.t("ai-image-generator.select-power")}
          </label>
          <div className="flex flex-wrap gap-2">
            {powerTiers.map((tier, i) => (
              <div
                key={tier.power}
                style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}
                className={clsx(
                  "animate-fade-in-up border px-3 py-2 rounded-lg cursor-pointer text-sm font-medium",
                  selectedPower?.power === tier.power
                    ? "border-blue-dark-sky bg-blue-dark-sky/10 text-blue-dark-sky"
                    : "border-[--border-color] hover:bg-gray-100 dark:hover:bg-gray-800"
                )}
                onClick={() => setSelectedPower(tier)}
              >
                {POWER_LABELS[tier.power] ?? `${tier.power}x`}
              </div>
            ))}
          </div>
        </div>
      )}

      {isInsufficientBalance && !deliveryPending && (
        <div className="flex items-center flex-wrap gap-3">
          <small className="text-red block">
            {i18next.t("market.more-than-balance")}
          </small>
          <PointsTopupCta
            required={cost}
            available={+(activeUserPoints?.points ?? 0)}
          />
        </div>
      )}

      {deliveryPending && !isGenerating && (
        <div className="text-sm rounded-lg border border-blue-dark-sky/30 bg-blue-dark-sky/5 text-blue-dark-sky px-3 py-2">
          {i18next.t(
            pendingPhase === "generating"
              ? "ai-image-generator.still-generating"
              : "ai-image-generator.finishing"
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          disabled={!canGenerate}
          isLoading={isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating
            ? i18next.t("ai-image-generator.generating")
            : deliveryPending
              ? i18next.t("ai-image-generator.finishing-retry")
              : i18next.t("ai-image-generator.generate-button")}
        </Button>
      </div>
    </div>
  );
}
