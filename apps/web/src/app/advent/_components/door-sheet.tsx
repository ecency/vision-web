"use client";

import i18next from "i18next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, ModalBody } from "@ui/modal";
import { adventApi } from "@/features/advent/client";
import { AdventError } from "@/features/advent/advent-api";
import { markAnsweredToday } from "@/features/advent/advent-banner";
import { useAdventWave } from "@/features/advent/use-advent-wave";
import { sessionIsFor } from "@/features/advent/use-advent-session";
import { loadSession } from "@/features/raidstead/client";
import { clearPendingWave, keepPendingWave, pendingWave } from "@/features/advent/pending-wave";
import { waveText } from "@/features/advent/wave-text";
import { ADVENT_SEASON, todayDoor } from "@/features/advent/season";
import { Sky } from "@/features/advent/sky";
import { WreathArt } from "@/features/advent/art";
import { adventFont } from "@/features/advent/font";
import type { DoorResult, MeDoor, OpenedDoor, PublicDoor } from "@/features/advent/types";
import { prizeText, rewardIcon, rewardLabel } from "@/features/advent/reward";

/// A door is drawn this long after it closes (games-api's DRAW_DELAY_MS).
const DRAW_DELAY_MS = 2 * 3_600_000;
const ORNAMENTS = ["#d9a21f", "#8f9bab", "#b4683a"];
/// Why a qualifying account was passed over, in the published rule's words; any other cause is not shown.
const SKIP_CAUSES: Record<string, string> = { group: "advent.skip-group", cap: "advent.skip-limit", season_cap: "advent.skip-limit" };
const fmt = (n: number) => n.toLocaleString();
const when = (t: number) => new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

/// Tells the games API which Wave belongs to the answer, trying a few times.
/// Until that works the Wave is kept in this browser (pending-wave.ts), so it
/// is linked again later and never published twice.
async function linkWave(account: string, day: number, permlink: string, live: () => boolean): Promise<boolean> {
  keepPendingWave(account, day, permlink);
  for (let i = 0; i < 3; i++) {
    // only with this account's own session, while its sheet is still open: a
    // session swapped to another account (another tab) would attach this Wave
    // to their answer. The Wave stays pending for this account.
    if (!live() || !sessionIsFor(account)) return false;
    try {
      await adventApi.wave(ADVENT_SEASON, day, permlink);
      clearPendingWave(account, day);
      return true;
    } catch {
      if (i < 2) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return false;
}

function closesIn(closeAt: string) {
  const ms = Date.parse(closeAt) - Date.now();
  if (ms <= 0) return null;
  return i18next.t("advent.closes-in", { h: Math.floor(ms / 36e5), m: Math.floor(ms / 6e4) % 60 });
}

function Header({ door, label, snow }: { door: PublicDoor; label: string; snow: boolean }) {
  const art = typeof door.artwork === "string" && door.artwork.startsWith("https://") ? door.artwork : null;
  return (
    <Sky className="adv-art" bulbs={12} snow={snow}>
      {art && <img className="adv-art-img" src={art} alt="" />}
      <WreathArt />
      <div className="adv-daytag">
        <small>{label}</small>
        {i18next.t("advent.door-label", { day: door.day })}
      </div>
    </Sky>
  );
}

function PrizeLine({ door }: { door: PublicDoor }) {
  const drawAt = Date.parse(door.closeAt) + DRAW_DELAY_MS;
  return (
    <div className="adv-row" style={{ justifyContent: "flex-start", gap: 6 }}>
      <span className="adv-pill">
        {rewardIcon(door.reward.kind)}
        {door.reward.kind === "spotlight"
          ? `${rewardLabel(door.reward.kind)} · ${prizeText(door.reward.kind, door.reward.amounts[0])}`
          : `${rewardLabel(door.reward.kind)} · ${door.reward.amounts.map(fmt).join(" / ")}`}
      </span>
      <span className="adv-pill">{i18next.t("advent.draw-at", { time: when(drawAt) })}</span>
    </div>
  );
}

const SPARKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const r = 54 + (i % 3) * 12;
  return {
    "--x": `${Math.round(Math.cos(a) * r)}px`,
    "--y": `${Math.round(Math.sin(a) * r)}px`,
    "--c": ["var(--adv-gold)", "var(--adv-berry-2)", "var(--adv-green)", "#59b7ff"][i % 4],
    "--d": `${0.15 + (i % 4) * 0.04}s`
  } as React.CSSProperties;
});

