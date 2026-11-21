"use client";

import i18next from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UilStar } from "@tooni/iconscout-unicons-react";
import { rewardIcon, rewardLabel } from "@/features/advent/reward";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { adventApi } from "@/features/advent/client";
import { AdventError } from "@/features/advent/advent-api";
import { AdventQueryKeys } from "@/features/advent/query-keys";
import { loadSession } from "@/features/raidstead/client";
import { useAdventSession } from "@/features/advent/use-advent-session";
import { doorView, type DoorView } from "@/features/advent/door-view";
import {
  ADVENT_DOORS,
  ADVENT_FIRST_DOOR,
  ADVENT_SEASON,
  adventPhase,
  todayDoor
} from "@/features/advent/season";
import { Sky, useSnowSwitch } from "@/features/advent/sky";
import { BowArt, FlakeArt, OpenBoxArt, StarArt } from "@/features/advent/art";
import type { GrandDraw, MeDoor, PublicDoor, SeasonState } from "@/features/advent/types";
import { DoorSheet } from "./door-sheet";

const WRAPS = ["adv-w-red", "adv-w-green", "adv-w-snow", "adv-w-gold", "adv-w-blue"];
const fmt = (n: number) => n.toLocaleString();

/// The clock the page runs on, moved on every half minute.
/// Null on the server and the first render: every date on the page is the
/// reader's, decided in the browser.
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Countdown({ to, now }: { to: number; now: number }) {
  const ms = Math.max(0, to - now);
  const d = Math.floor(ms / 864e5);
  const h = Math.floor(ms / 36e5) % 24;
  const m = Math.floor(ms / 6e4) % 60;
  return (
    <div className="adv-count" role="timer" aria-label={i18next.t("advent.countdown-label")}>
      <div>
        <b>{d}</b>
        <span>{i18next.t("advent.days")}</span>
      </div>
      <div>
        <b>{String(h).padStart(2, "0")}</b>
        <span>{i18next.t("advent.hours")}</span>
      </div>
      <div>
        <b>{String(m).padStart(2, "0")}</b>
        <span>{i18next.t("advent.minutes")}</span>
      </div>
    </div>
  );
}

function Toggle({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="adv-toggle" aria-pressed={on} onClick={onClick} disabled={disabled}>
      <span className="adv-switch" />
      {label}
    </button>
  );
}

interface DoorTileProps {
  day: number;
  door?: PublicDoor;
  view: DoorView;
  swinging: boolean;
  onOpen: (day: number) => void;
}

function DoorTile({ day, door, view, swinging, onOpen }: DoorTileProps) {
  const label = i18next.t("advent.door-label", { day });
  if (view.look === "locked" || view.look === "today") {
    const today = view.look === "today";
    const content = (
      <>
        {door && (
          <span className="adv-chip">
            {rewardIcon(door.reward.kind)}
            <span className="lbl">{rewardLabel(door.reward.kind)}</span>
          </span>
        )}
        <span className="adv-bow">
          <BowArt />
        </span>
        {today && <span className="adv-flag">{i18next.t("advent.open-me")}</span>}
        <span className="adv-tag">{day}</span>
      </>
    );
    const cls = `adv-door adv-gift ${WRAPS[(day * 3) % 5]}${today ? " today" : ""}${swinging ? " swing" : ""}`;
    return today ? (
      <button type="button" className={cls} data-look="today" aria-label={label} onClick={() => onOpen(day)}>
        {content}
      </button>
    ) : (
      <div className={cls} data-look="locked" role="img" aria-label={label}>
        {content}
      </div>
    );
  }

  let cls = "frost";
  let art = <FlakeArt />;
  let meta = i18next.t("advent.results");
  let extra: React.ReactNode = null;
  switch (view.look) {
    case "waiting":
      cls = "opened";
      art = <OpenBoxArt />;
      meta = i18next.t("advent.waiting-draw");
      extra = <Check />;
      break;
    case "answered":
      cls = "opened";
      art = <OpenBoxArt />;
      meta = view.late
        ? i18next.t("advent.late")
        : view.participation
          ? i18next.t("advent.plus-points", { n: fmt(view.participation.amount) })
          : i18next.t("advent.answered");
      extra = <Check />;
      break;
    case "won":
      cls = "won";
      art = <StarArt />;
      meta = `${fmt(view.prize!.amount)} ${rewardLabel(view.prize!.kind)}`;
      extra = <span className="adv-ribbon">{i18next.t("advent.place", { n: view.prize!.place })}</span>;
      break;
    case "missed":
      meta = i18next.t("advent.missed");
      break;
    case "closed":
      meta = i18next.t("advent.closed");
      break;
  }
  return (
    <button
      type="button"
      className={`adv-door adv-flat ${cls}`}
      data-look={view.look}
      aria-label={`${label}, ${meta}`}
      onClick={() => onOpen(day)}
    >
      <span className="num">{day}</span>
      {extra}
      <span className="mid">{art}</span>
      <span className="meta">{meta}</span>
    </button>
  );
}

