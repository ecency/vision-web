"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import i18next from "i18next";
import {
  createScene,
  FOLK,
  type AttackType,
  type BuildingId,
  type Calendar,
  type Community,
  type FolkClass,
  type Note,
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
  laterMark,
  markOf,
  newsAfter,
  noteId,
  noteText,
  pickNeighbors,
  type NewsMark,
  rallyBlock,
  twinSide,
  type Neighbor,
  errorMessage,
  impactOf,
  worldOf
} from "@/features/raidstead/game";
import {
  BoardSheet,
  BossSheet,
  BuildingSheet,
  HeroSheet,
  TownSheet,
  InfoSheet,
  LeaderboardSheet,
  MenuSheet,
  NewsSheet,
  PickSheet,
  ProfileSheet,
  QuestsSheet,
  Raiders,
  ReportSheet,
  SignInSheet,
  type MenuItem
} from "./sheets";
import { SeasonCountdown } from "./season-countdown";
import { FieldGuideSheet } from "./field-guide";

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
// how far each account has read its alliance's town news this season
const NEWS_KEY = "raidstead_news";
// How often the page asks again while it shows: allies' hits, a kill, the town's
// news. Slower once the week's pest is gone and only the town changes.
const POLL_MS = 20_000;
const POLL_IDLE_MS = 60_000;

