"use client";

import { memo } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { useCurationTicker } from "./curation-ticker";
import { computeWindow, formatHm } from "./curation-window";
import type { WindowState } from "./types";

interface Props {
  created: string;
  payoutAt: string | null | undefined;
  className?: string;
}

export function windowLabel(state: WindowState): string {
  switch (state.kind) {
    case "full":
      return i18next.t("curation-desk.window.full", { left: formatHm(state.msLeft) });
    case "half":
      return i18next.t("curation-desk.window.half", { age: Math.floor(state.ageMs / 3_600_000) });
    case "eighth":
      return i18next.t("curation-desk.window.eighth", { age: Math.floor(state.ageMs / 3_600_000) });
    case "locked":
      return i18next.t("curation-desk.window.locked", { pct: state.scalePct });
    case "paid":
      return i18next.t("curation-desk.window.paid");
  }
}

/**
 * FULL, HALF, EIGHTH, LOCKED or PAID, derived client-side from `created` and
 * `payout_at` with the shared 60 s ticker. Its own memo child: the countdown
 * re-renders this badge and nothing else. The word is always printed; colour
 * never stands alone.
 */
export const CurationWindowBadge = memo(function CurationWindowBadge({ created, payoutAt, className }: Props) {
  const now = useCurationTicker();
  const state = computeWindow(created, payoutAt, now);
  const tone = {
    full: state.kind === "full" && state.urgent ? "amber" : "green",
    half: "gray",
    eighth: "gray",
    locked: "amber",
    paid: "gray",
  }[state.kind];

  return (
    <span
      data-window={state.kind}
      title={
        state.kind === "locked"
          ? i18next.t("curation-desk.window.locked-tooltip", { pct: state.scalePct })
          : i18next.t(`curation-desk.window.${state.kind}-tooltip`)
      }
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap",
        tone === "green" && "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
        tone === "amber" && "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        tone === "gray" && "bg-gray-100 text-gray-600 dark:bg-dark-default dark:text-gray-400",
        className
      )}
    >
      {windowLabel(state)}
    </span>
  );
});