function Check() {
  return (
    <span className="adv-check">
      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" className="size-2.5" aria-hidden data-icon-exempt>
        <path d="M2 5.2 4.2 7.4 8 3" />
      </svg>
    </span>
  );
}

function Legend() {
  return (
    <div className="adv-legend">
      <span>
        <i className="adv-w-red" style={{ boxShadow: "0 0 0 2px var(--adv-gold)" }} />
        {i18next.t("advent.legend-today")}
      </span>
      <span>
        <i className="adv-w-green" />
        {i18next.t("advent.legend-wrapped")}
      </span>
      <span>
        <i style={{ background: "var(--adv-opened)", boxShadow: "inset 0 0 0 1.5px var(--adv-green)" }} />
        {i18next.t("advent.answered")}
      </span>
      <span>
        <i style={{ background: "var(--adv-gold)" }} />
        {i18next.t("advent.legend-won")}
      </span>
      <span>
        <i style={{ background: "var(--adv-frost)" }} />
        {i18next.t("advent.missed")}
      </span>
    </div>
  );
}

function Teaser() {
  const prizes: [string, string][] = [
    ["100,000", i18next.t("advent.prize-points")],
    ["1,000", i18next.t("advent.prize-hive")],
    ["1,000", i18next.t("advent.prize-hp")],
    ["10,000", i18next.t("advent.prize-delegation")],
    ["5", i18next.t("advent.prize-spotlight")]
  ];
  const steps: [string, string, string][] = [
    ["var(--adv-berry)", i18next.t("advent.step-open"), i18next.t("advent.step-open-text")],
    ["var(--adv-pine-2)", i18next.t("advent.step-answer"), i18next.t("advent.step-answer-text")],
    ["#c98a12", i18next.t("advent.step-win"), i18next.t("advent.step-win-text")]
  ];
  return (
    <>
      <div className="adv-steps">
        {steps.map(([c, title, text], i) => (
          <div key={i} className="adv-step">
            <b>
              <i style={{ "--c": c } as React.CSSProperties}>{i + 1}</i>
              {title}
            </b>
            {text}
          </div>
        ))}
      </div>
      <div className="adv-prizes">
        {prizes.map(([v, k]) => (
          <div key={k} className="adv-prize">
            <span className="v">{v}</span>
            <span className="k">{k}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function MyPrizes({ me }: { me: NonNullable<SeasonState["me"]> }) {
  const rows = Object.entries(me.doors)
    .map(([day, d]) => [Number(day), d] as [number, MeDoor])
    .filter(([, d]) => (d.prize && d.prize.status !== "cancelled") || d.participation)
    .sort((a, b) => a[0] - b[0]);
  const grand = me.grand && me.grand.status !== "cancelled" ? me.grand : null;
  if (!rows.length && !grand) return null;
  const points =
    rows.reduce(
      (s, [, d]) =>
        s + (d.prize?.kind === "points" && d.prize.status !== "cancelled" ? d.prize.amount : 0) + (d.participation?.amount ?? 0),
      0
    ) + (grand?.amount ?? 0);
  const status = (s: string) => (
    <span className={`adv-pill ${s === "paid" ? "green" : ""}`}>
      {i18next.t(`advent.status-${s === "paid" ? "paid" : s === "pending" ? "pending" : "delayed"}`)}
    </span>
  );
  return (
    <div className="adv-card">
      <div className="adv-row">
        <h3>{i18next.t("advent.your-prizes")}</h3>
        {points > 0 && <span className="adv-pill gold">{i18next.t("advent.points-so-far", { n: fmt(points) })}</span>}
      </div>
      {rows.flatMap(([day, d]) => [
        d.prize && d.prize.status !== "cancelled" && (
          <div key={`${day}p`} className="adv-row adv-muted">
            <span>{i18next.t("advent.prize-row", { day, place: d.prize.place })}</span>
            <span>
              {fmt(d.prize.amount)} {rewardLabel(d.prize.kind)} · {status(d.prize.status)}
            </span>
          </div>
        ),
        d.participation && (
          <div key={`${day}a`} className="adv-row adv-muted">
            <span>{i18next.t("advent.participation-row", { day })}</span>
            <span>
              {i18next.t("advent.points-n", { n: fmt(d.participation.amount) })} · {status(d.participation.status)}
            </span>
          </div>
        )
      ])}
      {grand && (
        <div className="adv-row adv-muted">
          <span>{i18next.t("advent.grand-row", { place: grand.place })}</span>
          <span>
            {i18next.t("advent.points-n", { n: fmt(grand.amount) })} · {status(grand.status)}
          </span>
        </div>
      )}
    </div>
  );
}

function GrandCard({ grand, me }: { grand: GrandDraw; me?: SeasonState["me"] }) {
  const total = grand.amounts.reduce((s, n) => s + n, 0);
  const when = new Date(grand.drawAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="adv-card" data-testid="advent-grand">
      <div className="adv-row">
        <h3>{i18next.t("advent.grand-title")}</h3>
        <span className="adv-pill gold">{i18next.t("advent.points-n", { n: fmt(total) })}</span>
      </div>
      {grand.status === "scheduled" || !grand.winners ? (
        <>
          <span className="adv-muted">{i18next.t("advent.grand-text", { n: grand.minDoors, time: when })}</span>
          {me && (
            <span className={`adv-pill${me.answered >= grand.minDoors ? " green" : ""}`}>
              {i18next.t("advent.grand-progress", { n: Math.min(me.answered, grand.minDoors), of: grand.minDoors })}
            </span>
          )}
        </>
      ) : (
        <div className="adv-winners">
          {grand.winners.map((w) => (
            <div key={w.place} className={`adv-winner${w.account === me?.account ? " you" : ""}${w.cancelled ? " cancelled" : ""}`}>
              <span className="adv-orn" style={{ "--c": ["#d9a21f", "#8f9bab", "#b4683a"][w.place - 1] ?? "#b4683a" } as React.CSSProperties}>
                {w.place}
              </span>
              <span className="name">@{w.account}</span>
              {grand.amounts[w.place - 1] !== undefined && (
                <span className="adv-pill">{i18next.t("advent.points-n", { n: fmt(grand.amounts[w.place - 1]) })}</span>
              )}
            </div>
          ))}
          {grand.seedBlock != null && (
            <span className="adv-muted">
              {i18next.t("advent.seed-block")}{" "}
              <a href={`https://hiveblocks.com/b/${grand.seedBlock}`} target="_blank" rel="noopener noreferrer">
                {fmt(grand.seedBlock)}
              </a>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AdventCalendar() {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username ?? null;
  const toggleUiProp = useGlobalStore((s) => s.toggleUiProp);
  const { status, signNow, lost } = useAdventSession(username);
  const clock = useNow();
  const now = clock ?? 0;
  const phase = clock === null ? "hidden" : adventPhase(now);
  const today = clock === null ? null : todayDoor(now);
  const [snow, toggleSnow] = useSnowSwitch();
  const queryClient = useQueryClient();
  const ready = status === "ready";
  const queryKey = useMemo(() => AdventQueryKeys.season(ready ? username : null), [ready, username]);

  const { data, isError, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const token = loadSession()?.token;
      try {
        return await adventApi.season(ADVENT_SEASON);
      } catch (e) {
        // the server no longer takes this session: sign in again rather than show a locked calendar
        if (e instanceof AdventError && e.status === 401) lost(token);
        throw e;
      }
    },
    enabled: phase !== "hidden" && status !== "signing",
    refetchInterval: 60_000
  });
  const { data: grand } = useQuery({
    queryKey: AdventQueryKeys.grand(),
    queryFn: () => adventApi.grand(ADVENT_SEASON),
    enabled: phase === "season",
    retry: false,
    refetchInterval: 300_000
  });
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: AdventQueryKeys.seasonAll() }), [queryClient]);
  // signed in: load the reader's own part now, not at the next minute
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  // only the page's own reader: another tab may have swapped the shared session
  const me = ready && data?.me?.account === username ? data.me : undefined;
  const signedIn = !!me;
  const byDay = useMemo(() => new Map((data?.doors ?? []).map((d) => [d.day, d])), [data]);

  const [sheet, setSheet] = useState<number | null>(null);
  const [swinging, setSwinging] = useState<number | null>(null);
  const swingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(swingTimer.current), []);
  // a door open for one account is never left open for the next
  useEffect(() => {
    clearTimeout(swingTimer.current);
    setSwinging(null);
    setSheet(null);
  }, [username]);

  const login = () => toggleUiProp("login");

  // who may open a door: a reader with a game session; others are asked to log in or sign once
  const openDoor = (day: number) => {
    const door = byDay.get(day);
    if (!door) return;
    const answering = door.status === "open" || door.status === "closed";
    if (answering && !username) return login();
    if (answering && status === "sign") return void signNow();
    if (answering && !ready) return;
    clearTimeout(swingTimer.current);
    if (door.status === "open" && !me?.doors[day]?.answered && !reducedMotion()) {
      setSwinging(day);
      swingTimer.current = setTimeout(() => {
        setSwinging(null);
        setSheet(day);
      }, 430);
      return;
    }
    setSheet(day);
  };

  // before the browser has said what day it is: the header only
  if (clock === null) {
    return (
      <div className="advent advent-page">
        <Sky className="adv-hero" scene snow={false}>
          <div className="adv-hero-row">
            <div>
              <div className="adv-kicker">{i18next.t("advent.kicker", { year: ADVENT_SEASON })}</div>
              <h1 className="adv-title">{i18next.t("advent.title")}</h1>
            </div>
          </div>
        </Sky>
      </div>
    );
  }

  // the season ended while the page was open: no doors, no sheet
  if (phase === "hidden") {
    return (
      <div className="advent advent-page">
        <Sky className="adv-hero" scene snow={snow}>
          <div className="adv-hero-row">
            <div>
              <div className="adv-kicker">{i18next.t("advent.kicker", { year: ADVENT_SEASON })}</div>
              <h1 className="adv-title">{i18next.t("advent.season-over")}</h1>
            </div>
          </div>
        </Sky>
      </div>
    );
  }

  const heroTitle =
    phase === "teaser"
      ? i18next.t("advent.teaser-title")
      : today
        ? i18next.t("advent.door-open", { day: today })
        : now < ADVENT_FIRST_DOOR + ADVENT_DOORS * 864e5 + 2 * 36e5
          ? i18next.t("advent.last-draw")
          : i18next.t("advent.season-over");

  const controls = (
    <div className="adv-controls">
      <Toggle on={snow} label={i18next.t("advent.snow")} onClick={toggleSnow} />
    </div>
  );

  let side: React.ReactNode;
  if (phase === "teaser") {
    side = (
      <div className="adv-hero-side">
        <Countdown to={ADVENT_FIRST_DOOR} now={now} />
        <span className="adv-local">
          {i18next.t("advent.first-door-at", {
            time: new Date(ADVENT_FIRST_DOOR).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
          })}
        </span>
        {controls}
      </div>
    );
  } else if (!username) {
    side = (
      <div className="adv-hero-side">
        <button type="button" className="adv-btn gold" onClick={login}>
          {i18next.t("advent.login-to-open")}
        </button>
        <span className="adv-local">{i18next.t("advent.new-to-hive")}</span>
        {controls}
      </div>
    );
  } else {
    side = (
      <div className="adv-hero-side">
        {me && (
          <div className="adv-stats">
            <div className="adv-stat">
              <div className="v">
                {me.answered} / {ADVENT_DOORS}
              </div>
              <div className="k">{i18next.t("advent.doors-answered")}</div>
            </div>
            {data?.pool && (
              <div className="adv-stat">
                <div className="v">{fmt(data.pool.left)}</div>
                <div className="k">{i18next.t("advent.pool-left")}</div>
              </div>
            )}
          </div>
        )}
        {status === "sign" && (
          <button type="button" className="adv-btn gold" onClick={() => void signNow()}>
            {i18next.t("advent.sign-once")}
          </button>
        )}
        {status === "failed" && (
          <button type="button" className="adv-btn gold" onClick={() => void signNow()}>
            {i18next.t("advent.sign-retry")}
          </button>
        )}
        {controls}
      </div>
    );
  }

  const open = sheet !== null ? byDay.get(sheet) : undefined;

  return (
    <div className="advent advent-page">
      <Sky className="adv-hero" scene snow={snow}>
        <div className="adv-hero-row">
          <div>
            <div className="adv-kicker">
              <UilStar className="size-3.5" aria-hidden />
              {i18next.t("advent.kicker", { year: ADVENT_SEASON })}
            </div>
            <h1 className="adv-title">{heroTitle}</h1>
            <p className="adv-lede">{i18next.t("advent.lede")}</p>
          </div>
          {side}
        </div>
      </Sky>
      <div className="adv-body">
        {phase === "teaser" && <Teaser />}
        {isError && !data && (
          <div className="adv-card" role="alert">
            <div className="adv-row">
              <span className="adv-muted">{i18next.t("advent.calendar-failed")}</span>
              <button type="button" className="adv-btn ghost" onClick={() => void refetch()}>
                {i18next.t("advent.try-again")}
              </button>
            </div>
          </div>
        )}
        <div className="adv-grid">
          {Array.from({ length: ADVENT_DOORS }, (_, i) => {
            const day = i + 1;
            const door = byDay.get(day);
            const view: DoorView =
              phase === "teaser" || !door ? { look: "locked" } : doorView(door, me?.doors[day], signedIn || (!!username && ready));
            return <DoorTile key={day} day={day} door={door} view={view} swinging={swinging === day} onOpen={openDoor} />;
          })}
        </div>
        {phase === "season" && <Legend />}
        {grand && <GrandCard grand={grand} me={me} />}
        {me && <MyPrizes me={me} />}
      </div>
      {open && (
        <DoorSheet
          key={`${username ?? ""}:${open.day}`}
          door={open}
          me={me?.doors[open.day]}
          account={me?.account ?? (ready ? username : null)}
          canAnswer={ready}
          snow={snow}
          onClose={() => setSheet(null)}
          onChanged={refresh}
          onSessionLost={(token) => {
            setSheet(null);
            lost(token);
          }}
        />
      )}
    </div>
  );
}
