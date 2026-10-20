"use client";

import i18next from "i18next";
import { Button } from "@/features/ui";

interface Props {
  onRetry: () => void;
}

/**
 * Shown under a list whose last fetch failed. The bottom sentinel does not
 * retry on its own (that looped while an API was down, see
 * useBottomPagination), and a list that failed on its first page has nothing
 * to scroll, so this is the way to try again without reloading.
 */
export function EntryListLoadError({ onRetry }: Props) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 my-6 text-center">
      <p className="text-gray-600 dark:text-gray-400">{i18next.t("entry-index.load-error")}</p>
      <Button outline={true} size="sm" onClick={onRetry}>
        {i18next.t("g.try-again")}
      </Button>
    </div>
  );
}
