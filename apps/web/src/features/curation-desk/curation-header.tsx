"use client";

import { memo, useMemo } from "react";
import clsx from "clsx";
import i18next from "i18next";
import { useQuery } from "@tanstack/react-query";
import { UilKeyboard, UilPauseCircle } from "@tooni/iconscout-unicons-react";
import {
  getAccountFullQueryOptions,
  getDynamicPropsQueryOptions,
  powerRechargeTime,
  votingPower,
  votingValue,
  type CurationActiveCurator,
  type CurationStatus,
  type CurationTeamCursor,
} from "@ecency/sdk";
import { Button } from "@ui/button";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { UserAvatar } from "@/features/shared/user-avatar";
import { dateToRelative } from "@/utils";
import { formatHm } from "./curation-window";

interface Props {
  status: CurationStatus | undefined;
  teamCursor: CurationTeamCursor | null | undefined;
  activeCurators: CurationActiveCurator[];
  isRoster: boolean;
  livePaused: boolean;
  onHelp: () => void;
}

const TRAIL_ACCOUNT = "ecency";

function budgetTone(vpPercent: number | undefined): "green" | "amber" | "red" | "gray" {
  if (vpPercent == null) return "gray";
  if (vpPercent >= 75) return "green";
  if (vpPercent >= 65) return "amber";
  return "red";
}

function Tile({ label, value, title, tone, children }: { label: string; value: React.ReactNode; title?: string; tone?: "green" | "amber" | "red" | "gray"; children?: React.ReactNode }) {
  return (
    <div
      title={title}
      className={clsx(
        "flex flex-col gap-0.5 rounded-xl border border-[--border-color] px-3 py-1.5 min-w-[7rem]",
        tone === "green" && "border-green-300 dark:border-green-800",
        tone === "amber" && "border-amber-300 dark:border-amber-800",
        tone === "red" && "border-red-300 dark:border-red-800"
      )}
    >
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-sm font-semibold leading-tight">{value}</span>
      {children}
    </div>
  );
}

/**
 * Header widgets of spec 9.3. Every number comes from data the page already
 * has: `status` (worker-written VP, implied weight, mana budget), the viewer's
 * own account and two cached public RPC queries for the vote value estimate.
 * The header never says "vote value falls with VP": it says the trail weight
 * falls with @ecency VP, which is the bot's rule.
 */
