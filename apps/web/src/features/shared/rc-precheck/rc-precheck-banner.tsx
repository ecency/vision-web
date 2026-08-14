"use client";

import i18next from "i18next";
import { Button } from "@ui/button";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useRcPrecheck } from "./use-rc-precheck";
import { useRcTopupAction } from "@/features/shared/rc-topup/use-rc-topup-action";
import type { RcPrecheckOperation } from "@ecency/sdk";
import { alertCircleSvg } from "@ui/svg";

interface Props {
  operation?: RcPrecheckOperation;
  /** Renders a single-line, tighter version for small surfaces (e.g. the vote popover). */
  compact?: boolean;
  className?: string;
}

/**
 * Non-blocking warning shown next to a publish/comment/vote action when the
 * active user's Resource Credits are likely too low to broadcast. Replaces the
 * cryptic post-broadcast "Please wait to transact" failure with a pre-emptive
 * nudge to top up. When the RC top-up product is live (visionFeatures.rcTopup)
 * the CTA opens the in-app RC top-up dialog; until then it falls back to the
 * Boost+ purchase page (HP delegation, which also adds RC). Renders nothing
 * when the user is logged out, the estimate is not ready, or RC is sufficient.
 */
export function RcPrecheckBanner({
  operation = "comment_operation",
  compact = false,
  className
}: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const { ready, willLikelyFail } = useRcPrecheck(username, operation);
  const { openTopup: onTopUp, dialog } = useRcTopupAction(username);

  if (!username || !ready || !willLikelyFail) {
    return null;
  }

  if (compact) {
    return (
      <>
        <div
          role="status"
          className={`flex items-center gap-2 rounded-lg border border-orange/30 bg-orange/10 px-2 py-1.5 text-xs ${
            className ?? ""
          }`}
        >
          <span className="shrink-0 text-orange">{alertCircleSvg}</span>
          <span className="flex-1">{i18next.t("rc-precheck.low-rc-short")}</span>
          <span
            role="button"
            tabIndex={0}
            className="shrink-0 cursor-pointer font-semibold text-blue-dark-sky hover:underline"
            onClick={onTopUp}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTopUp();
              }
            }}
          >
            {i18next.t("rc-precheck.top-up")}
          </span>
        </div>
        {dialog}
      </>
    );
  }

  return (
    <>
      <div
        role="status"
        className={`flex flex-col gap-2 rounded-lg border border-orange/30 bg-orange/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
          className ?? ""
        }`}
      >
        <div className="flex items-start gap-2">
          <span className="mt-[2px] shrink-0 text-orange">{alertCircleSvg}</span>
          <span>{i18next.t("rc-precheck.low-rc-message")}</span>
        </div>
        <Button size="sm" className="self-end sm:self-auto" onClick={onTopUp}>
          {i18next.t("rc-precheck.top-up")}
        </Button>
      </div>
      {dialog}
    </>
  );
}
