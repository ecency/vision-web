"use client";

import { useMemo } from "react";
import clsx from "clsx";
import i18next from "i18next";
import type { CurationHandoffEntry } from "@ecency/sdk";
import { UserAvatar } from "@/features/shared/user-avatar";
import { dateToRelative } from "@/utils";
import { POLL_MS_CURATOR } from "./consts";
import { describeLane, isSameUtcDay, orderHandoff } from "./curation-handoff";
import { formatUtcDateHm, formatUtcHm } from "./curation-window";

interface Props {
  /**
   * Null is "not known": no tick has answered under this key yet, or the
   * backend does not send it. Only an empty array means nobody has marked.
   */
  entries: CurationHandoffEntry[] | null;
  username: string | undefined;
  /** When the tick last answered, so a bar the tick has stopped feeding says so. */
  updatedAt: number | null;
  now: number;
  communities: Array<{ community: string; title?: string | null }>;
  /**
   * The viewer is on the queue order with handled rows hidden, so page one
   * of THEIR queue really is the oldest post nobody has handled. Under any
   * other sort or with handled rows shown that sentence would be false, and
   * it is left out rather than said.
   */
  queueStartsAtOldestUnhandled: boolean;
}

/** The tick runs every 15 s; two missed ticks and the bar is describing the past. */
const STALE_MS = 2 * POLL_MS_CURATOR;

/**
 * Who got how far, and in which queue.
 *
 * This is the message curators used to type into Discord ("reviewed up to
 * 08:14"), derived from their own marks so nobody types it. It replaces the one
 * shared team cursor, which could not describe a desk where two curators work
 * different filters: a single chronological watermark assumes a single
 * chronological list.
 *
 * Read-only by design. A position is the newest post a curator marked, which is
 * a progress claim and not a contiguous reviewed prefix, so it is worth reading
 * and must never aim anything.
 */
export function CurationHandoffBar({
  entries,
  username,
  updatedAt,
  now,
  communities,
  queueStartsAtOldestUnhandled,
}: Props) {
  const rows = useMemo(() => orderHandoff(entries, username), [entries, username]);
  const titles = useMemo(
    () => new Map(communities.map((c) => [c.community, c.title ?? null] as const)),
    [communities]
  );
  // The tick stops on its own when the tab is idle, hidden or empty, and on a
  // failure, so freshness is read off the clock rather than off a flag that
  // only one of those paths sets.
  const stale = updatedAt != null && now - updatedAt > STALE_MS;

  return (
    <section
      className="border-t border-[--border-color] px-4 py-3 sm:px-5 text-xs"
      aria-label={i18next.t("curation-desk.handoff.aria")}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium">{i18next.t("curation-desk.handoff.title")}</h2>
        {updatedAt != null && (
          <span className={clsx(stale ? "text-warning-ink dark:text-warning-default" : "text-gray-500")}>
            {i18next.t("curation-desk.handoff.updated", { when: dateToRelative(new Date(updatedAt).toISOString()) })}
          </span>
        )}
      </div>

      {entries === null ? null : rows.length === 0 ? (
        <p className="mt-2 text-gray-500">{i18next.t("curation-desk.handoff.empty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {rows.map((entry) => {
            const mine = entry.username === username;
            // A bare HH:MM cannot tell this morning from three days ago, and a
            // hand-off is exactly the case where those differ.
            const at = entry.reviewed_to
              ? isSameUtcDay(entry.reviewed_to, now)
                ? i18next.t("curation-desk.handoff.to-time", { time: formatUtcHm(entry.reviewed_to) })
                : i18next.t("curation-desk.handoff.to-date", { time: formatUtcDateHm(entry.reviewed_to) })
              : null;
            // Under any order but the queue order the position is not a watermark;
            // the lane text says so in words, which is enough.
            const lane = describeLane(entry.lane, entry.lane?.community ? titles.get(entry.lane.community) : null);
            return (
              <li key={entry.username} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <UserAvatar username={entry.username} size="xsmall" className="size-4 rounded-full" />
                <span className={clsx("font-medium", mine && "text-blue-dark-sky")}>
                  {mine
                    ? i18next.t("curation-desk.handoff.you", { username: entry.username })
                    : `@${entry.username}`}
                </span>
                {at && <span>{at}</span>}
                {entry.last_mark_at && (
                  <span className="text-gray-500">{dateToRelative(entry.last_mark_at)}</span>
                )}
                {entry.marks_24h != null && (
                  <span className="text-gray-500">
                    {i18next.t("curation-desk.handoff.marks", { count: entry.marks_24h })}
                  </span>
                )}
                {entry.curations_24h != null && (
                  <span className="text-gray-500">
                    {i18next.t("curation-desk.handoff.curations", { count: entry.curations_24h })}
                  </span>
                )}
                {lane && <span className="text-gray-500">{lane}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {queueStartsAtOldestUnhandled && (
        <p className="mt-2 text-gray-500">{i18next.t("curation-desk.handoff.where-you-start")}</p>
      )}
    </section>
  );
}
