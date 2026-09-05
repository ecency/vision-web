"use client";

import i18next from "i18next";
import { UilRedo } from "@tooni/iconscout-unicons-react";
import type { CurationSort } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import type { QueueFilters } from "./types";

interface Props {
  filters: QueueFilters;
  isRoster: boolean;
  totalEstimate: number | null | undefined;
  activeFilterCount: number;
  onSort: (sort: CurationSort) => void;
  onReshuffle: () => void;
  onReset: () => void;
}

/** Sort menu, the match count from the server's `total_estimate` and Reset. */
export function CurationToolbar({ filters, isRoster, totalEstimate, activeFilterCount, onSort, onReshuffle, onReset }: Props) {
  const sorts: CurationSort[] = isRoster ? ["queue", "newest", "unique", "random"] : ["queue", "newest", "unique"];
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-[--border-color] text-xs">
      <label className="flex items-center gap-2">
        <span className="text-gray-500">{i18next.t("curation-desk.sort.label")}</span>
        <FormControl
          type="select"
          size="sm"
          value={filters.sort}
          aria-label={i18next.t("curation-desk.sort.label")}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSort(e.target.value as CurationSort)}
        >
          {sorts.map((sort) => (
            <option key={sort} value={sort}>
              {i18next.t(`curation-desk.sort.${sort}`)}
            </option>
          ))}
        </FormControl>
      </label>
      {filters.sort === "unique" && <span className="text-gray-500">{i18next.t("curation-desk.sort.unique-hint")}</span>}
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
      <span className="ml-auto flex items-center gap-2 text-gray-500">
        {totalEstimate != null && <span aria-live="polite">{i18next.t("curation-desk.toolbar.match", { count: totalEstimate })}</span>}
        {activeFilterCount > 0 && (
          <Button size="xs" appearance="gray-link" className="!rounded-lg" aria-label={i18next.t("curation-desk.toolbar.reset")} onClick={onReset}>
            {i18next.t("curation-desk.toolbar.reset", { count: activeFilterCount })}
          </Button>
        )}
      </span>
    </div>
  );
}
