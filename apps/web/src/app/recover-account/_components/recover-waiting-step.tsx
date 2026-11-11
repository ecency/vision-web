"use client";

import { useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { recoveryStatus } from "@ecency/sdk";
import { Spinner } from "@ui/spinner";
import {
  MANUAL_HELP_ERRORS,
  recoveryErrorCode
} from "@/features/account-recovery/recovery-errors";
import { RecoverError, RecoverStartOver } from "./recover-error";

const POLL_MS = 5000;
/** Statuses that mean "still on its way": keep polling. */
const PENDING_STATUSES = new Set(["started", "proven", "approved"]);
/** Failed reads in a row before the page stops and asks the user to retry. */
export const MAX_STATUS_FAILURES = 6;

interface Props {
  requestId: string;
  onRequested: () => void;
  onManual: (code: string) => void;
  onRestart: () => void;
}

/** Waits until Ecency has submitted the on-chain recovery request. */
export function RecoverWaitingStep({ requestId, onRequested, onManual, onRestart }: Props) {
  // Keep the latest callbacks without restarting the poll on every render.
  const callbacks = useRef({ onRequested, onManual });
  callbacks.current = { onRequested, onManual };

  const [error, setError] = useState("");
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async () => {
      let transient = false;
      try {
        const res = await recoveryStatus(requestId);
        if (!active) return;
        const status = res.data?.status;
        if (res.status === 200) {
          if (status === "requested" || status === "completed") {
            callbacks.current.onRequested();
            return;
          }
          if (status === "failed" || status === "expired") {
            callbacks.current.onManual(status);
            return;
          }
          if (status === "superseded") {
            callbacks.current.onManual("expired");
            return;
          }
          // Anything but a known pending status (or an unreadable body) is a failed read.
          transient = !PENDING_STATUSES.has(status ?? "");
        } else if (res.status === 404 && !res.data?.error) {
          callbacks.current.onManual("not_found");
          return;
        } else {
          const code = recoveryErrorCode(res);
          transient = code === "unavailable" || (res.status === 429 && !res.data?.error);
          if (!transient) {
            if (MANUAL_HELP_ERRORS.has(code)) {
              callbacks.current.onManual(code);
            } else {
              setError(code);
            }
            return;
          }
        }
      } catch {
        transient = true;
      }
      if (!active) return;
      failures = transient ? failures + 1 : 0;
      if (failures >= MAX_STATUS_FAILURES) {
        setStalled(true);
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestId, attempt]);

  if (error) {
    return (
      <div className="py-6">
        <RecoverError code={error} />
        <RecoverStartOver onRestart={onRestart} />
      </div>
    );
  }

  if (stalled) {
    return (
      <div className="py-6">
        <RecoverError code="unavailable" />
        <button
          type="button"
          className="text-blue-dark-sky text-sm"
          onClick={() => {
            setStalled(false);
            setAttempt((n) => n + 1);
          }}
        >
          {i18next.t("recover-account.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-6">
      <Spinner className="size-6 mx-auto mb-4" />
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.waiting.title")}</h2>
      <p className="text-sm opacity-75">{i18next.t("recover-account.waiting.hint")}</p>
    </div>
  );
}
