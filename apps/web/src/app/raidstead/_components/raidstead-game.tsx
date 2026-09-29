"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import i18next from "i18next";
import {
  createScene,
  type AttackType,
  type BuildingId,
  type Community,
  type PowerId,
  type Scene,
  type State,
  type TapTarget,
  type View
} from "@ecency/raidstead";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { useHydrated } from "@/api/queries";
import { LoginDialog } from "@/features/shared/login";
import { usePublishHandoffWriter } from "@/app/publish/_hooks";
import { hasAnyHiveExtension } from "@/utils/hive-extensions";
import * as ls from "@/utils/local-storage";
import {
  clearSession,
  loadSession,
  raidsteadApi,
  saveSession,
  signIn,
  signerFor,
  signOut
} from "@/features/raidstead/client";
import { pendingSpendKey, settleSpend } from "@/features/raidstead/spends";
import {
  aimOf,
  attackMessage,
  buildReport,
  errorMessage,
  impactOf,
  worldOf
} from "@/features/raidstead/game";
import {
  BoardSheet,
  BossSheet,
  BuildingSheet,
  HelpSheet,
  InfoSheet,
  LeaderboardSheet,
  MenuSheet,
  PickSheet,
  ProfileSheet,
  QuestsSheet,
  Raiders,
  ReportSheet,
  SignInSheet,
  type MenuItem
} from "./sheets";

/// The Ecency login as every tab sees it (this tab's store copy only
/// follows it on a reload, or through the storage listener below).
const liveEcencyUser = (): string | null => {
  const u = ls.get("active_user");
  return typeof u === "string" && u ? u : null;
};
const t = (key: string, values?: Record<string, unknown>) => i18next.t(`raidstead.${key}`, values);
const TYPES: { type: AttackType; hero: string; color: string }[] = [
  { type: "ink", hero: "scribe", color: "var(--rs-scribe)" },
  { type: "signal", hero: "scout", color: "var(--rs-scout)" },
  { type: "forge", hero: "smith", color: "var(--rs-smith)" }
];
const SEEN_KEY = "raidstead_seen_week";

type SheetState =
  | { kind: "boss" }
  | { kind: "building"; id: BuildingId | "homes" }
  | { kind: "quests" }
  | { kind: "menu" }
  | { kind: MenuItem };