export const CurationHeader = memo(function CurationHeader({ status, teamCursor, activeCurators, isRoster, livePaused, onHelp }: Props) {
  const { account } = useActiveAccount();
  const vp = status?.vp;
  const mana = status?.mana_spent_today;

  const ecency = useQuery({ ...getAccountFullQueryOptions(TRAIL_ACCOUNT), staleTime: 60_000 });
  const props = useQuery({ ...getDynamicPropsQueryOptions(), staleTime: 60_000 });

  const impliedWeight = vp?.implied_weight ?? null;
  const trailValue = useMemo(() => {
    if (!ecency.data || !props.data || impliedWeight == null) return null;
    try {
      return votingValue(ecency.data, props.data, votingPower(ecency.data) * 100, impliedWeight);
    } catch {
      return null;
    }
  }, [ecency.data, props.data, impliedWeight]);

  const ownVp = useMemo(() => {
    if (!account) return null;
    try {
      return votingPower(account);
    } catch {
      return null;
    }
  }, [account]);
  const ownValue = useMemo(() => {
    if (!account || !props.data || ownVp == null) return null;
    try {
      return votingValue(account, props.data, ownVp * 100, 10000);
    } catch {
      return null;
    }
  }, [account, props.data, ownVp]);

  const rechargeHours = useMemo(() => {
    if (vp?.live_percent == null) return null;
    try {
      return powerRechargeTime(Math.min(100, Math.max(0, vp.live_percent))) / 3600;
    } catch {
      return null;
    }
  }, [vp?.live_percent]);

  const sustainable = vp?.sustainable_votes_per_day ?? null;
  const spent = mana?.equiv ?? null;
  const gap = mana?.crosscheck != null && spent != null ? Math.abs(mana.crosscheck - spent) : null;
  const tone = budgetTone(vp?.percent);
  const barPct = sustainable && spent != null ? Math.min(100, Math.round((spent / sustainable) * 100)) : 0;

  return (
    <header className="flex flex-wrap items-stretch gap-2 px-3 py-2 text-xs" aria-label={i18next.t("curation-desk.header.aria")}>
      <Tile
        label={i18next.t("curation-desk.header.cursor")}
        value={
          teamCursor?.created
            ? i18next.t("curation-desk.header.cursor-value", {
                time: new Date(teamCursor.created).toISOString().slice(11, 16),
                by: teamCursor.set_by ? `@${teamCursor.set_by}` : "",
                when: teamCursor.set_at ? dateToRelative(teamCursor.set_at) : "",
              })
            : i18next.t("curation-desk.header.cursor-none")
        }
      >
        {status?.behind_seconds != null && (
          <span className={clsx("text-[11px]", status.behind_seconds > 4 * 3600 ? "text-amber-600 dark:text-amber-400" : "text-gray-500")}>
            {i18next.t("curation-desk.header.behind", { time: formatHm(status.behind_seconds * 1000) })}
          </span>
        )}
      </Tile>

      {isRoster && (
        <Tile
          label={i18next.t("curation-desk.header.active")}
          value={
            activeCurators.length ? (
              <span className="flex -space-x-1">
                {activeCurators.slice(0, 6).map((c) => (
                  <UserAvatar key={c.username} username={c.username} size="xsmall" className="size-5 rounded-full ring-1 ring-white dark:ring-dark-200" />
                ))}
              </span>
            ) : (
              i18next.t("curation-desk.header.active-none")
            )
          }
          title={activeCurators.map((c) => `@${c.username}`).join(", ")}
        >
          {activeCurators.length > 0 && (
            <span className="text-[11px] text-gray-500">{i18next.t("curation-desk.header.active-hint")}</span>
          )}
        </Tile>
      )}

      {ownVp != null && (
        <Tile
          label={i18next.t("curation-desk.header.your-vp")}
          value={`${ownVp.toFixed(1)}%`}
          title={ownValue != null ? i18next.t("curation-desk.header.your-value", { value: ownValue.toFixed(3) }) : undefined}
        >
          {ownValue != null && (
            <span className="text-[11px] text-gray-500">{i18next.t("curation-desk.header.your-value", { value: ownValue.toFixed(3) })}</span>
          )}
        </Tile>
      )}

      <Tile
        label={i18next.t("curation-desk.header.ecency-vp")}
        tone={tone}
        value={
          vp
            ? i18next.t("curation-desk.header.ecency-vp-value", {
                vp: vp.percent.toFixed(1),
                weight: (vp.implied_weight / 100).toFixed(1),
              })
            : i18next.t("curation-desk.header.unknown")
        }
        title={[
          i18next.t("curation-desk.header.ecency-vp-tooltip"),
          vp?.live_percent != null ? i18next.t("curation-desk.header.live-vp", { vp: vp.live_percent.toFixed(1) }) : "",
          rechargeHours != null ? i18next.t("curation-desk.header.recharge", { hours: rechargeHours.toFixed(1) }) : "",
        ]
          .filter(Boolean)
          .join("\n")}
      >
        {trailValue != null && (
          <span className="text-[11px] text-gray-500">
            {i18next.t("curation-desk.header.trail-value", { value: trailValue.toFixed(2) })}
          </span>
        )}
      </Tile>

      <Tile
        label={i18next.t("curation-desk.header.mana")}
        tone={tone}
        value={
          spent != null && sustainable
            ? i18next.t("curation-desk.header.mana-value", { spent: Math.round(spent), max: sustainable })
            : i18next.t("curation-desk.header.unknown")
        }
        title={[
          mana ? i18next.t("curation-desk.header.mana-split", { trail: Math.round(mana.trail), other: Math.round(mana.other) }) : "",
          vp?.regen_votes_per_hour != null ? i18next.t("curation-desk.header.regen", { rate: vp.regen_votes_per_hour.toFixed(1) }) : "",
          mana?.crosscheck != null ? i18next.t("curation-desk.header.crosscheck", { value: Math.round(mana.crosscheck) }) : "",
          gap != null && gap > 2 ? i18next.t("curation-desk.header.crosscheck-gap") : "",
        ]
          .filter(Boolean)
          .join("\n")}
      >
        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-dark-default overflow-hidden" aria-hidden>
          <div
            className={clsx(
              "h-full rounded-full",
              tone === "green" && "bg-green-500",
              tone === "amber" && "bg-amber-500",
              tone === "red" && "bg-red-500",
              tone === "gray" && "bg-gray-400"
            )}
            style={{ width: `${barPct}%` }}
          />
        </div>
        {mana && (
          <span className="text-[11px] text-gray-500">
            {i18next.t("curation-desk.header.mana-split", { trail: Math.round(mana.trail), other: Math.round(mana.other) })}
            {vp?.regen_votes_per_hour != null ? ` · ${i18next.t("curation-desk.header.regen", { rate: vp.regen_votes_per_hour.toFixed(1) })}` : ""}
          </span>
        )}
      </Tile>

      <div className="flex items-center gap-2 ml-auto text-gray-500">
        {status?.head_lag_seconds != null && (
          <span title={i18next.t("curation-desk.header.lag-tooltip")}>
            {i18next.t("curation-desk.header.lag", { seconds: status.head_lag_seconds })}
          </span>
        )}
        {status?.worker_tick_age_seconds != null && status.worker_tick_age_seconds > 120 && (
          <span className="text-amber-600 dark:text-amber-400">{i18next.t("curation-desk.header.worker-stale")}</span>
        )}
        {livePaused && (
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400" role="status">
            <UilPauseCircle className="size-4" aria-hidden />
            {i18next.t("curation-desk.header.live-paused")}
          </span>
        )}
        <Button
          size="xs"
          appearance="gray-link"
          className="!rounded-lg"
          aria-label={i18next.t("curation-desk.shortcuts.title")}
          title={i18next.t("curation-desk.shortcuts.title")}
          onClick={onHelp}
          icon={<UilKeyboard />}
        />
      </div>
    </header>
  );
});
