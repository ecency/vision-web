"use client";

import { useEffect, useRef } from "react";
import i18next from "i18next";
import { recoveryStatus } from "@ecency/sdk";
import { Spinner } from "@ui/spinner";

const POLL_MS = 5000;

interface Props {
  requestId: string;
  onRequested: () => void;
  onManual: (code: string) => void;
}

/** Waits until Ecency has submitted the on-chain recovery request. */
export function RecoverWaitingStep({ requestId, onRequested, onManual }: Props) {
  // Keep the latest callbacks without restarting the poll on every render.
  const callbacks = useRef({ onRequested, onManual });
  callbacks.current = { onRequested, onManual };

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await recoveryStatus(requestId);
        if (!active) return;
        const status = res.data.status;
        if (res.status === 200 && (status === "requested" || status === "completed")) {
          callbacks.current.onRequested();
          return;
        }
        if (res.status === 404) {
          callbacks.current.onManual("not_found");
          return;
        }
        if (status === "failed" || status === "expired") {
          callbacks.current.onManual(status);
          return;
        }
      } catch {
        // Network trouble: keep waiting.
      }
      if (active) timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestId]);

  return (
    <div className="text-center py-6">
      <Spinner className="size-6 mx-auto mb-4" />
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.waiting.title")}</h2>
      <p className="text-sm opacity-75">{i18next.t("recover-account.waiting.hint")}</p>
    </div>
  );
}
