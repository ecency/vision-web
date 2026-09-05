"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { UilTimes } from "@tooni/iconscout-unicons-react";
import type { CurationMarkState } from "@ecency/sdk";
import { Button } from "@ui/button";
import { LoginRequired } from "@/features/shared/login-required";
import { error as errorToast } from "@/features/shared/feedback";
import { formatError } from "@/api/format-error";
import { dateToRelative } from "@/utils";
import { Chip } from "./curation-mark-badges";
import { formatUtcDateHm } from "./curation-window";
import { useClearMark, useMyMarks, useViewerRole } from "./hooks";

const TABS: CurationMarkState[] = ["snoozed", "flagged", "reviewed", "noted"];

function MarksList({ state }: { state: CurationMarkState }) {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = useMyMarks(state);
  const clearMark = useClearMark();
  // Keyset pages, appended: the route hands back a cursor while more remain.
  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  if (isLoading) return <p className="p-4 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>;
  if (isError) return <p className="p-4 text-sm text-red-600 dark:text-red-400" role="alert">{i18next.t("curation-desk.list.error")}</p>;
  if (!items.length) return <p className="p-6 text-sm text-gray-500 text-center">{i18next.t("curation-desk.marks-view.empty")}</p>;

  return (
    <>
      <ul className="divide-y divide-[--border-color]">
        {items.map((mark) => (
          <li key={`${mark.author}/${mark.permlink}`} className="flex items-start gap-3 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <a href={`/@${mark.author}/${mark.permlink}`} className="font-semibold hover:underline line-clamp-1">
                {mark.title || i18next.t("curation-desk.row.untitled", { author: mark.author })}
              </a>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                <span>@{mark.author}</span>
                <span>{dateToRelative(mark.updated_at)}</span>
                {mark.state === "snoozed" && mark.snooze_until && (
                  <Chip tone="amber">{i18next.t("curation-desk.marks-view.until", { until: formatUtcDateHm(mark.snooze_until) })}</Chip>
                )}
                {mark.reason && <Chip tone="red">{i18next.t(`curation-desk.flag-reasons.${mark.reason}`, { defaultValue: mark.reason })}</Chip>}
              </div>
              {mark.note && <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap">{mark.note}</p>}
            </div>
            <Button
              size="xs"
              appearance="gray-link"
              className="!rounded-lg"
              aria-label={i18next.t("curation-desk.actions.clear-mark")}
              disabled={clearMark.isPending}
              onClick={async () => {
                try {
                  await clearMark.mutateAsync({ author: mark.author, permlink: mark.permlink });
                } catch (e) {
                  errorToast(...formatError(e));
                }
              }}
              icon={<UilTimes />}
            />
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <div className="flex justify-center p-3">
          <Button
            size="sm"
            appearance="secondary"
            disabled={isFetchingNextPage}
            isLoading={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? i18next.t("g.loading") : i18next.t("g.load-more")}
          </Button>
        </div>
      )}
    </>
  );
}

/** My marks: snoozed, flagged, reviewed and noted, one tab each. Roster only. */
export function CurationMyMarksView() {
  const viewer = useViewerRole();
  const [state, setState] = useState<CurationMarkState>("snoozed");

  return (
    <div className="bg-white dark:bg-dark-200 rounded-2xl overflow-hidden">
      <LoginRequired>
        {viewer.isLoading ? (
          <p className="p-4 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>
        ) : !viewer.isRoster ? (
          <p className="p-6 text-sm text-gray-500 text-center">{i18next.t("curation-desk.marks-view.roster-only")}</p>
        ) : (
          <>
            <div role="tablist" aria-label={i18next.t("curation-desk.marks-view.title")} className="flex gap-1 px-3 py-2 border-b border-[--border-color]">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={state === tab}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs",
                    state === tab ? "bg-blue-dark-sky text-white" : "bg-gray-100 dark:bg-dark-default text-gray-700 dark:text-gray-300"
                  )}
                  onClick={() => setState(tab)}
                >
                  {i18next.t(`curation-desk.mark-states.${tab}`)}
                </button>
              ))}
            </div>
            <MarksList state={state} />
          </>
        )}
      </LoginRequired>
    </div>
  );
}
