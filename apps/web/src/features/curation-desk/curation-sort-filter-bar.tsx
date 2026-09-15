"use client";

import { useEffect, useRef, useState } from "react";
import i18next from "i18next";
import { UilAngleDown, UilSlidersVAlt } from "@tooni/iconscout-unicons-react";
import type { CurationApp } from "@ecency/sdk";
import { FormControl } from "@ui/input";
import { CURATION_APPS, WORD_PRESETS } from "./consts";
import { ToggleChip } from "./curation-toggle-chip";
import { countActiveFilters } from "./hooks";
import type { QueueFilters, ResolvedQueueFilters } from "./types";

interface Props {
  filters: ResolvedQueueFilters;
  isRoster: boolean;
  communities: Array<{ community: string; title?: string | null; count?: number }>;
  onChange: (patch: Partial<QueueFilters>) => void;
}

/**
 * The refine panel of spec 8.13. Every chip maps to a server param through
 * filtersToParams, never to a client-side row filter. The window and the
 * handled-post chips live in the toolbar, next to the sort.
 */
export function CurationSortFilterBar({ filters, isRoster, communities, onChange }: Props) {
  // Same tally the toolbar's Reset button shows, minus what sits in the toolbar.
  const advancedCount = countActiveFilters(filters, isRoster, "refine");
  // The facets are the server's global top list, so a restored (or simply
  // rarer) community can be absent from it. Without this the select would show
  // "All communities" while the request filters by one.
  const communityOptions =
    filters.community && !communities.some((c) => c.community === filters.community)
      ? [{ community: filters.community }, ...communities]
      : communities;
  return (
    <div
      className="flex flex-wrap items-start gap-3 px-4 pb-4 sm:px-5 text-xs"
      role="group"
      aria-label={i18next.t("curation-desk.filters.aria")}
    >
      <details className="group/filters min-w-[12rem] flex-1 rounded-xl border border-[--border-color] open:basis-full">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-dark-sky [&::-webkit-details-marker]:hidden">
          <UilSlidersVAlt className="size-4 text-gray-500" aria-hidden />
          <span className="font-medium">{i18next.t("curation-desk.filters.refine")}</span>
          {advancedCount > 0 && (
            <span className="rounded-full bg-blue-dark-sky/10 px-2 py-0.5 text-xs text-blue-dark-sky">
              {/* A bare span takes no accessible name, so aria-label here would be
                  ignored: the count carries its own text instead. */}
              <span aria-hidden="true">{advancedCount}</span>
              <span className="sr-only">
                {i18next.t("curation-desk.filters.active-count", { count: advancedCount })}
              </span>
            </span>
          )}
          <span className="ml-auto hidden truncate text-xs text-gray-500 sm:inline">
            {i18next.t("curation-desk.filters.refine-hint")}
          </span>
          <UilAngleDown
            className="ml-auto size-4 text-gray-500 transition-transform group-open/filters:rotate-180 sm:ml-1"
            aria-hidden
          />
        </summary>
        <div className="grid gap-5 border-t border-[--border-color] p-4 sm:grid-cols-2 lg:grid-cols-3">
          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-3 font-semibold text-gray-600 dark:text-gray-400">
              {i18next.t("curation-desk.filters.source")}
            </legend>
            <label className="block space-y-1.5">
              <span>{i18next.t("curation-desk.filters.app")}</span>
              <FormControl
                type="select"
                size="sm"
                value={filters.app}
                aria-label={i18next.t("curation-desk.filters.app")}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  onChange({ app: e.target.value as CurationApp })
                }
              >
                {CURATION_APPS.map((app) => (
                  <option key={app} value={app}>
                    {i18next.t(`curation-desk.filters.app-${app}`)}
                  </option>
                ))}
              </FormControl>
            </label>
            <label className="block space-y-1.5">
              <span>{i18next.t("curation-desk.filters.community")}</span>
              <FormControl
                type="select"
                size="sm"
                value={filters.community}
                aria-label={i18next.t("curation-desk.filters.community")}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  onChange({ community: e.target.value })
                }
              >
                <option value="">{i18next.t("curation-desk.filters.community-all")}</option>
                {communityOptions.map((c) => (
                  <option key={c.community} value={c.community}>
                    {c.title || c.community}
                    {c.count != null ? ` (${c.count})` : ""}
                  </option>
                ))}
              </FormControl>
            </label>
            <div className="flex flex-wrap gap-2">
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
              {isRoster && (
                <ToggleChip
                  on={filters.excluded}
                  label={i18next.t("curation-desk.filters.excluded")}
                  onClick={() => onChange({ excluded: !filters.excluded })}
                />
              )}
            </div>
          </fieldset>
          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-3 font-semibold text-gray-600 dark:text-gray-400">
              {i18next.t("curation-desk.filters.content")}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0 space-y-1.5">
                <span>{i18next.t("curation-desk.filters.words")}</span>
                <FormControl
                  type="select"
                  size="sm"
                  value={filters.minWords ?? ""}
                  aria-label={i18next.t("curation-desk.filters.words")}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    onChange({ minWords: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">{i18next.t("curation-desk.filters.words-any")}</option>
                  {WORD_PRESETS.map((n) => (
                    <option key={n} value={n}>
                      {i18next.t("curation-desk.filters.words-min", { count: n })}
                    </option>
                  ))}
                </FormControl>
              </label>
              <label className="block min-w-0 space-y-1.5">
                <span>{i18next.t("curation-desk.filters.words-max-label")}</span>
                <FormControl
                  type="select"
                  size="sm"
                  value={filters.maxWords ?? ""}
                  aria-label={i18next.t("curation-desk.filters.words-max-label")}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    onChange({ maxWords: e.target.value ? Number(e.target.value) : null })
                  }
                >
                  <option value="">{i18next.t("curation-desk.filters.words-any-max")}</option>
                  {WORD_PRESETS.map((n) => (
                    <option key={n} value={n}>
                      {i18next.t("curation-desk.filters.words-max", { count: n })}
                    </option>
                  ))}
                </FormControl>
              </label>
            </div>
            <ToggleChip
              on={filters.hasImages}
              label={i18next.t("curation-desk.filters.has-images")}
              onClick={() => onChange({ hasImages: !filters.hasImages })}
            />
          </fieldset>
          <fieldset className="min-w-0">
            <legend className="mb-3 font-semibold text-gray-600 dark:text-gray-400">
              {i18next.t("curation-desk.filters.author-reputation")}
            </legend>
            <ReputationRange
              repMin={filters.repMin}
              repMax={filters.repMax}
              onCommit={(range) => onChange(range)}
            />
          </fieldset>
        </div>
      </details>
    </div>
  );
}