type SheetState =
  | { kind: "boss" }
  | { kind: "building"; id: BuildingId | "homes" }
  | { kind: "hero"; hero: FolkClass }
  | { kind: "town"; town: Neighbor }
  | { kind: "quests" }
  | { kind: "menu" }
  | { kind: "news"; notes: Note[]; away: boolean }
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
  // a line of town news, told next to the toast: an attack's own message does not replace it
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  // the sheet as effects of the same commit see it (one of them may just have opened it)
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  // The last try to sign in did not work: said on the sign-in sheet.
  // "expired": ecency.com no longer takes this login, so trying again is no use.
  const [signFailed, setSignFailed] = useState<"failed" | "expired" | null>(null);
  const whyFailed = (e: unknown) => {
    const { status, code, vouching } = (e ?? {}) as {
      status?: number;
      code?: string;
      vouching?: boolean;
    };
    // ecency.com not set up to vouch is nobody's failure: the sheet then
    // offers what it offered before
    if (code === "not_configured") return null;
    // Only ecency.com's own refusal means the login needs renewing (the games
    // API refuses a signed proof with a 401 too). With a wallet in the
    // browser the next tap asks that instead, so nothing needs renewing.
    return vouching && status === 401 && !hasAnyHiveExtension() ? "expired" : "failed";
  };
  const [now, setNow] = useState(() => Date.now());
  const sideRef = useRef<0 | 1>(0);
  const lastAttackRef = useRef(0);
  const waspAskRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [boot, setBoot] = useState(0);
  // before the first season: the public calendar, so everyone sees the countdown without signing
  // in; the boot waits until it has answered (or a few seconds passed), so no sign-in flashes first
  const [preseason, setPreseason] = useState<Calendar | null>(null);
  const [calendarKnown, setCalendarKnown] = useState(false);
  // the server's clock minus this device's, so a wrong device clock still opens on time
  const [skew, setSkew] = useState(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  // at most one chain of checks at zero at a time
  const opening = useRef(false);
  // bumped whenever the page counts down again, so the countdown starts afresh
  const [countRound, setCountRound] = useState(0);
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
  // the game session the shown state belongs to
  const dataToken = useRef<string | undefined>(undefined);
  // set when refresh met a 401 and has already decided what comes next
  const unauthorized = useRef(false);
  // the server's clock minus this device's, as of the last state: a twin's waiting
  // hit is timed by the server
  const stateSkew = useRef(0);
  dataRef.current = data;
  const loginOpen = useGlobalStore((s) => s.login);

  const say = useCallback((msg: string) => {
    // an answer can come back after the page has closed: nothing to say it to
    if (!mounted.current) return;
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);
  const tell = useCallback((msg: string) => {
    setFlash(msg);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 7000);
  }, []);
  // neither message outlives the page
  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(flashTimer.current);
    },
    []
  );

  // `quiet`: the page's own regular asks say nothing when they fail (the next
  // one tries again); a failure after the player's action is told.
  const refresh = useCallback(
    async (opts?: { quiet?: boolean }): Promise<State | null> => {
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
        dataToken.current = token;
        if (typeof s.now === "number") stateSkew.current = s.now - Date.now();
        setData(s);
        return s;
      } catch (e) {
        if (loadSession()?.token !== token) return null;
        const status = (e as { status?: number }).status;
        // Like an answer, a refusal that is older than what has been applied since
        // is not acted on: if the session has really ended, the next ask says so.
        if (status === 401 && seq < appliedSeq.current) return dataRef.current;
        if (status === 401) {
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
        } else if (opts?.quiet !== true) {
          say(errorMessage(e, i18next.t));
        }
        return null;
      }
    },
    [say]
  );

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

  // other alliances, drawn as towns in the sky of the town view; the list is
  // asked for when the town is opened, at most every 10 minutes
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const neighborsAt = useRef(0);
  // the sky belongs to one alliance in one season
  const ownCommunity = data?.alliance?.community;
  const seasonNo = data?.calendar.season ?? 0;
  const skyKey = ownCommunity ? `${seasonNo}:${ownCommunity}` : "";
  const ownRef = useRef(skyKey);
  ownRef.current = skyKey;
  // another alliance of one's own (new account, new season): a new sky
  useEffect(() => {
    neighborsAt.current = 0;
    setNeighbors([]);
  }, [skyKey]);
  useEffect(() => {
    if (view !== "town" || phase !== "ready" || !ownCommunity) return;
    if (Date.now() - neighborsAt.current < 600_000) return;
    neighborsAt.current = Date.now();
    // an answer counts only while the alliance and season it was asked for are still ours
    const asked = skyKey;
    const current = () => ownRef.current === asked;
    raidsteadApi
      .leaderboard(seasonNo || undefined)
      .then((r) => {
        if (current()) setNeighbors(pickNeighbors(r.alliances, ownCommunity));
      })
      .catch(() => {
        if (current()) neighborsAt.current = 0; // not now: ask again next time the town opens
      });
  }, [view, phase, ownCommunity, skyKey, seasonNo]);

  useEffect(() => {
    sceneRef.current?.sync({ ...worldOf(data, view), neighbors });
  }, [data, view, neighbors]);

  // ---------- before the season ----------
  useEffect(() => {
    mounted.current = true;
    // past the deadline the usual flow has begun: a late answer must not pull it back
    let late = false;
    const giveUp = setTimeout(() => {
      late = true;
      setCalendarKnown(true);
    }, 4000);
    raidsteadApi
      .calendar()
      .then((c) => {
        if (!mounted.current || late || c.season >= 1) return;
        // this answer may be a cached copy up to a minute old, so its clock only
        // corrects a device that is off by more than that
        if (c.now && Math.abs(c.now - Date.now()) > 60_000) setSkew(c.now - Date.now());
        setPreseason(c);
      })
      // unreachable: the usual flow still says when the season starts, after sign-in
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(giveUp);
        if (mounted.current) setCalendarKnown(true);
      });
    return () => {
      mounted.current = false;
      opening.current = false;
      clearTimeout(giveUp);
      clearTimeout(openTimer.current);
    };
  }, []);

  // the countdown reached zero: the season opens once the server agrees (a clock
  // running ahead asks again every few seconds), and clearing `preseason` boots as usual
  // Pages spread their asks over a few seconds so they do not all arrive at once; if the
  // server keeps failing, the page falls back to the usual flow rather than wait forever.
  const openSeason = useCallback(() => {
    if (opening.current) return;
    opening.current = true;
    let failures = 0;
    const again = () => {
      openTimer.current = setTimeout(check, 5000 + Math.random() * 3000);
    };
    const open = () => {
      opening.current = false;
      // a guide opened from the countdown closes with it, or it would come back once the game loads
      setSheet(null);
      setPreseason(null);
      setPhase("loading");
    };
    const check = () =>
      raidsteadApi
        .calendar(true)
        .then((c) => {
          if (!mounted.current) return;
          if (c.now) setSkew(c.now - Date.now());
          if (c.season >= 1) return open();
          // still more than a second to go by the server's clock (the start was moved
          // later, or this device runs fast): count down again; zero asks anew
          if (Date.parse(c.startsAt) > (c.now ?? Date.now()) + 1000) {
            opening.current = false;
            setCountRound((n) => n + 1);
            setPreseason(c);
          } else again();
        })
        .catch(() => {
          if (!mounted.current) return;
          if (++failures >= 3) open();
          else again();
        });
    openTimer.current = setTimeout(check, Math.random() * 2000);
  }, []);

  // ---------- signing in ----------
  useEffect(() => {
    // before the season there is nothing to sign in for; the countdown shows instead
    if (!hydrated || !calendarKnown || preseason) return;
    let cancelled = false;
    // what an earlier try said was said for another user or another visit
    setSignFailed(null);
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
        // nor a card that was open for it, or news waiting for one
        setSheet(null);
        setAwayNews(null);
      }
      // a guest session whose account has now logged in to Ecency ends with that login
      if (session && username && !session.ecency) {
        session = { ...session, ecency: true };
        saveSession(session);
      }
      if (!session) {
        // a login that needs no wallet prompt signs in by itself
        const kind = username ? signerFor(username) : null;
        if (username && (kind === "key" || kind === "ecency")) {
          try {
            const signed = await signIn(username, kind, true);
            if (cancelled) return;
            // Ecency logged out or switched in another tab meanwhile
            if (liveEcencyUser() !== username) {
              setPhase("signin");
              return;
            }
            saveSession(signed);
          } catch (e) {
            if (!cancelled) {
              setSignFailed(whyFailed(e));
              setPhase("signin");
            }
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
  }, [hydrated, username, refresh, boot, calendarKnown, preseason]);

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
      // The game session was ended or replaced (another tab signed in as
      // someone else): what this tab shows is not that session's, and its
      // requests would already go out with the new token. Drop it and load
      // again for the new session, or offer the sign-in when there is none.
      const now = loadSession();
      if (dataRef.current && now?.token !== dataToken.current) {
        dataRef.current = null;
        setData(null);
        setSheet(null);
        if (now) {
          setPhase("loading");
          setBoot((n) => n + 1);
        } else {
          setPhase("signin");
        }
      }
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);

  const onSign = useCallback(
    async (account: string) => {
      const asUser = userRef.current;
      setSigning(true);
      // Only the Ecency user of this page signs in with what the browser holds
      // for them. A typed name always goes to the wallet, as its button says:
      // an account that was once logged in here is not there for the taking.
      const kind = asUser && account === asUser ? (signerFor(account) ?? "extension") : "extension";
      try {
        const session = await signIn(account, kind, !!asUser, true);
        // the Ecency user may have logged in, out or switched while the wallet
        // was asking: that answer is not for this page any more
        if (userRef.current !== asUser) return;
        if (asUser && liveEcencyUser() !== asUser) return;
        if (asUser && session.account !== asUser) return;
        saveSession(session);
        setSignFailed(null);
        const s = await refresh();
        if (s) setPhase("ready");
        // signed in, but the game could not be loaded: say so, with a way to try again
        else if (!unauthorized.current) setPhase("failed");
      } catch (e) {
        // the toast is not drawn behind the sign-in sheet: the sheet says it
        setSignFailed(whyFailed(e) ?? "failed");
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
    sheetRef.current = { kind: "boss" };
    // only when the week changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, data?.calendar.season, alliance?.week]);

  // Town news. What happened while the player was away opens as a card, after the
  // week's card if that is due too. One line that arrives while they play, with
  // nothing else open, is told next to the toast; more than one, or a line that
  // arrives behind another card or in a background tab, waits for a card. Their
  // own doing (the last hit, the last gift) was told when it happened. News
  // counts as read once it has been shown, and the mark never moves back.
  const notes = alliance?.notes;
  const me = data?.account.name;
  const newsScope = data && alliance ? `${data.calendar.season}:${alliance.community}:${me}` : "";
  // this page's own copy of the marks: storage shares them between tabs, and may refuse
  const marks = useRef<Record<string, NewsMark>>({});
  const readMark = useCallback((scope: string): NewsMark | null => {
    const mine = marks.current[scope];
    const stored = (ls.get(NEWS_KEY) ?? {})[scope] as unknown;
    const shared = typeof stored === "number" || typeof stored === "string" ? stored : undefined;
    if (shared === undefined) return mine ?? null;
    // numbered marks: the later one, so a tab whose storage refused the write still
    // knows what it has shown; otherwise the shared one, as far as any tab has read
    return typeof mine === "number" && typeof shared === "number" ? Math.max(mine, shared) : shared;
  }, []);
  const writeMark = useCallback(
    (scope: string, mark: NewsMark) => {
      // another tab may have read further between this page's look and now
      const next = laterMark(readMark(scope), mark);
      marks.current[scope] = next;
      // one season's marks are kept: scopes begin with the season
      const season = scope.split(":")[0];
      const stored = (ls.get(NEWS_KEY) ?? {}) as Record<string, unknown>;
      const kept = Object.fromEntries(
        Object.entries(stored).filter(
          ([k, v]) => k.startsWith(`${season}:`) && (typeof v === "number" || typeof v === "string")
        )
      );
      ls.set(NEWS_KEY, { ...kept, [scope]: next });
    },
    [readMark]
  );
  const booted = useRef(false);
  // news waiting for its card: whose it is, the lines, how far they read, and
  // whether the player was away
  const [awayNews, setAwayNews] = useState<{
    scope: string;
    notes: Note[];
    upTo: NewsMark;
    away: boolean;
  } | null>(null);
  const awayRef = useRef(awayNews);
  awayRef.current = awayNews;
  const [tabShown, setTabShown] = useState(() => !document.hidden);
  useEffect(() => {
    const onVisible = () => setTabShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  // Another account, alliance or season: its first state is a return, not news
  // while playing. Declared first, so it runs before the effect below reads it.
  useEffect(() => {
    booted.current = false;
    setAwayNews(null);
  }, [newsScope]);
  useEffect(() => {
    if (phase !== "ready" || !newsScope || !notes) return;
    const mark = readMark(newsScope);
    const first = !booted.current;
    booted.current = true;
    if (mark === null) {
      // The first time this account sees this alliance here (it has just joined,
      // or this is a new device): what is on the list happened before, so the
      // news starts from now.
      writeMark(newsScope, markOf(notes) ?? 0);
      return;
    }
    // Lines already waiting for their card, unless another tab has shown them
    // since. Only this scope's: right after a change of account or alliance the
    // ref still holds the last one's queue (the reset above lands with the next render).
    const queued = awayRef.current?.scope === newsScope ? awayRef.current : null;
    const waiting = queued ? newsAfter(queued.notes, mark) : [];
    const fresh = newsAfter(notes, mark);
    const news = fresh.filter((n) => !n.who || n.who !== me);
    const upTo = markOf(notes);
    if (!news.length) {
      // Nothing new in this answer, or only the player's own doing: that counts
      // as read. Not while lines wait for their card, though: an answer need not
      // repeat them, and a mark moved past them would drop them unread.
      if (fresh.length && upTo !== null && !waiting.length) writeMark(newsScope, upTo);
      return;
    }
    // An answer need not repeat what an earlier one brought (a server that sends
    // news only once): what is waiting stays, the new lines join it.
    const key = (n: Note) => n.seq ?? noteId(n);
    const told = new Set(waiting.map(key));
    const all = [...waiting, ...news.filter((n) => !told.has(key(n)))];
    const nothingElse = !sheetRef.current && !waiting.length && !document.hidden;
    if (!first && all.length === 1 && nothingElse && upTo !== null) {
      writeMark(newsScope, upTo);
      tell(noteText(all[0], i18next.t));
      return;
    }
    setAwayNews({
      scope: newsScope,
      notes: all,
      upTo: upTo ?? queued?.upTo ?? mark,
      away: queued?.away ?? first
    });
  }, [phase, newsScope, notes, me, tell, readMark, writeMark]);
  // the card: once nothing else is open and the tab is in front
  useEffect(() => {
    if (!awayNews || sheet || phase !== "ready" || !tabShown || !newsScope) return;
    // A queue put aside for another account or alliance: this effect still sees it
    // in the render that changes the scope (the reset above lands with the next
    // one). It is left alone, not cleared here: the same commit may have queued
    // this scope's own news.
    if (awayNews.scope !== newsScope) return;
    // another tab may have shown some of it while it waited here
    const mark = readMark(newsScope);
    const left = mark === null ? awayNews.notes : newsAfter(awayNews.notes, mark);
    setAwayNews(null);
    if (!left.length) return;
    writeMark(newsScope, awayNews.upTo);
    setSheet({ kind: "news", notes: left, away: awayNews.away });
  }, [awayNews, sheet, phase, tabShown, newsScope, readMark, writeMark]);

  // Allies raid at the same time: ask for the state again while the page shows.
  // The server answers these without a lock or a write when nothing is due.
  const inAlliance = !!alliance;
  const bossInTown = !!boss?.alive;
  const dayDue = useRef(0);
  useEffect(() => {
    if (phase !== "ready" || !inAlliance) return;
    const every = bossInTown ? POLL_MS : POLL_IDLE_MS;
    let last = Date.now();
    const ask = () => {
      last = Date.now();
      refresh({ quiet: true });
    };
    const id = setInterval(() => {
      if (!document.hidden) ask();
    }, every);
    // A background tab is not asked for; it catches up when it shows again,
    // unless the new day is due: the day's own ask below goes out then.
    const onVisible = () => {
      const newDay = dayDue.current > 0 && Date.now() > dayDue.current;
      if (!document.hidden && Date.now() - last >= every && !newDay) ask();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, inAlliance, bossInTown, refresh]);

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
      refresh({ quiet: true });
    }, 500);
    return () => clearInterval(id);
  }, [boss?.reshuffleAt, refresh]);
  // She has reshuffled when her countdown is gone while she is still in town on
  // the same day, whichever ask brought the news (this one or the regular one).
  const queenWas = useRef<{ day: number; counting: boolean } | null>(null);
  const queenDay = data?.calendar.day ?? 0;
  const queenCounting = !!boss?.reshuffleAt;
  const queenInTown = !!boss?.alive && boss.kind === "queen";
  useEffect(() => {
    const was = queenWas.current;
    queenWas.current = queenInTown ? { day: queenDay, counting: queenCounting } : null;
    if (queenInTown && was?.counting && was.day === queenDay && !queenCounting) {
      say(t("toast.queen-shuffled"));
    }
  }, [queenInTown, queenDay, queenCounting, say]);

  // a new game day (energy, quests, the boss) starts at 00:00 UTC: ask for it
  // then, a little spread out, and again every 30s while the server still
  // answers with the old day (a client clock ahead of the server)
  const nextDayAt = data?.calendar.nextDayAt;
  useEffect(() => {
    if (phase !== "ready" || !nextDayAt) return;
    const due = Date.parse(nextDayAt);
    dayDue.current = due;
    const wait = Math.max(due - Date.now() + 2000 + Math.random() * 20_000, 30_000);
    // re-armed after every try, answered or not, so a failed request at
    // midnight is asked again 30s later
    const id = setTimeout(
      () => refresh({ quiet: true }).finally(() => setDayTick((n) => n + 1)),
      wait
    );
    // a background tab's timers are held back: catch up when it shows again
    const onVisible = () => {
      if (!document.hidden && Date.now() > due) refresh({ quiet: true });
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
        // quiet: "something went wrong" after an action that went through would
        // invite doing it again (a second rally, a second gift)
        await refresh({ quiet: true });
        return r;
      } catch (e) {
        say(errorMessage(e, i18next.t));
        // the action may have happened even though the answer was lost
        refresh({ quiet: true });
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
      const aim = aimOf(data);
      // The wasp dodges everyone who has not scouted since it came: say so rather
      // than spend energy on a sure miss. It may be gone by now, so ask (not on
      // every tap of a player who keeps tapping).
      if (aim === "wasp" && !boss.weakness) {
        if (n - waspAskRef.current > 3000) {
          waspAskRef.current = n;
          refresh();
        }
        return say(t(member.scoutFree ? "toast.wasp-scout-free" : "toast.wasp-scout-first"));
      }
      let s: 0 | 1 = side ?? 0;
      if (side === undefined && boss.kind === "twins") {
        // the other twin while hits wait on one (the player's own, or an ally's)
        s = twinSide(boss, Date.now() + stateSkew.current, sideRef.current);
        sideRef.current = s ? 0 : 1;
      }
      const shot = sceneRef.current?.attack(type, aim, s);
      // an answer asked before this tap (a regular ask still on its way) would put
      // the spent energy back for a moment: it no longer counts
      appliedSeq.current = ++refreshSeq.current;
      setData((d) =>
        d?.member ? { ...d, member: { ...d.member, energy: d.member.energy - 1 } } : d
      );
      try {
        const r = await raidsteadApi.attack(type, s);
        shot?.resolve(impactOf(r));
        say(attackMessage(r, type, i18next.t, data?.account.name));
      } catch (e) {
        shot?.resolve({ kind: "miss" });
        say(errorMessage(e, i18next.t));
      }
      refresh({ quiet: true });
    },
    [alliance, member, boss, data, refresh, say]
  );

  tapRef.current = (target) => {
    if (target.kind === "building") {
      if (alliance) setSheet({ kind: "building", id: target.id });
      return;
    }
    if (target.kind === "hero") {
      if (alliance && phase === "ready" && !sheet) setSheet({ kind: "hero", hero: target.hero });
      return;
    }
    if (target.kind === "town") {
      const town = neighbors.find((n) => n.community === target.community);
      if (town && !sheet) setSheet({ kind: "town", town });
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
        // known from this answer on, not only once the state has been asked again:
        // an attack tapped right away must not be held back as unscouted (nor by
        // an answer that was asked before the scout)
        appliedSeq.current = ++refreshSeq.current;
        setData((d) =>
          d?.alliance
            ? {
                ...d,
                alliance: { ...d.alliance, boss: { ...d.alliance.boss, weakness: r.weakness } }
              }
            : d
        );
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
        // spend may have gone through, so the retry keeps the key. games-api's own
        // "Points could not be reached" is an answer: it gave the spend back (or
        // never made it), and that key is used up.
        const status = (e as { status?: number }).status ?? 0;
        const code = (e as { code?: string }).code;
        const answered = code === "points_unavailable" || code === "unavailable";
        if ((status !== 0 && status < 500) || answered) settleSpend(account, which);
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
      (r) =>
        say(
          !r.applied.filled
            ? t("toast.donated")
            : r.applied.kept
              ? t("toast.chest-kept")
              : t("toast.chest-full")
        )
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
    // news waiting behind the menu must not open (and count as read) on the way out
    setAwayNews(null);
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
      : member?.scoutFree
        ? t("actions.scout-wasp")
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
  const rallyWhy = rallyBlock(data);

  // which blocking sheet, if any, comes before the game
  let gate: ReactElement | null = null;
  // While Ecency's login dialog is open the sign-in sheet steps aside: an open
  // modal <dialog> makes the rest of the page inert, that dialog included.
  if (preseason) {
    // counting down: nothing to sign in for yet
  } else if (phase === "signin" && !loginOpen) {
    gate = (
      <SignInSheet
        username={username}
        canSign={!!username && signerFor(username) !== null}
        // after a try that failed, the tap may ask a wallet instead: say so
        silent={
          !!username &&
          (signerFor(username) === "key" ||
            (signerFor(username) === "ecency" && !(signFailed && hasAnyHiveExtension())))
        }
        failed={signFailed}
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
  // counting down there is no game state yet, only the public calendar
  if (!gate && sheet?.kind === "help" && preseason)
    open = <FieldGuideSheet calendar={preseason} onClose={close} />;
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
      case "town":
        open = <TownSheet town={sheet.town} onClose={close} />;
        break;
      case "hero":
        open = alliance ? (
          <HeroSheet
            hero={sheet.hero}
            state={data}
            busy={busy}
            onClose={close}
            onAttack={(type) => {
              close();
              attack(type);
            }}
            onRally={() => {
              close();
              rally();
            }}
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
      case "news":
        open = <NewsSheet notes={sheet.notes} away={sheet.away} onClose={close} />;
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
        open = <FieldGuideSheet calendar={data.calendar} onClose={close} />;
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

        {preseason && (
          <SeasonCountdown
            key={countRound}
            startsAt={preseason.startsAt}
            skew={skew}
            onOpen={openSeason}
            onGuide={() => setSheet({ kind: "help" })}
          />
        )}
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
                      boss.waspHp ? t("boss.wasp", { n: boss.waspHp }) : ""
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : boss.killed === false
                    ? t("boss.escaped", { week: alliance!.week })
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
              {[toast, flash].filter(Boolean).join(" ")}
            </p>
            {view === "town" && neighbors.length > 0 && (
              // the far towns live on the canvas; these open their cards from
              // the keyboard and for screen readers, shown once focused
              <div className="rs-hero-links" role="group" aria-label={t("sky.group")}>
                {neighbors.map((n) => (
                  <button
                    key={n.community}
                    className="rs-btn sr-only focus:not-sr-only"
                    onClick={() => setSheet({ kind: "town", town: n })}
                  >
                    {t("sky.about", { name: n.title || n.community })}
                  </button>
                ))}
              </div>
            )}
            {view === "raid" && (
              // the heroes live on the canvas; these open their cards from the
              // keyboard and for screen readers, shown once focused
              <div className="rs-hero-links" role="group" aria-label={t("hero-card.group")}>
                {FOLK.map((h) => (
                  <button
                    key={h}
                    className="rs-btn sr-only focus:not-sr-only"
                    onClick={() => setSheet({ kind: "hero", hero: h })}
                  >
                    {t("hero-card.about", { name: t(`heroes.${h}`) })}
                  </button>
                ))}
              </div>
            )}
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
                <button className="rs-sec" disabled={busy || rallyWhy !== null} onClick={rally}>
                  {t("actions.rally")}
                  <small>
                    {rallyWhy === "rallied"
                      ? t("actions.rally-used")
                      : rallyWhy === "no-boss"
                        ? t("actions.rally-no-boss")
                        : rallyWhy === "full"
                          ? t("actions.rally-full")
                          : t("actions.rally-cost")}
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
