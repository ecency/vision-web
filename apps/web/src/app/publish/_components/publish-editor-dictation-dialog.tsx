"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { withFeatureFlag } from "@/core/react-query";
import { error } from "@/features/shared";
import { PointsTopupCta } from "@/features/shared/points-topup-cta";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/features/ui";
import { ensureValidToken, getAccessToken } from "@/utils";
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
  const accessToken = username ? getAccessToken(username) : "";

  const {
    data: price,
    isLoading: isPriceLoading,
    isError: isPriceError
  } = useQuery(getAiTranscribePriceQueryOptions(username, accessToken ?? ""));
  const { data: points } = useQuery(
    withFeatureFlag(
      ({ visionFeatures }) => visionFeatures.points.enabled,
      getPointsQueryOptions(username)
    )
  );

  const { mutateAsync: transcribe, isPending: isTranscribing } = useAiTranscribe(
    username,
    accessToken
  );

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
  const isPriceReady = !!price && !isPriceLoading && !isPriceError;

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
    if (!result || !username) return;

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }

    try {
      // Resolve a current token rather than the one captured when this dialog
      // mounted: a recording can run for minutes, and a stale token turns a paid
      // action into an opaque failure.
      const token = await ensureValidToken(username);
      if (!token) {
        error(i18next.t("publish.dictation-failed"));
        return;
      }

      const response = await transcribe({
        audio: result.blob,
        durationMs: result.durationMs,
        fileName: "dictation.webm",
        idempotency_key: idempotencyKeyRef.current,
        code: token
      });

      // Dismissal is blocked while this is in flight, but an unmount (navigation)
      // is not, so the transcript is only applied if the dialog is still open.
      if (closedRef.current) return;

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
    }
  }, [result, username, transcribe, onInsert, close, estimatedCost]);

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

  return (
    <Modal
      show={show}
      onHide={() => {
        // Points are charged the moment the request lands, so dismissing mid-flight
        // would pay for a transcript and throw it away.
        if (!isTranscribing) {
          close();
        }
      }}
      centered={true}
    >
      <ModalHeader closeButton={!isTranscribing}>{i18next.t("publish.dictation")}</ModalHeader>
      <ModalBody>
        {state === "denied" && (
          <div className="text-sm text-red mb-4">{i18next.t("publish.dictation-denied")}</div>
        )}

        {isPriceError && (
          <div className="text-sm text-red mb-4">{i18next.t("publish.dictation-price-error")}</div>
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
            {!isPriceReady
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
            disabled={state === "requesting" || isTranscribing || !isPriceReady}
            onClick={start}
          >
            {result
              ? i18next.t("publish.dictation-rerecord")
              : i18next.t("publish.dictation-start")}
          </Button>
        )}

        <Button
          size="sm"
          disabled={!result || isTranscribing || cannotAfford || !isPriceReady}
          isLoading={isTranscribing}
          onClick={submit}
        >
          {i18next.t("publish.dictation-insert")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