interface AnswerProps {
  door: OpenedDoor;
  account: string;
  onSessionLost: (token: string | null | undefined) => void;
  onAlready: () => void;
  onDone: (answer: string | null, wave: string | null, late: boolean, linked: boolean) => void;
}

/// False once the component is gone (the sheet closed or its account changed).
function useLive() {
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  return useCallback(() => live.current, []);
}

function AnswerForm({ door, account, onSessionLost, onAlready, onDone }: AnswerProps) {
  const isLive = useLive();
  const postWave = useAdventWave();
  const [text, setText] = useState("");
  const [choice, setChoice] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const late = Date.now() > Date.parse(door.closeAt);
  const open = door.kind === "open";
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const ready = open ? text.trim().length > 0 : choice !== null;

  const submit = async () => {
    if (!ready || busy) return;
    // the shared session may have been swapped for another account in another tab
    const token = loadSession()?.token;
    // the shared session now belongs to someone else: close, and leave that session alone
    if (!sessionIsFor(account)) return onSessionLost(null);
    setBusy(true);
    setError(null);
    let late = false;
    try {
      late = (await adventApi.answer(ADVENT_SEASON, door.day, open ? { answer: text.trim() } : { choice: choice! })).late;
    } catch (e) {
      setBusy(false);
      if (e instanceof AdventError && e.status === 401) return onSessionLost(token);
      // answered already (another tab or device): show that answer and its Wave
      if (e instanceof AdventError && e.code === "already_answered") return onAlready();
      setError(i18next.t("advent.answer-failed"));
      return;
    }
    if (todayDoor(Date.now()) === door.day) markAnsweredToday();
    // the answer counts already; the Wave is extra, and may be posted again later
    try {
      const permlink = await postWave(waveText(door, open ? text : undefined));
      const linked = await linkWave(account, door.day, permlink, isLive);
      if (isLive()) onDone(open ? text.trim() : null, permlink, late, linked);
    } catch {
      if (isLive()) onDone(open ? text.trim() : null, null, late, true);
    }
  };

  return (
    <>
      <p className="adv-prompt">{door.prompt}</p>
      <PrizeLine door={door} />
      {late && <div className="adv-note">{i18next.t("advent.late-note")}</div>}
      {open ? (
        <>
          <textarea
            id={`advent-answer-${door.day}`}
            className="adv-textarea"
            aria-label={i18next.t("advent.your-answer")}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="adv-hint">
            <span>{i18next.t("advent.write-hint")}</span>
            <span>{i18next.t("advent.words", { n: words })}</span>
          </div>
        </>
      ) : (
        <div className="adv-choices" role="radiogroup" aria-label={door.prompt}>
          {(door.choices ?? []).map((c, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              className="adv-choice"
              aria-checked={choice === i}
              onClick={() => setChoice(i)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="adv-note">{open ? i18next.t("advent.wave-note-open") : i18next.t("advent.wave-note-pick", { day: door.day })}</div>
      {error && (
        <div className="adv-note" role="alert">
          {error}
        </div>
      )}
      <div className="adv-row">
        <span className="adv-muted">{closesIn(door.closeAt) ?? ""}</span>
        <button type="button" className="adv-btn" disabled={!ready || busy} onClick={submit}>
          {open ? i18next.t("advent.submit-wave") : i18next.t("advent.submit")}
        </button>
      </div>
    </>
  );
}

interface DoneProps {
  door: PublicDoor;
  account: string;
  answer: string | null;
  wave: string | null;
  /// The games API knows the Wave (false: it was posted but not yet linked).
  linked: boolean;
  late: boolean;
  onWave: (permlink: string, linked: boolean) => void;
  onClose: () => void;
}

function Answered({ door, account, answer, wave, linked, late, onWave, onClose }: DoneProps) {
  const isLive = useLive();
  const postWave = useAdventWave();
  const [posting, setPosting] = useState(false);
  const drawAt = Date.parse(door.closeAt) + DRAW_DELAY_MS;
  const retry = async () => {
    setPosting(true);
    try {
      // a Wave already posted is only linked again, never posted twice
      const permlink = wave ?? (await postWave(waveText(door, answer ?? undefined)));
      const ok = await linkWave(account, door.day, permlink, isLive);
      if (isLive()) onWave(permlink, ok);
    } catch {
      // the Waves composer already said why; the button stays
    } finally {
      setPosting(false);
    }
  };
  return (
    <div className="adv-done">
      <div className="adv-burst">
        {SPARKS.map((s, i) => (
          <span key={i} className={`adv-spark${i % 2 ? " star" : ""}`} style={s} />
        ))}
        <div className="big">
          <svg viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" className="size-6" aria-hidden data-icon-exempt>
            <path d="M6 13.5 11 18.5 20 8" />
          </svg>
        </div>
      </div>
      <h3>{i18next.t("advent.answered-title")}</h3>
      <p className="adv-muted" style={{ margin: 0, maxWidth: "40ch" }}>
        {late ? i18next.t("advent.answered-late") : i18next.t("advent.answered-text", { time: when(drawAt) })}
      </p>
      <div className="adv-row" style={{ justifyContent: "center" }}>
        {wave && !linked && (
          <button type="button" className="adv-btn ghost" disabled={posting} onClick={retry}>
            {i18next.t("advent.link-wave")}
          </button>
        )}
        {wave ? (
          <Link className="adv-btn ghost" href={`/@${account}/${wave}`}>
            {i18next.t("advent.view-wave")}
          </Link>
        ) : (
          <button type="button" className="adv-btn ghost" disabled={posting} onClick={retry}>
            {i18next.t("advent.post-wave")}
          </button>
        )}
        <button type="button" className="adv-btn" onClick={onClose}>
          {i18next.t("advent.back")}
        </button>
      </div>
    </div>
  );
}

interface ResultProps {
  door: PublicDoor;
  account: string | null;
  onAnswerLate?: () => void;
  /// The reader answered this door: their answer and its Wave stay reachable.
  onMyAnswer?: () => void;
}

function Result({ door, account, onAnswerLate, onMyAnswer }: ResultProps) {
  const [result, setResult] = useState<DoorResult | null | "none" | "error">(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    adventApi
      .result(ADVENT_SEASON, door.day)
      .then((r) => live && setResult(r))
      // not drawn yet is one answer; anything else (offline, a server error) can be tried again
      .catch((e) => live && setResult(e instanceof AdventError && e.code === "not_drawn" ? "none" : "error"));
    return () => {
      live = false;
    };
  }, [door.day, attempt]);

  const total = result && result !== "none" && result !== "error" && result.tallies ? result.tallies.reduce((s, n) => s + n, 0) : 0;
  const eligibleList = useMemo(
    () => (result && result !== "none" && result !== "error" && result.eligible ? [...result.eligible].sort().join("\n") : ""),
    [result]
  );

  return (
    <>
      {door.prompt && <p className="adv-prompt">{door.prompt}</p>}
      {result === null && <p className="adv-muted">{i18next.t("advent.loading")}</p>}
      {result === "error" && (
        <div className="adv-row">
          <span className="adv-muted">{i18next.t("advent.load-failed")}</span>
          <button
            type="button"
            className="adv-btn ghost"
            onClick={() => {
              setResult(null);
              setAttempt((n) => n + 1);
            }}
          >
            {i18next.t("advent.try-again")}
          </button>
        </div>
      )}
      {result === "none" && (
        <p className="adv-muted">
          {i18next.t("advent.not-drawn", { time: when(Date.parse(door.closeAt) + DRAW_DELAY_MS) })}
        </p>
      )}
      {result && result !== "none" && result !== "error" && (
        <>
          <div className="adv-winners">
            {result.winners.map((w) => {
              const amount = door.reward.amounts[w.place - 1];
              return (
                <div
                  key={w.place}
                  className={`adv-winner${w.account === account ? " you" : ""}${w.cancelled ? " cancelled" : ""}`}
                >
                  <span className="adv-orn" style={{ "--c": ORNAMENTS[w.place - 1] ?? ORNAMENTS[2] } as React.CSSProperties}>
                    {w.place}
                  </span>
                  <Link className="name" href={`/@${w.account}`}>
                    @{w.account}
                    {w.account === account ? ` ${i18next.t("advent.you")}` : ""}
                  </Link>
                  {amount !== undefined && (
                    <span className="adv-pill">
                      {prizeText(door.reward.kind, amount)}
                    </span>
                  )}
                </div>
              );
            })}
            {!result.winners.length && <p className="adv-muted">{i18next.t("advent.no-winners")}</p>}
          </div>
          {result.tallies && door.choices && (
            <div className="adv-bars">
              {door.choices.map((c, i) => {
                const pct = total ? Math.round((result.tallies![i] / total) * 100) : 0;
                return (
                  <div key={i} className={`adv-bar${result.answerIndex === i ? " correct" : ""}`}>
                    <div className="adv-row">
                      <span>
                        {c}
                        {result.answerIndex === i ? ` · ${i18next.t("advent.right-answer")}` : ""}
                      </span>
                      <span className="adv-muted">{pct}%</span>
                    </div>
                    <div className="track">
                      <div className="fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <span className="adv-muted">{i18next.t("advent.entries", { n: fmt(result.entries) })}</span>
          {result.seedBlock !== null && (
            <details className="adv-details">
              <summary>{i18next.t("advent.check-draw")}</summary>
              <div className="adv-verify">
                <span>
                  {i18next.t("advent.seed-block")} <code>{fmt(result.seedBlock)}</code>
                </span>
                {result.seedId && (
                  <span>
                    {i18next.t("advent.seed-id")} <code>{result.seedId}</code>
                  </span>
                )}
                <span>
                  {i18next.t("advent.rule")} <code>{result.rule}</code>
                </span>
                <span>{i18next.t("advent.qualified", { n: fmt(result.eligible?.length ?? 0) })}</span>
                {result.skipped.length > 0 && (
                  <span>
                    {i18next.t("advent.skipped")}{" "}
                    {result.skipped.map((s) => (
                      <code key={s.account}>
                        @{s.account}
                        {SKIP_CAUSES[s.cause] ? ` (${i18next.t(SKIP_CAUSES[s.cause])})` : ""}
                      </code>
                    ))}
                  </span>
                )}
                <span>
                  <a href={`https://hiveblocks.com/b/${result.seedBlock}`} target="_blank" rel="noopener noreferrer">
                    {i18next.t("advent.see-block")}
                  </a>
                  {eligibleList && (
                    <>
                      {" · "}
                      <a
                        href={`data:text/plain;charset=utf-8,${encodeURIComponent(eligibleList)}`}
                        download={`advent-${ADVENT_SEASON}-door-${door.day}.txt`}
                      >
                        {i18next.t("advent.download-list")}
                      </a>
                    </>
                  )}
                </span>
              </div>
            </details>
          )}
        </>
      )}
      {onMyAnswer && (
        <div className="adv-row">
          <span className="adv-muted">{i18next.t("advent.your-answer-note")}</span>
          <button type="button" className="adv-btn ghost" onClick={onMyAnswer}>
            {i18next.t("advent.your-answer-open")}
          </button>
        </div>
      )}
      {onAnswerLate && (
        <div className="adv-row">
          <span className="adv-muted">{i18next.t("advent.late-note")}</span>
          <button type="button" className="adv-btn ghost" onClick={onAnswerLate}>
            {i18next.t("advent.answer-late")}
          </button>
        </div>
      )}
    </>
  );
}

interface Props {
  door: PublicDoor;
  me?: MeDoor;
  account: string | null;
  canAnswer: boolean;
  snow: boolean;
  onClose: () => void;
  onChanged: () => void;
  onSessionLost: (token: string | null | undefined) => void;
}

type Mode =
  | { m: "loading" }
  | { m: "answer"; door: OpenedDoor }
  | { m: "done"; answer: string | null; wave: string | null; linked: boolean; late: boolean }
  | { m: "result" }
  | { m: "failed" };

/// One door, over the calendar: the answer form while it can be answered, the
/// confirmation once answered, and the draw's result once drawn.
export function DoorSheet({ door, me, account, canAnswer, snow, onClose, onChanged, onSessionLost }: Props) {
  const answerable = canAnswer && !!account && door.status !== "locked";
  const [mode, setMode] = useState<Mode>(() =>
    door.status === "drawn" || !answerable ? { m: "result" } : { m: "loading" }
  );

  const load = () => {
    const token = loadSession()?.token;
    setMode({ m: "loading" });
    adventApi
      .open(ADVENT_SEASON, door.day)
      .then((d) =>
        setMode(
          d.entry.answered
            ? (() => {
                // a Wave published earlier but never linked: offer to link that one
                const pending = d.entry.wave ? null : account ? pendingWave(account, door.day) : null;
                if (d.entry.wave && account) clearPendingWave(account, door.day);
                return { m: "done" as const, answer: d.entry.answer, wave: d.entry.wave ?? pending, linked: !pending, late: d.entry.late };
              })()
            : { m: "answer", door: d }
        )
      )
      .catch((e) => (e instanceof AdventError && e.status === 401 ? onSessionLost(token) : setMode({ m: "failed" })));
  };

  useEffect(() => {
    if (mode.m === "loading") load();
    // only on the first render: later loads are asked for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    mode.m === "result"
      ? i18next.t("advent.label-drawn")
      : door.kind === "open"
        ? i18next.t("advent.label-write")
        : i18next.t("advent.label-pick");

  return (
    <Modal show={true} centered={true} onHide={onClose} size="md" dialogClassName="advent-sheet">
      <ModalBody className="advent-sheet">
        <div className="advent adv-sheet" style={adventFont}>
          <Header door={door} label={label} snow={snow} />
          <div className="adv-sheet-body">
            {mode.m === "loading" && <p className="adv-muted">{i18next.t("advent.loading")}</p>}
            {mode.m === "failed" && (
              <div className="adv-row">
                <span className="adv-muted">{i18next.t("advent.load-failed")}</span>
                <button type="button" className="adv-btn ghost" onClick={load}>
                  {i18next.t("advent.try-again")}
                </button>
              </div>
            )}
            {mode.m === "answer" && account && (
              <AnswerForm
                door={mode.door}
                account={account}
                onSessionLost={onSessionLost}
                onAlready={load}
                onDone={(answer, wave, late, linked) => {
                  setMode({ m: "done", answer, wave, linked, late });
                  onChanged();
                }}
              />
            )}
            {mode.m === "done" && account && (
              <Answered
                door={door}
                account={account}
                answer={mode.answer}
                wave={mode.wave}
                linked={mode.linked}
                late={mode.late}
                onWave={(wave, linked) => setMode({ ...mode, wave, linked })}
                onClose={onClose}
              />
            )}
            {mode.m === "result" && (
              <Result
                door={door}
                account={account}
                onAnswerLate={answerable && !me?.answered ? load : undefined}
                onMyAnswer={answerable && me?.answered ? load : undefined}
              />
            )}
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
}
