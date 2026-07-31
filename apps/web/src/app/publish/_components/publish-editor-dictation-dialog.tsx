"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { withFeatureFlag } from "@/core/react-query";
import { error } from "@/features/shared";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/features/ui";
import { ensureValidToken } from "@/utils";
import {
  getAiTranscribePriceQueryOptions,
  getPointsQueryOptions,
  useAiTranscribe
} from "@ecency/sdk";
import { UilMicrophone, UilStopCircle } from "@tooni/iconscout-unicons-react";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { estimateDictationCost } from "../_hooks/estimate-dictation-cost";
import { DictationAuth, tokenForUser } from "../_hooks/dictation-auth";
import { nextRetryAction } from "../_hooks/dictation-retry";
import { runDictationSubmit } from "../_hooks/run-dictation-submit";
import { useDictationRecorder } from "../_hooks/use-dictation-recorder";

interface Props {
  show: boolean;
  setShow: (v: boolean) => void;
  onInsert: (text: string) => void;
}

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PublishEditorDictationDialog({ show, setShow, onInsert }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;

  // Resolved rather than read straight from storage: an already-expired session
  // would otherwise fail the pricing query, and since recording is gated on pricing
  // the user could never start at all. Refreshing here fixes both this and the
  // transcription call below.
  // Stored WITH its owner -- see tokenForUser.
  const [auth, setAuth] = useState<DictationAuth | null>(null);
  // Tracked separately from `token`. A failed refresh leaves the pricing query
  // disabled rather than errored, so without this the dialog would sit on
  // "checking price" forever with nothing for the user to act on.
  const [tokenState, setTokenState] = useState<"pending" | "ready" | "failed">("pending");
  const [tokenAttempt, setTokenAttempt] = useState(0);

  useEffect(() => {
    if (!show || !username) return;
    let cancelled = false;
    setTokenState("pending");
    ensureValidToken(username)
      .then((t) => {
        if (cancelled) return;
        setAuth(t ? { username, token: t } : null);
        setTokenState(t ? "ready" : "failed");
      })
      .catch(() => {
        if (cancelled) return;
        setAuth(null);
        setTokenState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [show, username, tokenAttempt]);

  // Never the previous account's token: an empty string disables the query, which is
  // what we want until a token for THIS user has resolved.
  const token = tokenForUser(auth, username);

  const {
    data: price,
    isLoading: isPriceLoading,
    isError: isPriceError,
    refetch: refetchPrice
  } = useQuery(getAiTranscribePriceQueryOptions(username, token ?? ""));
  const { data: points } = useQuery(
    withFeatureFlag(
      ({ visionFeatures }) => visionFeatures.points.enabled,
      getPointsQueryOptions(username)
    )
  );

  const { mutateAsync: transcribe } = useAiTranscribe(username, token ?? "");

  // Covers the WHOLE submit, including the token refresh that precedes the request.
  // isPending from the mutation only turns true once transcribe() is called, which
  // left a window where the dialog was closable but the paid call still went out.
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maxSeconds = price?.max_seconds ?? 300;
  const { state, seconds, result, start, stop, reset } = useDictationRecorder({ maxSeconds });

  // One key per recording, held across retries. Regenerating it on a retry would
  // defeat the server-side dedupe in the exact case it exists for: an upload that
  // landed but whose response was lost, which would then be charged twice.
  const idempotencyKeyRef = useRef<string | null>(null);

  // Set only from a server 402. The client balance can be stale (or the free
  // allowance already spent elsewhere), so the cached comparison below is not
  // enough on its own to decide whether to offer a top-up.
  const [serverRejectedForPoints, setServerRejectedForPoints] = useState(false);
  const [pendingCost, setPendingCost] = useState(0);

  // Pricing is never guessed. Falling back to hardcoded numbers while the query is
  // in flight would quote a price the server has not agreed to, and the user pays
  // the server's number, not ours.
  const unitSeconds = price?.unit_seconds ?? 0;
  const unitCost = price?.unit_cost ?? 0;
  const freeRemaining = price?.free_remaining ?? 0;
  const isPriceReady = tokenState === "ready" && !!token && !!price && !isPriceLoading && !isPriceError;
  // Either failure blocks the same thing (recording), so they share one retry.
  const hasBlockingError = tokenState === "failed" || isPriceError;

  const estimatedCost = useMemo(
    () =>
      isPriceReady ? estimateDictationCost(seconds, { unitSeconds, unitCost, freeRemaining }) : 0,
    [isPriceReady, seconds, unitSeconds, unitCost, freeRemaining]
  );

  const balance = useMemo(() => {
    if (!points?.points) return 0;
    return parseFloat(String(points.points).replace(/,/g, ""));
  }, [points]);

  const cannotAfford = serverRejectedForPoints || (estimatedCost > 0 && balance < estimatedCost);

  // Flipped on close so a response that lands afterwards cannot edit the draft
  // behind the user's back. The request itself cannot be recalled once sent.
  const closedRef = useRef(false);

  const close = useCallback(() => {
    closedRef.current = true;
    reset();
    idempotencyKeyRef.current = null;
    setPendingCost(0);
    setServerRejectedForPoints(false);
    setShow(false);
  }, [reset, setShow]);

  const submit = useCallback(async () => {
    if (!result || !username || isSubmitting) return;

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    setIsSubmitting(true);
    try {
      // The closure-check ordering lives in runDictationSubmit so it is exercised by
      // tests rather than restated by them. A token is resolved per submit because a
      // recording can run for minutes and the one from open can expire in that time.
      const outcome = await runDictationSubmit({
        ensureToken: () => ensureValidToken(username),
        transcribe: ({ code }) =>
          transcribe({
            audio: result.blob,
            durationMs: result.durationMs,
            fileName: "dictation.webm",
            idempotency_key: idempotencyKeyRef.current!,
            code
          }),
        isClosed: () => closedRef.current
      });

      if (outcome.status === "abandoned") return;
      if (outcome.status === "no-token") {
        error(i18next.t("publish.dictation-failed"));
        return;
      }

      const response = outcome.response;

      if (!response.text.trim()) {
        // A silent or unintelligible clip still costs Points, so say so plainly
        // rather than closing as though it worked.
        error(i18next.t("publish.dictation-empty"));
        return;
      }

      onInsert(response.text);
      close();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (closedRef.current) return;
      if (status === 402) {
        setServerRejectedForPoints(true);
        setPendingCost((e as { data?: { required?: number } }).data?.required ?? estimatedCost);
        error(i18next.t("publish.dictation-insufficient-points"));
      } else if (status === 429) {
        error(i18next.t("publish.dictation-rate-limited"));
      } else if (status === 400) {
        error(i18next.t("publish.dictation-too-long"));
      } else {
        error(i18next.t("publish.dictation-failed"));
      }
      // The key is deliberately kept so a retry replays rather than re-charges.
    } finally {
      setIsSubmitting(false);
    }
  }, [result, username, isSubmitting, transcribe, onInsert, close, estimatedCost]);

  // A fresh recording is a different operation, so it gets a fresh key.
  useEffect(() => {
    if (state === "recording") {
      idempotencyKeyRef.current = null;
    }
  }, [state]);

  useEffect(() => {
    if (show) {
      closedRef.current = false;
    }
  }, [show]);

  // Unmount (navigating away) never runs close(), so without this an in-flight
  // response could still edit the draft of a page the user has left.
  useEffect(
    () => () => {
      closedRef.current = true;
    },
    []
  );

  return (
    <Modal
      show={show}
      onHide={() => {
        // Points are charged the moment the request lands, so dismissing mid-flight
        // would pay for a transcript and throw it away.
        if (!isSubmitting) {
          close();
        }
      }}
      centered={true}
    >
      <ModalHeader closeButton={!isSubmitting}>{i18next.t("publish.dictation")}</ModalHeader>
      <ModalBody>
        {state === "denied" && (
          <div className="text-sm text-red mb-4">{i18next.t("publish.dictation-denied")}</div>
        )}

        {hasBlockingError && (
          <div className="flex flex-col items-start gap-2 mb-4">
            <div className="text-sm text-red">
              {tokenState === "failed"
                ? i18next.t("publish.dictation-session-error")
                : i18next.t("publish.dictation-price-error")}
            </div>
            <Button
              size="xs"
              appearance="gray"
              onClick={() => {
                // Never both: retrying pricing without a token fires an
                // unauthenticated request whose error then outlives the fix.
                const action = nextRetryAction(tokenState, isPriceError);
                if (action === "resolve-token") {
                  setTokenAttempt((n) => n + 1);
                } else if (action === "refetch-price") {
                  refetchPrice();
                }
              }}
            >
              {i18next.t("g.try-again")}
            </Button>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 py-4">
          <div className="text-3xl font-mono tabular-nums">{formatClock(seconds)}</div>

          {state === "recording" && (
            <div className="flex items-center gap-2 text-sm text-red">
              <span className="size-2 rounded-full bg-red animate-pulse" aria-hidden />
              {i18next.t("publish.dictation-recording")}
            </div>
          )}

          <div className="text-sm opacity-50">
            {hasBlockingError
              ? ""
              : !isPriceReady
                ? i18next.t("publish.dictation-price-loading")
              : estimatedCost > 0
                ? i18next.t("publish.dictation-cost", { n: estimatedCost })
                : i18next.t("publish.dictation-free")}
          </div>

          {isPriceReady && (
            <div className="text-xs opacity-50">
              {i18next.t("publish.dictation-max", { n: Math.floor(maxSeconds / 60) })}
            </div>
          )}
        </div>

        {cannotAfford && (
          <PointsTopupCta required={pendingCost || estimatedCost} available={balance} />
        )}
      </ModalBody>
      <ModalFooter className="flex justify-end gap-2">
        {state === "recording" ? (
          <Button icon={<UilStopCircle />} size="sm" appearance="danger" onClick={stop}>
            {i18next.t("publish.dictation-stop")}
          </Button>
        ) : (
          <Button
            icon={<UilMicrophone />}
            size="sm"
            appearance="gray"
            disabled={state === "requesting" || isSubmitting || !isPriceReady}
            onClick={start}
          >
            {result
              ? i18next.t("publish.dictation-rerecord")
              : i18next.t("publish.dictation-start")}
          </Button>
        )}

        <Button
          size="sm"
          disabled={!result || isSubmitting || cannotAfford || !isPriceReady}
          isLoading={isSubmitting}
          onClick={submit}
        >
          {i18next.t("publish.dictation-insert")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
