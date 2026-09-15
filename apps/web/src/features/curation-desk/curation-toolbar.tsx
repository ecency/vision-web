"use client";

import i18next from "i18next";
import { UilRedo } from "@tooni/iconscout-unicons-react";
import type { CurationSort, CurationWindow } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { CURATION_WINDOWS } from "./consts";
import { ToggleChip } from "./curation-toggle-chip";
import type { QueueFilters, ResolvedQueueFilters } from "./types";

interface Props {
  filters: ResolvedQueueFilters;
  isRoster: boolean;
  totalEstimate: number | null | undefined;
  /** Filters away from the desk's defaults, for Reset. */
  activeFilterCount: number;
  /** The request narrows what `total_estimate` counts; see narrowsBacklog. */
  narrowed: boolean;
  /** The account whose saved refine set is in effect, null when none is. */
  savedOwner: string | null;
  onSort: (sort: CurationSort) => void;
  onChange: (patch: Partial<QueueFilters>) => void;
  onReshuffle: () => void;
  onReset: () => void;
}

/**
 * The controls a curator changes while working, on one line: the order, the
 * window and the handled-post chips, then the match count from the server's
 * `total_estimate` and Reset. Everything else stays in the refine panel.
 */
export function CurationToolbar({
  filters,
  isRoster,
  totalEstimate,
  activeFilterCount,
  narrowed,
  savedOwner,
  onSort,
  onChange,
  onReshuffle,
  onReset
}: Props) {
  const sorts: CurationSort[] = isRoster
    ? ["queue", "newest", "unique", "random"]
    : ["queue", "newest", "unique"];
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 border-t border-[--border-color] text-xs">
      <label className="flex items-center gap-2">
        <span className="text-gray-500">{i18next.t("curation-desk.sort.label")}</span>
        <FormControl
          type="select"
          size="sm"
          value={filters.sort}
          aria-label={i18next.t("curation-desk.sort.label")}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onSort(e.target.value as CurationSort)
          }
        >
          {sorts.map((sort) => (
            <option key={sort} value={sort}>
              {i18next.t(`curation-desk.sort.${sort}`)}
            </option>
          ))}
        </FormControl>
      </label>
      {filters.sort === "unique" && (
        <span className="text-gray-500">{i18next.t("curation-desk.sort.unique-hint")}</span>
      )}
      {filters.sort === "random" && isRoster && (
        <Button
          size="xs"
          appearance="gray-link"
          className="!rounded-lg"
          aria-label={i18next.t("curation-desk.sort.reshuffle")}
          onClick={onReshuffle}
          icon={<UilRedo />}
        >
          {i18next.t("curation-desk.sort.reshuffle")}
        </Button>
      )}
      <label className="flex items-center gap-2">
        <span className="text-gray-500">{i18next.t("curation-desk.filters.window")}</span>
        <FormControl
          type="select"
          size="sm"
          value={filters.window}
          aria-label={i18next.t("curation-desk.filters.window")}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            onChange({ window: e.target.value as CurationWindow })
          }
        >
          {CURATION_WINDOWS.map((w) => (
            <option key={w} value={w}>
              {i18next.t(`curation-desk.filters.window-${w}`)}
            </option>
          ))}
        </FormControl>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {isRoster && (
          <ToggleChip
            on={filters.unreviewedOnly}
            label={i18next.t("curation-desk.filters.unreviewed")}
            onClick={() => onChange({ unreviewedOnly: !filters.unreviewedOnly })}
          />
        )}
        <ToggleChip
          on={filters.hideCurated}
          label={i18next.t("curation-desk.filters.hide-curated")}
          onClick={() => onChange({ hideCurated: !filters.hideCurated })}
        />
      </div>
      <span className="ml-auto flex flex-wrap items-center justify-end gap-2 text-gray-500">
        {totalEstimate != null && (
          <span aria-live="polite">
            {/* The server counts the team backlog, not this request, so a
                narrowed queue must not print that number as "matches". That is
                not the Reset count: the default window narrows, and "All
                windows" is a Reset filter that narrows nothing. */}
            {narrowed
              ? i18next.t("curation-desk.toolbar.backlog", { count: totalEstimate })
              : i18next.t("curation-desk.toolbar.match", { count: totalEstimate })}
          </span>
        )}
        {/* A restored set is silent otherwise, and on a shared browser the
            curator has no way to tell whose filters are in effect. */}
        {savedOwner && <span>{i18next.t("curation-desk.toolbar.saved", { username: savedOwner })}</span>}
        {activeFilterCount > 0 && (
          <Button
            size="xs"
            appearance="gray-link"
            className="!rounded-lg"
            aria-label={i18next.t("curation-desk.toolbar.reset", { count: activeFilterCount })}
            onClick={onReset}
          >
            {i18next.t("curation-desk.toolbar.reset", { count: activeFilterCount })}
          </Button>
        )}
      </span>
    </div>
  );
}