export function RaidsteadGame() {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username ?? null;
  const hydrated = useHydrated();
  const toggleUiProp = useGlobalStore((s) => s.toggleUiProp);
  const router = useRouter();
  const stageForPublish = usePublishHandoffWriter();

  const worldRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [data, setData] = useState<State | null>(null);
  const [phase, setPhase] = useState<"loading" | "signin" | "ready" | "failed">("loading");
  const [view, setView] = useState<View>("raid");
  const [selected, setSelected] = useState<AttackType>("ink");
  const [toast, setToast] = useState("");
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const sideRef = useRef<0 | 1>(0);
  const lastAttackRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [boot, setBoot] = useState(0);
  const [dayTick, setDayTick] = useState(0);
  const rebootAt = useRef(0);
  // the Ecency user right now, for callbacks that awaited a wallet or a request
  const userRef = useRef(username);
  userRef.current = username;
  // state answers apply in the order they were asked, and only for the
  // session that asked
  const refreshSeq = useRef(0);
  const appliedSeq = useRef(0);
  const dataRef = useRef<State | null>(null);
  // set when refresh met a 401 and has already decided what comes next
  const unauthorized = useRef(false);
  dataRef.current = data;
  const loginOpen = useGlobalStore((s) => s.login);

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);

  const refresh = useCallback(async (): Promise<State | null> => {
    const seq = ++refreshSeq.current;
    const token = loadSession()?.token;
    unauthorized.current = false;
    try {
      const s = await raidsteadApi.state();
      // another account signed in meanwhile: not its state
      if (loadSession()?.token !== token) return null;
      // a newer answer already came back (answers can overtake each other)
      if (seq < appliedSeq.current) return dataRef.current;
      appliedSeq.current = seq;
      dataRef.current = s;
      setData(s);
      return s;
    } catch (e) {
      if (loadSession()?.token !== token) return null;
      if ((e as { status?: number }).status === 401) {
        unauthorized.current = true;
        clearSession();
        setData(null);
        // the game session ended (expired or revoked): boot again, which signs
        // key users back in silently; at most once a minute, so a server that
        // keeps refusing cannot loop
        if (Date.now() - rebootAt.current > 60_000) {
          rebootAt.current = Date.now();
          setPhase("loading");
          setBoot((n) => n + 1);
        } else {
          setPhase("signin");
        }
      } else {
        say(errorMessage(e, i18next.t));
      }
      return null;
    }
  }, [say]);

  // ---------- the scene ----------
  const tapRef = useRef<(target: TapTarget) => void>(() => undefined);
  useEffect(() => {
    const host = worldRef.current;
    if (!host) return;
    const scene = createScene(host, { onTap: (target) => tapRef.current(target) });
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
    };
  }, []);

  // the world lays out in the space the HUD leaves free
  useEffect(() => {
    const slot = slotRef.current,
      host = worldRef.current;
    if (!slot || !host || typeof ResizeObserver !== "function") return;
    const measure = () => {
      const s = slot.getBoundingClientRect(),
        h = host.getBoundingClientRect();
      sceneRef.current?.setSlot({
        left: s.left - h.left,
        top: s.top - h.top,
        width: s.width,
        height: s.height
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(slot);
    ro.observe(host);
    measure();
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(worldOf(data, view));
  }, [data, view]);

  // ---------- signing in ----------
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      let session = loadSession();
      // logging out of Ecency (here or on any other page) ends the game
      // session made for that login, and a session for someone else than the
      // Ecency user on this page is not used
      const loggedOut = !username && !!session?.ecency;
      if (session && (loggedOut || (username && session.account !== username))) {
        // revoke it on games-api too (signOut reads the token before clearSession removes it)
        raidsteadApi.signOut().catch(() => undefined);
        clearSession();
        session = null;
        setData(null);
      }
      // a guest session whose account has now logged in to Ecency ends with that login
      if (session && username && !session.ecency) {
        session = { ...session, ecency: true };
        saveSession(session);
      }
      if (!session) {
        if (username && signerFor(username) === "key") {
          try {
            const signed = await signIn(username, "key", true);
            if (cancelled) return;
            // Ecency logged out or switched in another tab meanwhile
            if (liveEcencyUser() !== username) {
              setPhase("signin");
              return;
            }
            saveSession(signed);
          } catch {
            if (!cancelled) setPhase("signin");
            return;
          }
        } else {
          if (!cancelled) setPhase("signin");
          return;
        }
      }
      if (cancelled) return;
      const token = loadSession()?.token;
      const s = await refresh();
      if (cancelled) return;
      const now = loadSession();
      if (s) setPhase("ready");
      // a 401: refresh has signed in again or shown the sign-in, at most once a minute
      else if (unauthorized.current) return;
      // the session changed meanwhile (another tab): start over with the new one
      else if (now?.token !== token) setBoot((n) => n + 1);
      // the server could not be reached
      else setPhase("failed");
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, username, refresh, boot]);

  // Ecency's login is shared by every tab, but this tab's copy of it only
  // changes on a reload. A logout or account switch in another tab ends the
  // game session made for the old login here too, and so does a game session
  // ended in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key !== null &&
        e.key !== `${ls.PREFIX}_active_user` &&
        !e.key.startsWith(`${ls.PREFIX}_raidstead_session`)
      )
        return;
      // bring this tab's Ecency login in line; the account change is then
      // handled like any other (session revoked, sign-in offered for the new one)
      const live = liveEcencyUser();
      if (live !== userRef.current) useGlobalStore.getState().setActiveUser(live);
      const session = loadSession();
      if (session?.ecency && live !== session.account) {
        raidsteadApi.signOut().catch(() => undefined);
        clearSession();
      }
      if (!loadSession() && dataRef.current) {
        dataRef.current = null;
        setData(null);
        setSheet(null);
        setPhase("signin");
      }
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);

  const onSign = useCallback(
    async (account: string) => {
      const asUser = userRef.current;
      setSigning(true);
      try {
        const session = await signIn(account, signerFor(account) ?? "extension", !!asUser);
        // the Ecency user may have logged in, out or switched while the wallet
        // was asking: that answer is not for this page any more
        if (userRef.current !== asUser) return;
        if (asUser && liveEcencyUser() !== asUser) return;
        if (asUser && session.account !== asUser) return;
        saveSession(session);
        const s = await refresh();
        if (s) setPhase("ready");
      } catch {
        say(t("signin.failed"));
      } finally {
        setSigning(false);
      }
    },
    [refresh, say]
  );

  // ---------- the week's card, once per week ----------
  const alliance = data?.alliance ?? null;
  const member = data?.member ?? null;
  const boss = alliance?.boss ?? null;
  useEffect(() => {
    if (!data || !alliance || phase !== "ready") return;
    const key = `${data.calendar.season}-${alliance.week}`;
    if (ls.get(SEEN_KEY) === key) return;
    ls.set(SEEN_KEY, key);
    setSheet({ kind: "boss" });
    // only when the week changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, data?.calendar.season, alliance?.week]);

  // the Copycat Queen's reshuffle countdown: once it runs out, ask the server
  // every 2s until it has reshuffled (a client clock ahead of the server
  // would otherwise ask too early and never ask again)
  useEffect(() => {
    if (!boss?.reshuffleAt) return;
    let lastPoll = 0;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n < boss.reshuffleAt! || n - lastPoll < 2000) return;
      lastPoll = n;
      refresh().then((s) => {
        if (s?.alliance && !s.alliance.boss.reshuffleAt) say(t("toast.queen-shuffled"));
      });
    }, 500);
    return () => clearInterval(id);
  }, [boss?.reshuffleAt, refresh, say]);

  // a new game day (energy, quests, the boss) starts at 00:00 UTC: ask for it
  // then, a little spread out, and again every 30s while the server still
  // answers with the old day (a client clock ahead of the server)
  const nextDayAt = data?.calendar.nextDayAt;
  useEffect(() => {
    if (phase !== "ready" || !nextDayAt) return;
    const due = Date.parse(nextDayAt);
    const wait = Math.max(due - Date.now() + 2000 + Math.random() * 20_000, 30_000);
    // re-armed after every try, answered or not, so a failed request at
    // midnight is asked again 30s later
    const id = setTimeout(() => refresh().finally(() => setDayTick((n) => n + 1)), wait);
    // a background tab's timers are held back: catch up when it shows again
    const onVisible = () => {
      if (!document.hidden && Date.now() > due) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, nextDayAt, data, dayTick, refresh]);

  // ---------- actions ----------
  const act = useCallback(
    async <T,>(fn: () => Promise<T>, after?: (r: T) => void) => {
      setBusy(true);
      try {
        const r = await fn();
        after?.(r);
        await refresh();
        return r;
      } catch (e) {
        say(errorMessage(e, i18next.t));
        // the action may have happened even though the answer was lost
        refresh();
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh, say]
  );

  const attack = useCallback(
    async (type: AttackType, side?: 0 | 1) => {
      if (!alliance || !member || !boss) return;
      if (!boss.alive) return say(t("toast.resting"));
      if (member.energy <= 0)
        return say(member.rallied ? t("toast.no-energy-rallied") : t("toast.no-energy"));
      const n = Date.now();
      if (n - lastAttackRef.current < 450) return;
      lastAttackRef.current = n;
      setSelected(type);
      let s: 0 | 1 = side ?? 0;
      if (side === undefined && boss.kind === "twins") {
        s = sideRef.current;
        sideRef.current = s ? 0 : 1;
      }
      const shot = sceneRef.current?.attack(type, aimOf(data), s);
      setData((d) =>
        d?.member ? { ...d, member: { ...d.member, energy: d.member.energy - 1 } } : d
      );
      try {
        const r = await raidsteadApi.attack(type, s);
        shot?.resolve(impactOf(r));
        say(attackMessage(r, type, i18next.t));
      } catch (e) {
        shot?.resolve({ kind: "miss" });
        say(errorMessage(e, i18next.t));
      }
      refresh();
    },
    [alliance, member, boss, data, refresh, say]
  );

  tapRef.current = (target) => {
    if (target.kind === "building") {
      if (alliance) setSheet({ kind: "building", id: target.id });
      return;
    }
    if (phase !== "ready" || sheet) return;
    attack(selected, target.kind === "boss" ? target.side : undefined);
  };

  const scout = () =>
    act(
      () => raidsteadApi.scout(),
      (r) => {
        const type = t(`types.${r.weakness}`);
        const lines = [
          t(boss?.kind === "queen" ? "toast.scouted-queen" : "toast.scouted", { type })
        ];
        if (r.tomorrow) lines.push(t("toast.tomorrow", { type: t(`types.${r.tomorrow}`) }));
        say(lines.join(" "));
        sceneRef.current?.cheer("scout");
      }
    );
  // A spend keeps its key until the server has answered, across a reload
  // too; only a request that never got an answer (offline) retries with the
  // same key, which games-api answers "already applied" if it went through.
  const spend =
    <R,>(which: "rally" | "chest", fn: (key: string) => Promise<R>) =>
    async () => {
      const account = loadSession()?.account ?? "";
      const key = pendingSpendKey(account, which, dataRef.current?.calendar.season ?? 0);
      try {
        const r = await fn(key);
        settleSpend(account, which);
        return r;
      } catch (e) {
        // no answer (offline), or a gateway's instead of games-api's (5xx): the
        // spend may have gone through, so the retry keeps the key
        const status = (e as { status?: number }).status ?? 0;
        if (status !== 0 && status < 500) settleSpend(account, which);
        throw e;
      }
    };
  const rally = () =>
    act(
      spend("rally", (k) => raidsteadApi.rally(k)),
      () => {
        say(t("toast.rally"));
        sceneRef.current?.cheer("herald");
      }
    );
  const donate = () =>
    act(
      spend("chest", (k) => raidsteadApi.chest(k)),
      (r) => say(r.applied.filled ? t("toast.chest-full") : t("toast.donated"))
    );
  const claimQuests = () =>
    act(
      () => raidsteadApi.quests(),
      (r) =>
        say(r.claimed.length ? t("toast.quests", { n: r.claimed.length }) : t("toast.quests-none"))
    );
  const build = (id: BuildingId) =>
    act(
      () => raidsteadApi.build(id),
      (r) => {
        const name = t(`town.buildings.${id}.name`);
        say(
          r.finished
            ? t("toast.finished", { name })
            : t("toast.built", { name, stage: t(`town.stages.${r.stage}`).toLowerCase() })
        );
      }
    );
  const talk = () =>
    act(
      () => raidsteadApi.talk(),
      (r) => say(r.cleared ? t("toast.cleared") : t("toast.talked"))
    );
  const power = (p: PowerId, action: "craft" | "equip" | "unequip") =>
    act(() => raidsteadApi.powers(p, action));
  const join = (c: Community) => act(() => raidsteadApi.join(c.name));
  const loadCommunities = useCallback(
    async () => (await raidsteadApi.communities()).communities,
    []
  );
  const loadLeaders = useCallback(async () => (await raidsteadApi.leaderboard()).alliances, []);

  const openReport = () => {
    if (!data || !alliance) return;
    const report = buildReport(data, i18next.t);
    if (!report) return;
    stageForPublish(report.body, report.title);
    router.push(`/publish?com=${encodeURIComponent(alliance.community)}`);
  };

  const doSignOut = async () => {
    setSheet(null);
    await signOut().catch(() => undefined);
    setData(null);
    setPhase("signin");
  };

  // keys 1, 2, 3 attack while nothing else has focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== "raid" || sheet || phase !== "ready") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("button, input, textarea, select")) return;
      const type = ({ "1": "ink", "2": "signal", "3": "forge" } as Record<string, AttackType>)[
        e.key
      ];
      if (type) attack(type);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [view, sheet, phase, attack]);

  // ---------- what the HUD shows ----------
  const cal = data?.calendar;
  const dayLabel =
    cal && cal.season > 0 ? t("season.day", { day: Math.min(cal.day, 28), total: 28 }) : "";
  const energy = member?.energy ?? 0;
  const maxEnergy = member?.maxEnergy ?? 15;
  const alive = !!boss?.alive;
  const pct = boss ? Math.ceil((boss.hp / boss.maxHp) * 100) : 100;
  const reshuffleIn = boss?.reshuffleAt
    ? Math.max(0, Math.ceil((boss.reshuffleAt - now) / 1000))
    : 0;
  const scoutSub = !alive
    ? ""
    : boss?.weakness
      ? t("actions.scout-found")
      : member?.scoutsLeft === -1
        ? t("actions.scout-any")
        : (member?.scoutsLeft ?? 0) <= 0
          ? t("actions.scout-used")
          : (member?.scoutsLeft ?? 0) > 1
            ? t("actions.scout-left", { n: member?.scoutsLeft })
            : t("actions.scout-free");
  const questsLeft = 3 - (member?.quests.length ?? 0);
  const playing = phase === "ready" && !!alliance && !!member;
  const resting = !!cal?.resting;

  // which blocking sheet, if any, comes before the game
  let gate: ReactElement | null = null;
  // While Ecency's login dialog is open the sign-in sheet steps aside: an open
  // modal <dialog> makes the rest of the page inert, that dialog included.
  if (phase === "signin" && !loginOpen) {
    gate = (
      <SignInSheet
        username={username}
        canSign={!!username && signerFor(username) !== null}
        silent={!!username && signerFor(username) === "key"}
        hasWallet={hasAnyHiveExtension()}
        signing={signing}
        onSign={onSign}
        onLogin={() => toggleUiProp("login")}
      />
    );
  } else if (phase === "failed") {
    gate = (
      <InfoSheet
        closable={false}
        onClose={() => undefined}
        title={t("title")}
        lines={[t("errors.load-failed")]}
        action={{
          label: i18next.t("g.try-again"),
          onClick: () => {
            setPhase("loading");
            setBoot((n) => n + 1);
          }
        }}
      />
    );
  } else if (phase === "ready" && data && cal && cal.season < 1) {
    gate = (
      <InfoSheet
        closable={false}
        onClose={() => undefined}
        title={t("title")}
        lines={[
          t("season.not-started", { date: new Date(cal.startsAt).toLocaleDateString() }),
          t("season.not-started-hint")
        ]}
      />
    );
  } else if (phase === "ready" && data && !alliance && resting) {
    const next = new Date(Date.parse(cal!.startsAt) + 30 * 86_400_000).toLocaleDateString();
    gate = (
      <InfoSheet
        closable={false}
        onClose={() => undefined}
        title={t("title")}
        lines={[t("season.resting", { n: cal!.season, date: next })]}
      />
    );
  } else if (phase === "ready" && data && !alliance) {
    gate = <PickSheet load={loadCommunities} onJoin={join} busy={busy} />;
  }

  const close = () => setSheet(null);
  let open: ReactElement | null = null;
  if (!gate && sheet && data) {
    switch (sheet.kind) {
      case "boss":
        open = alliance ? <BossSheet state={data} onClose={close} /> : null;
        break;
      case "building":
        open = alliance ? (
          <BuildingSheet
            id={sheet.id}
            state={data}
            busy={busy}
            onClose={close}
            onBuild={build}
            onTalk={talk}
            onPower={power}
          />
        ) : null;
        break;
      case "quests":
        open = alliance ? (
          <QuestsSheet
            state={data}
            busy={busy}
            onClose={close}
            onClaim={claimQuests}
            onDonate={donate}
          />
        ) : null;
        break;
      case "menu":
        open = (
          <MenuSheet
            state={data}
            onClose={close}
            onPick={(m) => setSheet({ kind: m })}
            onSignOut={doSignOut}
          />
        );
        break;
      case "profile":
        open = <ProfileSheet state={data} onClose={close} />;
        break;
      case "board":
        open = <BoardSheet state={data} onClose={close} />;
        break;
      case "leaderboard":
        open = (
          <LeaderboardSheet
            season={Math.max(1, data.calendar.season)}
            load={loadLeaders}
            onClose={close}
          />
        );
        break;
      case "help":
        open = <HelpSheet onClose={close} />;
        break;
      case "report": {
        const report = buildReport(data, i18next.t);
        open = report ? <ReportSheet report={report} onClose={close} onOpen={openReport} /> : null;
        break;
      }
    }
  }

  return (
    <div className={`raidstead${view === "town" ? " is-town" : ""}`}>
      <div className="rs-world" ref={worldRef} />
      <div className="rs-hud">
        <header className="rs-top">
          <button
            className="rs-card rs-chip rs-ally"
            onClick={() => alliance && setSheet({ kind: "boss" })}
          >
            <i className="rs-banner" aria-hidden="true" />
            <span>
              <small>{t("alliance.label")}</small>
              <b>{alliance?.title ?? t("alliance.pick")}</b>
            </span>
          </button>
          <div className="rs-top-right">
            {cal && cal.season > 0 && (
              <div className="rs-card rs-chip">
                <span>
                  <small>{t("season.label", { n: cal.season })}</small>
                  <b>{resting ? t("season.resting-short") : dayLabel}</b>
                </span>
              </div>
            )}
            {member && (
              <div className="rs-card rs-chip">
                <span>
                  <small>{t("energy.label")}</small>
                  <b>{t("energy.value", { n: energy, max: maxEnergy })}</b>
                </span>
                <span className="rs-pips" aria-hidden="true">
                  {Array.from({ length: maxEnergy }, (_, i) => (
                    <i key={i} className={i < energy ? "on" : undefined} />
                  ))}
                </span>
              </div>
            )}
          </div>
        </header>

        {playing && view === "raid" && boss && (
          <section className="rs-card rs-plate" aria-label={t(`bosses.${boss.kind}.name`)}>
            <div className="rs-row">
              <button
                className="rs-plate-name"
                aria-label={t("boss.about")}
                onClick={() => setSheet({ kind: "boss" })}
              >
                {t(`bosses.${boss.kind}.name`)}
              </button>
              <small>
                {alive
                  ? [
                      t("boss.phase", { week: alliance!.week, phase: boss.phase }),
                      boss.gnats ? t("boss.gnats", { n: boss.gnats }) : "",
                      boss.waspHp ? t("boss.wasp") : ""
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : t("boss.chased", { week: alliance!.week })}
              </small>
            </div>
            <div
              className="rs-hpbar"
              role="meter"
              aria-label={t("boss.hp", { hp: boss.hp, max: boss.maxHp })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={alive ? pct : 0}
            >
              <span style={{ width: `${alive ? (boss.hp / boss.maxHp) * 100 : 0}%` }} />
            </div>
            <div className="rs-row">
              <span>{alive ? t("boss.hp", { hp: boss.hp, max: boss.maxHp }) : t("boss.next")}</span>
              {alive && (
                <span className={`rs-weak${boss.weakness ? " known" : ""}`}>
                  {boss.weakness
                    ? t("boss.weak-known", { type: t(`types.${boss.weakness}`) })
                    : t("boss.weak-unknown")}
                  {boss.weakness && reshuffleIn > 0
                    ? ` · ${t("boss.reshuffle", { s: reshuffleIn })}`
                    : ""}
                </span>
              )}
            </div>
          </section>
        )}

        {playing && view === "town" && (
          <section className="rs-card rs-plate" aria-label={t("actions.town")}>
            <div className="rs-row">
              <span className="rs-plate-name">{t("town.plate", { name: alliance!.title })}</span>
              <small>{t("town.hall", { n: alliance!.town.hall })}</small>
            </div>
            <div className="rs-row">
              <span>
                <b>{t("town.materials", { n: alliance!.mats })}</b>
              </span>
              <span className="rs-muted">{alliance!.web ? t("town.spider") : t("town.hint")}</span>
            </div>
          </section>
        )}

        <div className="rs-slot" ref={slotRef} />

        {playing && (
          <aside className="rs-card rs-board" aria-label={t("board.title")}>
            <h2>{t("board.title")}</h2>
            <Raiders state={data!} />
          </aside>
        )}

        {playing && (
          <footer className="rs-actions">
            <p className="rs-toast" aria-live="polite">
              {toast}
            </p>
            {view === "raid" && (
              <div className="rs-attacks">
                {TYPES.map(({ type, hero, color }) => (
                  <button
                    key={type}
                    className="rs-atk"
                    style={{ ["--c" as string]: color }}
                    aria-pressed={selected === type}
                    disabled={!alive || energy <= 0 || resting}
                    onClick={() => attack(type)}
                  >
                    <b>{t(`types.${type}`)}</b>
                    <small>
                      {!alive || resting
                        ? t("actions.resting")
                        : energy <= 0
                          ? t("actions.no-energy")
                          : t("actions.cost", { hero: t(`heroes.${hero}`) })}
                    </small>
                  </button>
                ))}
              </div>
            )}
            <div className="rs-secondary">
              {view === "raid" && (
                <button
                  className="rs-sec"
                  disabled={busy || !alive || !!boss?.weakness || member!.scoutsLeft === 0}
                  onClick={scout}
                >
                  {t("actions.scout")}
                  <small>{scoutSub}</small>
                </button>
              )}
              {view === "raid" && (
                <button
                  className="rs-sec"
                  disabled={busy || member!.rallied || resting}
                  onClick={rally}
                >
                  {t("actions.rally")}
                  <small>
                    {member!.rallied ? t("actions.rally-used") : t("actions.rally-cost")}
                  </small>
                </button>
              )}
              <button
                className="rs-sec"
                aria-haspopup="dialog"
                onClick={() => setSheet({ kind: "quests" })}
              >
                {t("actions.quests")}
                <small>
                  {questsLeft > 0
                    ? t("actions.quests-left", { n: questsLeft })
                    : t("actions.quests-done")}
                </small>
              </button>
              <button
                className="rs-sec"
                aria-haspopup="dialog"
                onClick={() => setSheet({ kind: "menu" })}
              >
                {t("actions.menu")}
                <small>
                  {cal && cal.season > 0
                    ? t("season.day-short", { day: Math.min(cal.day, 28) })
                    : ""}
                </small>
              </button>
            </div>
            <nav className="rs-tabs" aria-label={t("actions.views")}>
              <button aria-pressed={view === "raid"} onClick={() => setView("raid")}>
                {t("actions.raid")}
              </button>
              <button aria-pressed={view === "town"} onClick={() => setView("town")}>
                {t("actions.town")}
              </button>
            </nav>
          </footer>
        )}
      </div>
      {gate ?? open}
      <LoginDialog />
    </div>
  );
}