/**
 * The two reputation sliders. They move a local copy while the pointer or the
 * arrow key is down and hand the range over once it is let go: every step of a
 * drag used to be a filter change, and a filter change is a new feed key, a
 * page-one request and a saved-filters write. Thirty steps of one drag were
 * thirty of each, with the queue re-rendering under the thumb.
 */
function ReputationRange({
  repMin,
  repMax,
  onCommit
}: {
  repMin: number;
  repMax: number;
  onCommit: (range: { repMin: number; repMax: number }) => void;
}) {
  const [draft, setDraft] = useState({ repMin, repMax });
  // Follow a change made elsewhere (Reset, a restored set). While a drag is on,
  // the committed range does not move, so this never fights the thumb.
  useEffect(() => {
    setDraft({ repMin, repMax });
  }, [repMin, repMax]);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const committedRef = useRef({ repMin, repMax });
  committedRef.current = { repMin, repMax };
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // The native `change` event is the release: a range input fires `input` on
  // every step and `change` once the value is let go, on the input itself
  // even when the pointer is released somewhere else on the page (and after
  // each keyboard step). React's onChange is the `input` event, and a
  // pointerup handler on the input never sees a release outside it.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onRelease = () => {
      const next = draftRef.current;
      const committed = committedRef.current;
      if (next.repMin !== committed.repMin || next.repMax !== committed.repMax) {
        onCommitRef.current(next);
      }
    };
    root.addEventListener("change", onRelease);
    return () => root.removeEventListener("change", onRelease);
  }, []);

  return (
    <div ref={rootRef} className="flex flex-col gap-3 text-gray-600 dark:text-gray-400">
      <span>
        {i18next.t("curation-desk.filters.rep", {
          min: draft.repMin,
          max: draft.repMax
        })}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={draft.repMin}
        aria-label={i18next.t("curation-desk.filters.rep-min")}
        onChange={(e) =>
          setDraft((d) => ({ ...d, repMin: Math.min(Number(e.target.value), d.repMax) }))
        }
        className="w-full accent-blue-dark-sky"
      />
      <input
        type="range"
        min={0}
        max={100}
        value={draft.repMax}
        aria-label={i18next.t("curation-desk.filters.rep-max")}
        onChange={(e) =>
          setDraft((d) => ({ ...d, repMax: Math.max(Number(e.target.value), d.repMin) }))
        }
        className="w-full accent-blue-dark-sky"
      />
    </div>
  );
}
