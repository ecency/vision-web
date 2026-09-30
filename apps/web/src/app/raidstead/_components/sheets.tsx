"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import i18next from "i18next";
import {
  POWERS,
  type AttackType,
  type BuildingId,
  type Community,
  type FolkClass,
  type LeaderRow,
  type PowerId,
  type State
} from "@ecency/raidstead";
import { tierOf, type Neighbor } from "@/features/raidstead/game";

const t = (key: string, values?: Record<string, unknown>) => i18next.t(`raidstead.${key}`, values);

/// Every menu, reward and form: one modal dialog styled like a printed card.
export function Sheet({
  onClose,
  closable = true,
  children,
  label
}: {
  onClose: () => void;
  closable?: boolean;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // set while we close the dialog ourselves (on unmount), so that close is
  // not mistaken for the browser closing it
  const unmounting = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    unmounting.current = false;
    // focus goes back where it was when the sheet opened (the dialog is
    // removed with the sheet, so the browser cannot do it on close)
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute("open", "");
      }
    }
    return () => {
      unmounting.current = true;
      // a browser without <dialog> support has no close(): drop the attribute
      if (d.open) typeof d.close === "function" ? d.close() : d.removeAttribute("open");
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body || !active.isConnected))
        opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="raidstead-sheet"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        if (closable) onClose();
      }}
      // The browser may close a dialog on its own (repeated Escape): keep the
      // page's state in step, and put a sheet that must stay back up.
      onClose={() => {
        // the close event is queued: by the time it runs the sheet may be
        // unmounting, or open again (an effect run twice closes and reopens)
        if (unmounting.current || ref.current?.open) return;
        if (closable) onClose();
        else
          try {
            ref.current?.showModal();
          } catch {
            /* already open */
          }
      }}
    >
      <div className="rs-sheet">
        {closable && (
          <button className="rs-x" aria-label={i18next.t("g.close")} onClick={onClose}>
            ×
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
}

export function SignInSheet(props: {
  username: string | null;
  canSign: boolean;
  /// signs with the stored posting key, no wallet prompt
  silent?: boolean;
  hasWallet: boolean;
  signing: boolean;
  onSign: (account: string) => void;
  onLogin: () => void;
}) {
  const [name, setName] = useState("");
  const valid = /^[a-z][a-z0-9.-]{2,15}$/.test(name.trim().toLowerCase());
  return (
    <Sheet onClose={() => undefined} closable={false} label={t("title")}>
      <small>{t("tagline")}</small>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      {props.username && props.canSign ? (
        <>
          <div className="rs-btns">
            <button
              className="rs-btn rs-primary"
              disabled={props.signing}
              onClick={() => props.onSign(props.username!)}
            >
              {props.signing ? t("signin.signing") : t("signin.play-as", { name: props.username })}
            </button>
          </div>
          {!props.silent && <p className="rs-muted">{t("signin.extension-note")}</p>}
        </>
      ) : props.hasWallet ? (
        <form
          className="rs-sheet"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) props.onSign(name.trim().toLowerCase());
          }}
        >
          <label className="rs-field">
            {t("signin.username")}
            <input
              className="rs-text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
            />
          </label>
          <div className="rs-btns">
            {!props.username && (
              <button type="button" className="rs-btn" onClick={props.onLogin}>
                {t("signin.login")}
              </button>
            )}
            <button type="submit" className="rs-btn rs-primary" disabled={!valid || props.signing}>
              {props.signing ? t("signin.signing") : t("signin.with-wallet")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="rs-muted">{t("signin.need-extension")}</p>
          {!props.username && (
            <div className="rs-btns">
              <button className="rs-btn rs-primary" onClick={props.onLogin}>
                {t("signin.login")}
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

export function InfoSheet({
  title,
  lines,
  onClose,
  closable = true,
  action
}: {
  title: string;
  lines: string[];
  onClose: () => void;
  closable?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <Sheet onClose={onClose} closable={closable} label={title}>
      <h2>{title}</h2>
      {lines.map((l, i) => (
        <p key={i} className={i ? "rs-muted" : undefined}>
          {l}
        </p>
      ))}
      {action && (
        <div className="rs-btns">
          <button type="button" className="rs-btn rs-primary" onClick={action.onClick}>
            {action.label}
          </button>
        </div>
      )}
    </Sheet>
  );
}

export function PickSheet({
  load,
  onJoin,
  busy
}: {
  load: () => Promise<Community[]>;
  onJoin: (c: Community) => void;
  busy: boolean;
}) {
  const [list, setList] = useState<Community[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    load().then(setList, () => setFailed(true));
  }, [load]);
  return (
    <Sheet onClose={() => undefined} closable={false} label={t("alliance.pick-title")}>
      <h2>{t("alliance.pick-title")}</h2>
      <p>{t("alliance.pick-desc")}</p>
      {failed && <p className="rs-muted">{t("errors.offline")}</p>}
      {!list && !failed && <p className="rs-muted">{t("loading")}</p>}
      {list && list.length === 0 && (
        <>
          <p className="rs-muted">{t("alliance.none")}</p>
          <div className="rs-btns">
            <a className="rs-btn rs-primary" href="/communities">
              {t("alliance.browse")}
            </a>
          </div>
        </>
      )}
      {list && list.length > 0 && (
        <ul className="rs-list">
          {list.map((c) => (
            <li key={c.name}>
              <button className="rs-opt" disabled={busy} onClick={() => onJoin(c)}>
                <i className="rs-banner" aria-hidden="true" />
                <span>
                  <b>{c.title || c.name}</b>
                  <br />
                  <small>{c.name}</small>
                </span>
                <span>{t("alliance.join")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export function BossSheet({ state, onClose }: { state: State; onClose: () => void }) {
  const a = state.alliance!;
  const kind = a.boss.kind;
  const waspWeek = kind === "slug" || kind === "twins";
  return (
    <Sheet onClose={onClose} label={t(`bosses.${kind}.name`)}>
      <small>
        {t("boss.week-card", { week: a.week })}
        {kind === "queen" ? ` · ${t("boss.finale")}` : ""}
      </small>
      <h2>{t(`bosses.${kind}.name`)}</h2>
      <p>
        <b>{t("boss.trick-label")}</b> {t(`bosses.${kind}.trick`)}
      </p>
      <p>
        <b>{t("boss.tip-label")}</b> {t(`bosses.${kind}.tip`)}
      </p>
      <p className="rs-muted">
        {t("boss.shield-note")}
        {waspWeek ? ` ${t("boss.wasp-note")}` : ""}
      </p>
      <div className="rs-btns">
        <button className="rs-btn rs-primary" onClick={onClose}>
          {t("boss.go")}
        </button>
      </div>
    </Sheet>
  );
}

const HERO_TYPE: Record<FolkClass, AttackType | null> = {
  scribe: "ink",
  scout: "signal",
  smith: "forge",
  herald: null
};

/// Who a hero on the raid field is, and one thing to do with them.
export function HeroSheet({
  hero,
  state,
  busy,
  onClose,
  onAttack,
  onRally
}: {
  hero: FolkClass;
  state: State;
  busy: boolean;
  onClose: () => void;
  onAttack: (type: AttackType) => void;
  onRally: () => void;
}) {
  const type = HERO_TYPE[hero];
  const boss = state.alliance?.boss;
  const member = state.member;
  const name = t(`heroes.${hero}`);
  const lines = [t(`hero-card.${hero}`)];
  if (type) {
    lines.push(t("hero-card.cost"));
    if (boss?.alive) {
      if (!boss.weakness) lines.push(t("hero-card.unknown"));
      else if (boss.weakness === type)
        lines.push(t("hero-card.weak", { type: t(`types.${type}`) }));
      else
        lines.push(
          t("hero-card.not-weak", {
            type: t(`types.${boss.weakness}`),
            mine: t(`types.${type}`)
          })
        );
    }
  } else if (member?.rallied) {
    lines.push(t("hero-card.rallied"));
  }
  // the same rules as the page's own buttons
  const resting = state.calendar.resting;
  const canAttack = !!type && !resting && !!boss?.alive && (member?.energy ?? 0) > 0;
  const canRally = !type && !resting && !!member && !member.rallied && !busy;
  return (
    <Sheet onClose={onClose} label={name}>
      <small>{type ? t(`types.${type}`) : t("hero-card.herald-role")}</small>
      <h2>{name}</h2>
      {lines.map((l, i) => (
        <p key={i} className={i ? "rs-muted" : undefined}>
          {l}
        </p>
      ))}
      <div className="rs-btns">
        {type ? (
          <button
            className="rs-btn rs-primary"
            disabled={!canAttack}
            onClick={() => onAttack(type)}
          >
            {t("hero-card.attack", { type: t(`types.${type}`) })}
          </button>
        ) : (
          <button className="rs-btn rs-primary" disabled={!canRally} onClick={onRally}>
            {t("actions.rally")} · {t("actions.rally-cost")}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/// Another alliance, from its town in the sky: who they are and a way to
/// their community on Ecency.
export function TownSheet({ town, onClose }: { town: Neighbor; onClose: () => void }) {
  const name = town.title || town.community;
  return (
    <Sheet onClose={onClose} label={name}>
      <small>{t("sky.eyebrow", { league: t(`profile.leagues.${town.league}`) })}</small>
      <h2>{name}</h2>
      <dl className="rs-facts">
        <div>
          <dt>{t("sky.members")}</dt>
          <dd>{town.members}</dd>
        </div>
        <div>
          <dt>{t("sky.kills")}</dt>
          <dd>{town.kills}</dd>
        </div>
        <div>
          <dt>{t("sky.rank")}</dt>
          <dd>{t("sky.rank-value", { n: town.rank })}</dd>
        </div>
      </dl>
      <p className="rs-muted">{t("sky.desc")}</p>
      <div className="rs-btns">
        <Link className="rs-btn rs-primary" href={`/created/${town.community}`}>
          {t("sky.visit")}
        </Link>
      </div>
    </Sheet>
  );
}

const COSTS: Record<BuildingId, number[]> = {
  tower: [30, 60, 90],
  workshop: [30, 60, 90],
  trophy: [30, 50, 80],
  hall: [40, 80, 120],
  library: [30, 60, 90],
  beacon: [30, 60, 90],
  walls: [40, 70, 100]
};

export function BuildingSheet(props: {
  id: BuildingId | "homes";
  state: State;
  busy: boolean;
  onClose: () => void;
  onBuild: (id: BuildingId) => void;
  onTalk: () => void;
  onPower: (p: PowerId, action: "craft" | "equip" | "unequip") => void;
}) {
  const { id, state } = props;
  const a = state.alliance!;
  const m = state.member!;
  const name = t(`town.buildings.${id}.name`);
  if (id === "homes") {
    return (
      <InfoSheet title={name} lines={[t("town.buildings.homes.does")]} onClose={props.onClose} />
    );
  }
  const stage = a.town[id];
  const cost = stage < 3 ? COSTS[id][stage] : 0;
  const hallFirst = id !== "hall" && stage >= a.town.hall && stage < 3;
  const short = a.mats < cost;
  const raided = m.attackDays > 0;
  const webbed = a.web === id;
  const talked = a.webTalk.includes(state.account.name);
  return (
    <Sheet onClose={props.onClose} label={name}>
      <small>{t(`town.stages.${stage}`)}</small>
      <h2>{name}</h2>
      <div className="rs-pipline" aria-label={`${stage} / 3`}>
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= stage ? "on" : undefined} />
        ))}
        <small>{stage < 3 ? t("town.to-go", { n: 3 - stage }) : t("town.done")}</small>
      </div>
      <p>
        {t(`town.buildings.${id}.does`)}
        {stage < 3 && id !== "workshop" && id !== "hall" ? ` ${t("town.works-when-finished")}` : ""}
      </p>
      {webbed && (
        <div className="rs-web-note">
          <b>{t("town.web-title", { name })}</b>
          <span>{t("town.web-desc")}</span>
          <div className="rs-btns" style={{ justifyContent: "flex-start" }}>
            <button
              className="rs-btn rs-primary"
              disabled={talked || props.busy}
              onClick={props.onTalk}
            >
              {talked ? t("town.talk-wait") : t("town.talk")}
            </button>
          </div>
        </div>
      )}
      {stage < 3 && (
        <>
          <div
            className="rs-btns"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <span>
              {t("town.cost", { stage: t(`town.stages.${stage + 1}`), cost })}{" "}
              <small>{t("town.have", { n: a.mats })}</small>
            </span>
            <button
              className="rs-btn rs-primary"
              disabled={hallFirst || short || !raided || props.busy}
              onClick={() => props.onBuild(id)}
            >
              {t("town.build")}
            </button>
          </div>
          {!raided ? (
            <p className="rs-muted">{t("town.raid-first")}</p>
          ) : hallFirst ? (
            <p className="rs-muted">{t("town.hall-first", { n: stage + 1 })}</p>
          ) : short ? (
            <p className="rs-muted">{t("town.short")}</p>
          ) : null}
        </>
      )}
      {id === "workshop" && (
        <>
          <h3>{t("town.powers-title", { n: m.equipped.length, slots: m.slots })}</h3>
          <p className="rs-muted">
            {t("town.powers-desc")}
            {!m.slots ? ` ${t("town.powers-closed")}` : ""}
          </p>
          <div className="rs-list">
            {POWERS.map((p) => {
              const own = m.powers.includes(p);
              const on = m.equipped.includes(p);
              return (
                <div key={p} className={`rs-item${on ? " on" : ""}`}>
                  <span>
                    <b>{t(`town.powers.${p}.name`)}</b>
                    <br />
                    <span className="rs-muted">{t(`town.powers.${p}.desc`)}</span>
                  </span>
                  {own ? (
                    <button
                      className="rs-btn"
                      disabled={props.busy || (!on && m.equipped.length >= m.slots)}
                      onClick={() => props.onPower(p, on ? "unequip" : "equip")}
                    >
                      {on ? t("town.unequip") : t("town.equip")}
                    </button>
                  ) : (
                    <button
                      className="rs-btn"
                      disabled={props.busy || !m.slots || state.account.shards < 2}
                      onClick={() => props.onPower(p, "craft")}
                    >
                      {t("town.craft")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="rs-muted">{t("town.shards", { n: state.account.shards })}</p>
        </>
      )}
      {id === "trophy" && <Trophies state={state} />}
    </Sheet>
  );
}

function Trophies({ state }: { state: State }) {
  return (
    <>
      <h3>{t("profile.trophies")}</h3>
      {state.trophies.length ? (
        <ul>
          {state.trophies.map((x) => (
            <li key={`${x.season}-${x.community}`}>
              {t("profile.trophy", {
                season: x.season,
                name: x.title,
                rank: x.rank,
                league: t(`profile.leagues.${x.league}`)
              })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rs-muted">{t("profile.no-trophies")}</p>
      )}
      <h3>{t("profile.badges")}</h3>
      <div className="rs-badges">
        {BADGES.map((b) => (
          <div key={b} className={`rs-badge${state.account.badges.includes(b) ? " on" : ""}`}>
            <b>{t(`profile.badge-list.${b}.name`)}</b>
            <span>{t(`profile.badge-list.${b}.desc`)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const BADGES = [
  "first-kill",
  "pest-control",
  "scouts-eye",
  "rally-caller",
  "loyal",
  "season",
  "builder",
  "peacemaker"
];
const QUESTS = ["checkin", "post", "comments"];

export function QuestsSheet(props: {
  state: State;
  busy: boolean;
  onClose: () => void;
  onClaim: () => void;
  onDonate: () => void;
}) {
  const a = props.state.alliance!;
  const m = props.state.member!;
  return (
    <Sheet onClose={props.onClose} label={t("quests.title")}>
      <h2>{t("quests.title")}</h2>
      <h3>{t("quests.ecency")}</h3>
      <p className="rs-muted">{t("quests.ecency-desc")}</p>
      <div className="rs-list">
        {QUESTS.map((q) => {
          const done = m.quests.includes(q);
          return (
            <div key={q} className={`rs-item${done ? " done" : ""}`}>
              <span>
                {t(`quests.list.${q}`)}
                <br />
                <small>{done ? t("quests.done") : t("quests.todo")}</small>
              </span>
            </div>
          );
        })}
      </div>
      <div className="rs-btns">
        <button
          className="rs-btn"
          disabled={props.busy || m.quests.length >= 3}
          onClick={props.onClaim}
        >
          {t("quests.claim")}
        </button>
      </div>
      <h3>{t("quests.chest")}</h3>
      <p>
        {a.buffToday
          ? t("quests.chest-active", { name: a.title })
          : t("quests.chest-desc", { name: a.title })}
      </p>
      <div className="rs-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (a.chest / a.chestGoal) * 100)}%` }} />
      </div>
      <p className="rs-muted">{t("quests.chest-bar", { n: a.chest.toLocaleString() })}</p>
      <div className="rs-btns">
        <button
          className="rs-btn rs-primary"
          disabled={props.busy || a.buffToday || props.state.calendar.resting}
          onClick={props.onDonate}
        >
          {t("quests.donate")}
        </button>
      </div>
    </Sheet>
  );
}

export type MenuItem = "profile" | "board" | "report" | "leaderboard" | "help";

// The menu's small pictures, drawn like the game: ink lines on a halftone
// tile in the item's colour.
const MENU_ICONS: Record<MenuItem, { color: string; glyph: ReactNode }> = {
  profile: {
    color: "var(--rs-violet)",
    glyph: (
      <>
        <path className="rs-solid" d="M8 3l4 5 4-5" />
        <circle className="rs-solid" cx="12" cy="14.5" r="5.5" />
        <path
          d="M12 12.2l.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.6.9.4-1.7-1.3-1.2 1.7-.2z"
          fill="currentColor"
          strokeWidth="0.8"
        />
      </>
    )
  },
  board: {
    color: "var(--rs-coral)",
    glyph: (
      <>
        <path className="rs-solid" d="M19 4l-1 4-8.5 8.5-3-3L15 5z" />
        <path d="M5.5 12.5l6 6M8 17l-3.5 3.5" />
      </>
    )
  },
  report: {
    color: "var(--rs-scribe)",
    glyph: (
      <>
        <path className="rs-solid" d="M19.5 4.5C13 5 8.5 9.5 7.5 16.5c4-.5 9-3.5 12-12z" />
        <path d="M4.5 19.5l5-5" />
      </>
    )
  },
  leaderboard: {
    color: "var(--rs-lime)",
    glyph: (
      <>
        <path className="rs-solid" d="M7.5 4h9v5a4.5 4.5 0 01-9 0z" />
        <path d="M7.5 6H5a3 3 0 002.8 3.2M16.5 6H19a3 3 0 01-2.8 3.2M12 13.5V17M8.5 20h7" />
      </>
    )
  },
  help: {
    color: "var(--rs-scout)",
    glyph: (
      <>
        <path d="M8.8 8.6a3.3 3.3 0 016.4 1c0 2.3-3.2 2.6-3.2 4.9" />
        <circle cx="12" cy="18.6" r="1.1" fill="currentColor" stroke="none" />
      </>
    )
  }
};

function MenuIcon({ item }: { item: MenuItem }) {
  const { color, glyph } = MENU_ICONS[item];
  return (
    <span
      className="rs-tile inline-flex shrink-0 [&>svg]:size-full"
      style={{ "--rs-tile": color } as CSSProperties}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph}
      </svg>
    </span>
  );
}

export function MenuSheet({
  state,
  onClose,
  onPick,
  onSignOut
}: {
  state: State;
  onClose: () => void;
  onPick: (m: MenuItem) => void;
  onSignOut: () => void;
}) {
  const items: MenuItem[] = ["profile", "board", "report", "leaderboard", "help"];
  return (
    <Sheet onClose={onClose} label={t("actions.menu")}>
      <h2>{t("season.day", { day: Math.min(state.calendar.day, 28), total: 28 })}</h2>
      <p className="rs-muted">{t("menu.days")}</p>
      <ul className="rs-list">
        {items
          .filter((i) => i !== "report" || state.alliance)
          .map((i) => (
            <li key={i}>
              <button className="rs-opt rs-opt-icon" onClick={() => onPick(i)}>
                <MenuIcon item={i} />
                <span>
                  <b>{t(`menu.${i}`)}</b>
                  <br />
                  <small>{t(`menu.${i}-desc`)}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            </li>
          ))}
      </ul>
      <div className="rs-btns">
        <button className="rs-btn" onClick={onSignOut}>
          {t("signin.sign-out")}
        </button>
      </div>
    </Sheet>
  );
}

export function ProfileSheet({ state, onClose }: { state: State; onClose: () => void }) {
  const acc = state.account;
  return (
    <Sheet onClose={onClose} label={t("menu.profile")}>
      <h2>@{acc.name}</h2>
      <div className="rs-stats">
        <div className="rs-stat">
          <small>{t("profile.karma")}</small>
          <b>{acc.karma}</b>
        </div>
        <div className="rs-stat">
          <small>{t("profile.tier")}</small>
          <b>{t(`profile.tiers.${tierOf(acc.karma)}`)}</b>
        </div>
        <div className="rs-stat">
          <small>{t("profile.kills")}</small>
          <b>{acc.kills}</b>
        </div>
        <div className="rs-stat">
          <small>{t("profile.shards")}</small>
          <b>{acc.shards}</b>
        </div>
      </div>
      <Trophies state={state} />
      <p className="rs-muted">{t("profile.keeps")}</p>
    </Sheet>
  );
}

export function Raiders({ state }: { state: State }) {
  const rows = state.alliance?.raiders ?? [];
  if (!rows.length) return <p className="rs-muted">{t("board.empty")}</p>;
  return (
    <ol className="rs-rank">
      {rows.map((r, i) => (
        <li key={r.account} className={r.account === state.account.name ? "me" : undefined}>
          <span>{i + 1}</span>
          <span>{r.account === state.account.name ? t("board.you") : `@${r.account}`}</span>
          <span>{r.damage}</span>
        </li>
      ))}
    </ol>
  );
}

export function BoardSheet({ state, onClose }: { state: State; onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label={t("board.title")}>
      <h2>{t("board.title")}</h2>
      <Raiders state={state} />
    </Sheet>
  );
}

export function LeaderboardSheet({
  season,
  load,
  onClose
}: {
  season: number;
  load: () => Promise<LeaderRow[]>;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  useEffect(() => {
    load().then(setRows, () => setRows([]));
  }, [load]);
  return (
    <Sheet onClose={onClose} label={t("leaderboard.title", { n: season })}>
      <h2>{t("leaderboard.title", { n: season })}</h2>
      {!rows ? (
        <p className="rs-muted">{t("loading")}</p>
      ) : rows.length ? (
        <ol className="rs-rank">
          {rows.map((r, i) => (
            <li key={r.community}>
              <span>{i + 1}</span>
              <span>
                {r.title} <small>{t(`profile.leagues.${r.league}`)}</small>
              </span>
              <span>{t("leaderboard.kills", { n: r.kills })}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rs-muted">{t("leaderboard.empty")}</p>
      )}
    </Sheet>
  );
}

export function ReportSheet({
  report,
  onClose,
  onOpen
}: {
  report: { title: string; body: string };
  onClose: () => void;
  onOpen: () => void;
}) {
  return (
    <Sheet onClose={onClose} label={t("report.title")}>
      <h2>{t("report.title")}</h2>
      <p className="rs-muted">{t("report.desc")}</p>
      <p>
        <b>{report.title}</b>
      </p>
      <pre style={{ whiteSpace: "pre-wrap", margin: 0, font: "inherit", fontSize: 13 }}>
        {report.body}
      </pre>
      <div className="rs-btns">
        <button className="rs-btn rs-primary" onClick={onOpen}>
          {t("report.open")}
        </button>
      </div>
    </Sheet>
  );
}
