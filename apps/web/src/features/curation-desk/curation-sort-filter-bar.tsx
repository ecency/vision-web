"use client";

import clsx from "clsx";
import i18next from "i18next";
import type { CurationApp, CurationWindow } from "@ecency/sdk";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import { WORD_PRESETS } from "./consts";
import type { QueueFilters, ResolvedQueueFilters } from "./types";

interface Props {
  filters: ResolvedQueueFilters;
  isRoster: boolean;
  communities: Array<{ community: string; title?: string | null; count?: number }>;
  onChange: (patch: Partial<QueueFilters>) => void;
}

function ToggleChip({ on, label, onClick, tone }: { on: boolean; label: string; onClick: () => void; tone?: "red" }) {
  return (
    <Button
      size="xs"
      appearance={on ? "pressed" : "gray-link"}
      outline={!on}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={clsx("!rounded-full", tone === "red" && on && "!bg-red-100 !text-red-800 dark:!bg-red-900/40 dark:!text-red-300")}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

const APPS: CurationApp[] = ["all", "ecency", "peakd", "other"];
const WINDOWS: CurationWindow[] = ["all", "full", "half", "eighth", "locked"];

/**
 * Filter chips of spec 8.13. Every chip maps to a server param through
 * filtersToParams, never to a client-side row filter.
 */
export function CurationSortFilterBar({ filters, isRoster, communities, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-t border-[--border-color] text-xs" role="group" aria-label={i18next.t("curation-desk.filters.aria")}>
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
      <FormControl
        type="select"
        size="sm"
        value={filters.app}
        aria-label={i18next.t("curation-desk.filters.app")}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ app: e.target.value as CurationApp })}
      >
        {APPS.map((app) => (
          <option key={app} value={app}>
            {i18next.t(`curation-desk.filters.app-${app}`)}
          </option>
        ))}
      </FormControl>
      <FormControl
        type="select"
        size="sm"
        value={filters.community}
        aria-label={i18next.t("curation-desk.filters.community")}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ community: e.target.value })}
      >
        <option value="">{i18next.t("curation-desk.filters.community-all")}</option>
        {communities.map((c) => (
          <option key={c.community} value={c.community}>
            {c.title || c.community}
            {c.count != null ? ` (${c.count})` : ""}
          </option>
        ))}
      </FormControl>
      <ToggleChip
        on={filters.newAuthors}
        label={i18next.t("curation-desk.filters.new-authors")}
        onClick={() => onChange({ newAuthors: !filters.newAuthors })}
      />
      <ToggleChip
        on={filters.recommended}
        label={i18next.t("curation-desk.filters.recommended")}
        onClick={() => onChange({ recommended: !filters.recommended })}
      />
      {isRoster && (
        <ToggleChip
          on={filters.flagged}
          tone="red"
          label={i18next.t("curation-desk.filters.flagged")}
          onClick={() => onChange({ flagged: !filters.flagged })}
        />
      )}
      <FormControl
        type="select"
        size="sm"
        value={filters.window}
        aria-label={i18next.t("curation-desk.filters.window")}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ window: e.target.value as CurationWindow })}
      >
        {WINDOWS.map((w) => (
          <option key={w} value={w}>
            {i18next.t(`curation-desk.filters.window-${w}`)}
          </option>
        ))}
      </FormControl>
      <FormControl
        type="select"
        size="sm"
        value={filters.minWords ?? ""}
        aria-label={i18next.t("curation-desk.filters.words")}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ minWords: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">{i18next.t("curation-desk.filters.words-any")}</option>
        {WORD_PRESETS.map((n) => (
          <option key={n} value={n}>
            {i18next.t("curation-desk.filters.words-min", { count: n })}
          </option>
        ))}
      </FormControl>
      <ToggleChip
        on={filters.hasImages}
        label={i18next.t("curation-desk.filters.has-images")}
        onClick={() => onChange({ hasImages: !filters.hasImages })}
      />
      <label className="flex items-center gap-1 text-gray-500">
        <span>{i18next.t("curation-desk.filters.rep", { min: filters.repMin, max: filters.repMax })}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={filters.repMin}
          aria-label={i18next.t("curation-desk.filters.rep-min")}
          onChange={(e) => onChange({ repMin: Math.min(Number(e.target.value), filters.repMax) })}
          className="w-16 accent-blue-dark-sky"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={filters.repMax}
          aria-label={i18next.t("curation-desk.filters.rep-max")}
          onChange={(e) => onChange({ repMax: Math.max(Number(e.target.value), filters.repMin) })}
          className="w-16 accent-blue-dark-sky"
        />
      </label>
    </div>
  );
}
