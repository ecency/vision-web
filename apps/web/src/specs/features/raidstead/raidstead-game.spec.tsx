import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The page around the scene: the scene itself (WebGL) is stubbed, the games
// API is mocked, and the Ecency user is switched under the page.
const { scene, api, box } = vi.hoisted(() => ({
  scene: {
    setSlot: vi.fn(),
    sync: vi.fn(),
    attack: vi.fn(() => ({ resolve: vi.fn() })),
    cheer: vi.fn(),
    destroy: vi.fn(),
    renderer: "2d"
  },
  api: {
    state: vi.fn(),
    signOut: vi.fn(async () => ({ ok: true })),
    rally: vi.fn(),
    chest: vi.fn(),
    attack: vi.fn(),
    scout: vi.fn(),
    quests: vi.fn(),
    build: vi.fn(),
    talk: vi.fn(),
    powers: vi.fn(),
    join: vi.fn(),
    communities: vi.fn(async () => ({ communities: [] })),
    leaderboard: vi.fn(async () => ({ season: 1, alliances: [] })),
    calendar: vi.fn(),
    session: vi.fn()
  },
  box: {
    stored: null as { account: string; token: string; expiresAt: string; ecency?: boolean } | null
  }
}));
vi.mock("@ecency/raidstead", async (orig) => ({
  ...(await orig<typeof import("@ecency/raidstead")>()),
  createScene: vi.fn(() => scene)
}));
vi.mock("@/features/raidstead/client", () => ({
  raidsteadApi: api,
  loadSession: () => box.stored,
  saveSession: (s: typeof box.stored) => {
    box.stored = s;
  },
  clearSession: vi.fn(() => {
    box.stored = null;
  }),
  signIn: vi.fn(),
  signerFor: vi.fn(() => "extension"),
  signOut: vi.fn(async () => {
    box.stored = null;
  })
}));
vi.mock("@/api/queries", () => ({ useHydrated: () => true }));
vi.mock("@/features/shared/login", () => ({ LoginDialog: () => null }));
vi.mock("@/app/publish/_hooks", () => ({ usePublishHandoffWriter: () => vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import i18next from "i18next";
import { createScene } from "@ecency/raidstead";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { clearSession, signerFor, signIn } from "@/features/raidstead/client";
import { RaidsteadGame } from "@/app/raidstead/_components/raidstead-game";

const expiry = () => new Date(Date.now() + 86_400_000).toISOString();

// What a visible line says: the values the page last gave that string (the i18n
// stand-in shows the key alone, so "5 / 15" reads "raidstead.energy.value").
const shown = (key: string) =>
  vi
    .mocked(i18next.t)
    .mock.calls.filter(([k]) => k === key)
    .at(-1)?.[1];

// the tab in the background (true) or showing (false); undo() gives jsdom's own answer back
const tabHidden = (hidden: boolean) =>
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
const undoTabHidden = () => delete (document as unknown as { hidden?: boolean }).hidden;

// the Ecency login: this tab's store copy and the one every tab shares
const asUser = (username: string | null) => {
  if (username) localStorage.setItem("ecency_active_user", JSON.stringify(username));
  else localStorage.removeItem("ecency_active_user");
  vi.mocked(useActiveAccount).mockReturnValue({
    activeUser: username ? { username } : null,
    username
  } as any);
};

function state() {
  return {
    calendar: {
      season: 1,
      day: 3,
      week: 1,
      resting: false,
      startsAt: "2026-10-05T00:00:00.000Z",
      nextDayAt: ""
    },
    account: { name: "ann", karma: 0, shards: 0, kills: 0, scouts: 0, badges: [] },
    trophies: [],
    alliance: {
      community: "hive-123456",
      title: "Ink & Oak",
      week: 1,
      boss: {
        kind: "beetle",
        hp: 600,
        maxHp: 600,
        alive: true,
        phase: 1,
        gnats: 0,
        waspHp: 0,
        weakness: null,
        echo: null,
        reshuffleAt: null
      },
      town: { tower: 0, workshop: 0, trophy: 0, hall: 0, library: 0, beacon: 0, walls: 0 },
      mats: 60,
      web: null,
      webTalk: [],
      chest: 0,
      chestGoal: 1000,
      buffToday: false,
      kills: 0,
      raiders: [],
      notes: []
    },
    member: {
      energy: 5,
      maxEnergy: 15,
      scoutsLeft: 1,
      rallied: false,
      quests: [],
      powers: [],
      equipped: [],
      slots: 0,
      attackDays: 0
    }
  };
}

describe("Raidstead page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("ecency_raidstead_seen_week", JSON.stringify("1-1")); // no week card
    box.stored = {
      account: "ann",
      token: "rs1_ann",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString()
    };
    api.state.mockResolvedValue(state());
    // a full reset: one-time answers a failed test left unused must not reach the next one
    api.calendar.mockReset().mockResolvedValue(state().calendar);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("ends the game session when the Ecency user logs out", async () => {
    asUser("ann");
    const view = render(<RaidsteadGame />);
    await waitFor(() => expect(api.state).toHaveBeenCalled());
    await screen.findByText("raidstead.alliance.label");
    asUser(null);
    view.rerender(<RaidsteadGame />);
    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(api.signOut).toHaveBeenCalled();
    expect(box.stored).toBeNull();
  });

  it("ends a game session made for an Ecency login that logged out on another page", async () => {
    box.stored = { ...box.stored!, ecency: true };
    asUser(null);
    render(<RaidsteadGame />);
    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(api.signOut).toHaveBeenCalled();
    expect(api.state).not.toHaveBeenCalled();
  });

  it("drops a wallet answer that comes back after the Ecency user switched", async () => {
    box.stored = null;
    asUser("ann");
    let finish!: (s: unknown) => void;
    vi.mocked(signIn).mockReturnValueOnce(new Promise((r) => (finish = r)) as any);
    const view = render(<RaidsteadGame />);
    fireEvent.click(await screen.findByRole("button", { name: /raidstead.signin.play-as/ }));
    asUser("bob");
    view.rerender(<RaidsteadGame />);
    await act(async () => {
      finish({ account: "ann", token: "rs1_ann", expiresAt: expiry(), ecency: true });
    });
    expect(box.stored).toBeNull();
    expect(api.state).not.toHaveBeenCalled();
  });

  it("ignores a state answer that belongs to an earlier game session", async () => {
    asUser("ann");
    let late!: (s: unknown) => void;
    api.state.mockReturnValueOnce(new Promise((r) => (late = r)));
    render(<RaidsteadGame />);
    await waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
    box.stored = { account: "bob", token: "rs1_bob", expiresAt: expiry() };
    await act(async () => {
      late(state());
    });
    expect(screen.queryByRole("button", { name: /raidstead.actions.rally/ })).toBeNull();
  });

  it("offers a retry when the game server cannot be reached", async () => {
    asUser("ann");
    api.state.mockRejectedValueOnce({ status: 0, code: "offline", message: "x" });
    render(<RaidsteadGame />);
    fireEvent.click(await screen.findByRole("button", { name: "g.try-again" }));
    await screen.findByText("raidstead.alliance.label");
  });

  it("retries a spend with the same key after a reload", async () => {
    asUser("ann");
    const first = render(<RaidsteadGame />);
    api.rally.mockRejectedValueOnce({ status: 0, code: "offline", message: "x" });
    const rally = await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    await act(async () => {
      fireEvent.click(rally);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<RaidsteadGame />);
    api.rally.mockResolvedValueOnce({ applied: { energy: 10 }, balance: 400 });
    const again = await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    await act(async () => {
      fireEvent.click(again);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(2));
    expect(api.rally.mock.calls[1][0]).toBe(api.rally.mock.calls[0][0]);
  });

  it("asks for the new game day again when the first ask after midnight fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // a background tab: only the asks for the new day go out, not the regular ones
    tabHidden(true);
    try {
      asUser("ann");
      const past = {
        ...state(),
        calendar: { ...state().calendar, nextDayAt: new Date(Date.now() - 1000).toISOString() }
      };
      api.state.mockResolvedValue(past);
      render(<RaidsteadGame />);
      await screen.findByRole("button", { name: /raidstead.actions.rally/ });
      const before = api.state.mock.calls.length;
      api.state.mockRejectedValueOnce({ status: 0, code: "offline", message: "x" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      expect(api.state.mock.calls.length).toBe(before + 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      expect(api.state.mock.calls.length).toBe(before + 2);
    } finally {
      undoTabHidden();
      vi.useRealTimers();
    }
  });

  it("ends the game session when Ecency logs out in another tab", async () => {
    asUser("ann");
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    localStorage.removeItem("ecency_active_user");
    await act(async () => {
      dispatchEvent(new StorageEvent("storage", { key: "ecency_active_user" }));
    });
    expect(clearSession).toHaveBeenCalled();
    expect(api.signOut).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /raidstead.actions.rally/ })).toBeNull();
  });

  it("does not sign in again in a loop when every new session is refused", async () => {
    asUser("ann");
    vi.mocked(signerFor).mockReturnValue("key");
    let n = 0;
    vi.mocked(signIn).mockImplementation(async () => ({
      account: "ann",
      token: `rs1_ann_${++n}`,
      expiresAt: expiry(),
      ecency: true
    }));
    api.state.mockRejectedValue({ status: 401, code: "unauthorized", message: "x" });
    try {
      render(<RaidsteadGame />);
      await waitFor(() => expect(signIn).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 300));
      expect(vi.mocked(signIn).mock.calls.length).toBeLessThanOrEqual(1);
    } finally {
      vi.mocked(signerFor).mockReturnValue("extension");
      vi.mocked(signIn).mockReset();
    }
  });

  it("keeps a spend's key when a gateway answered instead of games-api", async () => {
    asUser("ann");
    render(<RaidsteadGame />);
    const rally = await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    api.rally.mockRejectedValueOnce({ status: 504, code: "error", message: "x" });
    await act(async () => {
      fireEvent.click(rally);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(1));
    api.rally.mockResolvedValueOnce({ applied: { energy: 10 }, balance: 400 });
    await waitFor(() => expect((rally as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(rally);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(2));
    expect(api.rally.mock.calls[1][0]).toBe(api.rally.mock.calls[0][0]);
  });

  it("does not sign in again as a user who logged out in another tab while loading", async () => {
    asUser("ann");
    box.stored = { ...box.stored!, ecency: true };
    vi.mocked(signerFor).mockReturnValue("key");
    vi.mocked(signIn).mockImplementation(async () => ({
      account: "ann",
      token: "rs1_ann_new",
      expiresAt: expiry(),
      ecency: true
    }));
    let late!: (s: unknown) => void;
    api.state.mockReturnValueOnce(new Promise((r) => (late = r)));
    try {
      render(<RaidsteadGame />);
      await waitFor(() => expect(api.state).toHaveBeenCalledTimes(1));
      localStorage.removeItem("ecency_active_user");
      await act(async () => {
        dispatchEvent(new StorageEvent("storage", { key: "ecency_active_user" }));
      });
      await act(async () => {
        late(state());
      });
      await waitFor(() => expect(signIn).toHaveBeenCalled());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(box.stored).toBeNull();
      expect(screen.queryByRole("button", { name: /raidstead.actions.rally/ })).toBeNull();
    } finally {
      vi.mocked(signerFor).mockReturnValue("extension");
      vi.mocked(signIn).mockReset();
    }
  });

  it("reloads for the new game session when another tab signs in as someone else", async () => {
    asUser(null);
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    const calls = api.state.mock.calls.length;
    let late!: (s: unknown) => void;
    api.state.mockReturnValueOnce(new Promise((r) => (late = r)));
    box.stored = { account: "bob", token: "rs1_bob", expiresAt: expiry() };
    await act(async () => {
      dispatchEvent(new StorageEvent("storage", { key: "ecency_raidstead_session_v2" }));
    });
    // ann's state is gone at once, before bob's arrives
    expect(screen.queryByRole("button", { name: /raidstead.actions.rally/ })).toBeNull();
    expect(api.state.mock.calls.length).toBe(calls + 1);
    await act(async () => {
      late(state());
    });
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
  });

  it("keeps playing when another tab rewrites the same game session", async () => {
    asUser(null);
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    const calls = api.state.mock.calls.length;
    box.stored = { ...box.stored!, expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
    await act(async () => {
      dispatchEvent(new StorageEvent("storage", { key: "ecency_raidstead_session_v2" }));
    });
    expect(screen.getByRole("button", { name: /raidstead.actions.rally/ })).toBeTruthy();
    expect(api.state.mock.calls.length).toBe(calls);
  });

  it("tells who a tapped hero is, and attacks with their type from the card", async () => {
    asUser("ann");
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    const onTap = vi.mocked(createScene).mock.calls.at(-1)![1]!.onTap!;
    api.attack.mockResolvedValueOnce({ damage: 10, weak: false, killed: false });
    await act(async () => {
      onTap({ kind: "hero", hero: "smith" });
    });
    expect(screen.getByText("raidstead.hero-card.smith")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "raidstead.hero-card.attack" }));
    });
    await waitFor(() => expect(api.attack).toHaveBeenCalledWith("forge", 0));
    expect(screen.queryByText("raidstead.hero-card.smith")).toBeNull();
  });

  it("opens a hero's card from a button, without the canvas", async () => {
    asUser("ann");
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    const group = screen.getByRole("group", { name: "raidstead.hero-card.group" });
    const buttons = within(group).getAllByRole("button", { name: "raidstead.hero-card.about" });
    expect(buttons).toHaveLength(4);
    await act(async () => {
      fireEvent.click(buttons[3]);
    });
    expect(screen.getByText("raidstead.hero-card.herald")).toBeTruthy();
  });

  it("gives focus back to the hero button when the card closes", async () => {
    asUser("ann");
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    const group = screen.getByRole("group", { name: "raidstead.hero-card.group" });
    const opener = within(group).getAllByRole("button", { name: "raidstead.hero-card.about" })[1];
    opener.focus();
    await act(async () => {
      fireEvent.click(opener);
    });
    // as in a browser, focus is inside the open dialog when it closes
    const close = screen.getByRole("button", { name: "g.close" });
    close.focus();
    expect(document.activeElement).toBe(close);
    await act(async () => {
      fireEvent.click(close);
    });
    expect(screen.queryByText("raidstead.hero-card.scout")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("shows other alliances as towns in the sky, with a card for each", async () => {
    asUser("ann");
    api.leaderboard.mockResolvedValueOnce({
      season: 1,
      alliances: [
        {
          community: "hive-111",
          title: "Photo Club",
          members: 40,
          kills: 3,
          damage: 900,
          league: "medium"
        },
        {
          community: "hive-123456",
          title: "Ink & Oak",
          members: 30,
          kills: 2,
          damage: 500,
          league: "medium"
        }
      ]
    });
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    expect(api.leaderboard).not.toHaveBeenCalled(); // only once the town opens
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "raidstead.actions.town" }));
    });
    await waitFor(() =>
      expect(scene.sync.mock.calls.at(-1)![0].neighbors).toEqual([
        expect.objectContaining({ community: "hive-111", rank: 1 })
      ])
    );
    const onTap = vi.mocked(createScene).mock.calls.at(-1)![1]!.onTap!;
    await act(async () => {
      onTap({ kind: "town", community: "hive-111" });
    });
    expect(screen.getByRole("heading", { name: "Photo Club" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "raidstead.sky.visit" }).getAttribute("href")).toBe(
      "/created/hive-111"
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "g.close" }));
    });
    // and from the keyboard
    const group = screen.getByRole("group", { name: "raidstead.sky.group" });
    const buttons = within(group).getAllByRole("button", { name: "raidstead.sky.about" });
    expect(buttons).toHaveLength(1);
    await act(async () => {
      fireEvent.click(buttons[0]);
    });
    expect(screen.getByRole("heading", { name: "Photo Club" })).toBeTruthy();
  });

  it("drops a sky list that was asked for an alliance the player has left", async () => {
    asUser("ann");
    let late!: (r: unknown) => void;
    api.leaderboard.mockReturnValueOnce(new Promise((r) => (late = r)));
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "raidstead.actions.town" }));
    });
    await waitFor(() => expect(api.leaderboard).toHaveBeenCalledTimes(1));
    // the player's alliance changes (new season, new account) before it answers
    const moved = state();
    moved.alliance!.community = "hive-999";
    api.state.mockResolvedValue(moved);
    api.rally.mockResolvedValueOnce({ applied: { energy: 10 }, balance: 400 });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "raidstead.actions.raid" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.rally/ }));
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "raidstead.actions.town" }));
    });
    await waitFor(() => expect(api.leaderboard).toHaveBeenCalledTimes(2));
    await act(async () => {
      late({
        season: 1,
        alliances: [
          {
            community: "hive-111",
            title: "Photo Club",
            members: 40,
            kills: 3,
            damage: 9,
            league: "medium"
          }
        ]
      });
    });
    expect(scene.sync.mock.calls.at(-1)![0].neighbors).toEqual([]);
  });

  it("asks for a new sky when a new season starts", async () => {
    asUser("ann");
    api.leaderboard.mockResolvedValueOnce({
      season: 1,
      alliances: [
        {
          community: "hive-111",
          title: "Photo Club",
          members: 40,
          kills: 3,
          damage: 9,
          league: "medium"
        }
      ]
    });
    render(<RaidsteadGame />);
    await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "raidstead.actions.town" }));
    });
    await waitFor(() => expect(scene.sync.mock.calls.at(-1)![0].neighbors).toHaveLength(1));
    expect(api.leaderboard).toHaveBeenLastCalledWith(1);
    // same alliance, next season
    const next = state();
    next.calendar = { ...next.calendar, season: 2, day: 1 };
    api.state.mockResolvedValue(next);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.quests/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /raidstead.quests.claim/ }));
    });
    await waitFor(() => expect(api.leaderboard).toHaveBeenLastCalledWith(2));
    expect(scene.sync.mock.calls.at(-1)![0].neighbors).toEqual([]);
  });

  it("keeps a guest's own session when no Ecency user was ever logged in", async () => {
    asUser(null);
    render(<RaidsteadGame />);
    await waitFor(() => expect(api.state).toHaveBeenCalled());
    expect(clearSession).not.toHaveBeenCalled();
  });

  it("retries a rally with the same key after a network failure, and a new key after an answer", async () => {
    asUser("ann");
    render(<RaidsteadGame />);
    const rally = await screen.findByRole("button", { name: /raidstead.actions.rally/ });
    api.rally.mockRejectedValueOnce({ status: 0, code: "offline", message: "x" });
    await act(async () => {
      fireEvent.click(rally);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(1));
    api.rally.mockResolvedValueOnce({ applied: { energy: 10 }, balance: 400 });
    await waitFor(() => expect((rally as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(rally);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(2));
    expect(api.rally.mock.calls[1][0]).toBe(api.rally.mock.calls[0][0]);
    api.rally.mockRejectedValueOnce({ status: 409, code: "rallied", message: "x" });
    await waitFor(() => expect((rally as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(rally);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(3));
    expect(api.rally.mock.calls[2][0]).not.toBe(api.rally.mock.calls[1][0]);
    // an answer (here a refusal) drops the key: the next try is a new spend
    api.rally.mockRejectedValueOnce({ status: 409, code: "rallied", message: "x" });
    await waitFor(() => expect((rally as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(rally);
    });
    await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(4));
    expect(api.rally.mock.calls[3][0]).not.toBe(api.rally.mock.calls[2][0]);
  });

  describe("playing alongside allies", () => {
    const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const ready = () => screen.findByRole("button", { name: /raidstead.actions.rally/ });
    const attackButton = (type: string) => screen.getByRole("button", { name: new RegExp(`raidstead\\.types\\.${type}`) });
    // Timers the page itself has left. The test DOM starts a 0 ms one of its own
    // for every storage write (its notice to other windows): those go first.
    const pageTimers = async () => {
      await tick(1);
      return vi.getTimerCount();
    };

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      asUser("ann");
    });
    afterEach(() => {
      undoTabHidden();
      vi.useRealTimers();
    });

    it("asks for the state again every 20 seconds while a pest is in town, but not from a background tab", async () => {
      render(<RaidsteadGame />);
      await ready();
      const before = api.state.mock.calls.length;
      await tick(19_000);
      expect(api.state.mock.calls.length).toBe(before);
      await tick(1500);
      expect(api.state.mock.calls.length).toBe(before + 1);
      tabHidden(true);
      await tick(45_000);
      expect(api.state.mock.calls.length).toBe(before + 1);
      // back in front: it catches up at once
      tabHidden(false);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(api.state.mock.calls.length).toBe(before + 2);
    });

    it("asks less often once the week's pest is gone", async () => {
      const gone = state();
      gone.alliance.boss.alive = false;
      api.state.mockResolvedValue(gone);
      render(<RaidsteadGame />);
      await ready();
      const before = api.state.mock.calls.length;
      await tick(45_000);
      expect(api.state.mock.calls.length).toBe(before);
      await tick(16_000);
      expect(api.state.mock.calls.length).toBe(before + 1);
    });

    it("shows an ally's progress when the next answer brings it", async () => {
      render(<RaidsteadGame />);
      await ready();
      expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("100");
      const hit = state();
      hit.alliance.boss.hp = 300;
      api.state.mockResolvedValue(hit);
      await tick(20_500);
      expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("50");
    });

    it("does not spend energy on the wasp before a scout: it says so and asks for the state", async () => {
      const wasp = state();
      wasp.alliance.boss.waspHp = 3;
      Object.assign(wasp.member, { scoutFree: true });
      api.state.mockResolvedValue(wasp);
      render(<RaidsteadGame />);
      await ready();
      const before = api.state.mock.calls.length;
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).not.toHaveBeenCalled();
      expect(scene.attack).not.toHaveBeenCalled();
      expect(screen.getByText("raidstead.toast.wasp-scout-free")).toBeTruthy();
      expect(api.state.mock.calls.length).toBe(before + 1);
      expect(shown("raidstead.energy.value")).toEqual({ n: 5, max: 15 }); // no energy spent
      // a player who keeps tapping is told again, without another ask each time
      await tick(600);
      await act(async () => {
        fireEvent.click(attackButton("signal"));
      });
      expect(api.attack).not.toHaveBeenCalled();
      expect(api.state.mock.calls.length).toBe(before + 1);
      await tick(3000);
      await act(async () => {
        fireEvent.click(attackButton("signal"));
      });
      expect(api.state.mock.calls.length).toBe(before + 2);
      // the scout is offered although the day's scouts could be used up
      const scout = screen.getByRole("button", { name: /raidstead.actions.scout raidstead.actions.scout-wasp/ });
      expect((scout as HTMLButtonElement).disabled).toBe(false);
    });

    it("attacks the wasp once the weakness is scouted", async () => {
      const wasp = state();
      wasp.alliance.boss.waspHp = 3;
      Object.assign(wasp.alliance.boss, { weakness: "ink" });
      api.state.mockResolvedValue(wasp);
      api.attack.mockResolvedValueOnce({ hit: "wasp", dodged: false, waspHp: 2, energy: 4, hp: 600, maxHp: 600 });
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).toHaveBeenCalledWith("ink", 0);
      expect(scene.attack).toHaveBeenCalledWith("ink", "wasp", 0);
    });

    it("says a plain scout is needed when the server does not offer a free one", async () => {
      const wasp = state();
      wasp.alliance.boss.waspHp = 3;
      api.state.mockResolvedValue(wasp);
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).not.toHaveBeenCalled();
      expect(screen.getByText("raidstead.toast.wasp-scout-first")).toBeTruthy();
    });

    it("goes for the other twin while an ally's hit waits, timed by the server's clock", async () => {
      const twins = state();
      Object.assign(twins.alliance.boss, { kind: "twins", echo: { side: 0, by: "bob", until: Date.now() + 5000, hits: 1 } });
      Object.assign(twins, { now: Date.now() });
      api.state.mockResolvedValue(twins);
      api.attack.mockResolvedValue({ hit: "echo", side: 1, energy: 4, hp: 600, maxHp: 600 });
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).toHaveBeenLastCalledWith("ink", 1);
    });

    it("takes its own turn once the ally's hit has run out on the server's clock", async () => {
      const twins = state();
      // this device runs ten seconds behind the server: by its own clock the hit would still wait
      Object.assign(twins.alliance.boss, { kind: "twins", echo: { side: 0, by: "bob", until: Date.now() + 5000, hits: 1 } });
      Object.assign(twins, { now: Date.now() + 10_000 });
      api.state.mockResolvedValue(twins);
      api.attack.mockResolvedValue({ hit: "echo", side: 0, energy: 4, hp: 600, maxHp: 600 });
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).toHaveBeenLastCalledWith("ink", 0);
    });

// ---- town news ----
    // how far ann has read hive-123456's news in season 1 (as the page stores it)
    const NEWS = "ecency_raidstead_news";
    const readUpTo = (mark: number | string, more: Record<string, unknown> = {}) =>
      localStorage.setItem(NEWS, JSON.stringify({ "1:hive-123456:ann": mark, ...more }));
    const marks = () => JSON.parse(localStorage.getItem(NEWS) ?? "{}");
    const withNotes = (notes: unknown[]) => {
      const s = state();
      Object.assign(s.alliance, { notes });
      return s;
    };
    // every answer is a fresh object, as from the network
    const answer = (s: unknown) => api.state.mockImplementation(async () => structuredClone(s));
    // "While you were away" on coming back, "Town news" for what waited while the player was here
    const newsCard = () => screen.queryByRole("dialog", { name: /^raidstead\.news\.(away|title)$/ });
    const toast = () => document.querySelector(".rs-toast")!.textContent;
    const copied = { seq: 1, day: 1, kind: "copied", n: 45, text: "x" };
    const killedByBob = { seq: 2, day: 2, kind: "killed", what: "beetle", who: "bob", text: "x" };
    const chestByAnn = { seq: 3, day: 2, kind: "chest", who: "ann", text: "x" };
    const chestByCat = { seq: 3, day: 2, kind: "chest", who: "cat", text: "x" };

    it("tells what happened while the player was away once, as a card", async () => {
      readUpTo(0);
      answer(withNotes([copied, killedByBob, chestByAnn]));
      const first = render(<RaidsteadGame />);
      const card = await screen.findByRole("dialog", { name: "raidstead.news.away" });
      // newest first, without the player's own doing
      expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
        "raidstead.news.day raidstead.news.killed",
        "raidstead.news.day raidstead.news.copied"
      ]);
      await act(async () => {
        fireEvent.click(within(card).getByRole("button", { name: "raidstead.news.ok" }));
      });
      expect(newsCard()).toBeNull();
      expect(marks()["1:hive-123456:ann"]).toBe(3);
      first.unmount();
      // seen: a reload does not tell it again, and neither does the next ask
      render(<RaidsteadGame />);
      await ready();
      await tick(20_500);
      expect(newsCard()).toBeNull();
      expect(toast()).toBe("");
    });

    it("starts the news from now for a member who has just joined, or on a new device", async () => {
      answer(withNotes([copied, killedByBob]));
      render(<RaidsteadGame />);
      await ready();
      await tick(50);
      // what is on the list happened before: no card, nothing told
      expect(newsCard()).toBeNull();
      expect(toast()).toBe("");
      expect(marks()["1:hive-123456:ann"]).toBe(2);
      answer(withNotes([copied, killedByBob, chestByCat]));
      await tick(20_500);
      expect(toast()).toBe("raidstead.news.chest");
    });

    it("tells one line that arrives while playing as a toast, and never the player's own doing", async () => {
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      const own = { seq: 1, day: 3, kind: "killed", what: "beetle", who: "ann", text: "x" };
      answer(withNotes([own]));
      await tick(20_500);
      expect(toast()).toBe("");
      expect(marks()["1:hive-123456:ann"]).toBe(1);
      answer(withNotes([own, { seq: 2, day: 3, kind: "chest", who: "bob", text: "x" }]));
      await tick(20_500);
      expect(toast()).toBe("raidstead.news.chest");
      expect(newsCard()).toBeNull();
      expect(marks()["1:hive-123456:ann"]).toBe(2);
    });

    it("tells several lines that arrive together as a card, so none is lost", async () => {
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      answer(withNotes([copied, killedByBob]));
      await tick(20_500);
      // the player was here all along: the card does not say they were away
      const card = await screen.findByRole("dialog", { name: "raidstead.news.title" });
      expect(within(card).getAllByRole("listitem")).toHaveLength(2);
    });

    it("keeps a line of news up next to an attack's own message", async () => {
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      answer(withNotes([{ seq: 1, day: 3, kind: "chest", who: "bob", text: "x" }]));
      await tick(20_500);
      expect(toast()).toBe("raidstead.news.chest");
      api.attack.mockResolvedValueOnce({ hit: "boss", damage: 6, weak: false, paired: null, killed: false, phaseShift: false, gnatsSpawned: 0, waspArrived: false, energy: 4, hp: 594, maxHp: 600 });
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      // the hit's message does not wipe the news the player has had half a second to read
      expect(toast()).toBe("raidstead.toast.hit raidstead.news.chest");
      await tick(8000);
      expect(toast()).toBe("");
    });

    it("holds a single line that arrives with a new week until the week's card is closed", async () => {
      readUpTo(0);
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      const next = withNotes([{ seq: 1, day: 8, kind: "escaped", what: "beetle", text: "x" }]);
      Object.assign(next.alliance, { week: 2 });
      Object.assign(next.alliance.boss, { kind: "slug" });
      Object.assign(next.calendar, { week: 2, day: 8 });
      answer(next);
      await tick(20_500);
      const week = await screen.findByRole("dialog", { name: "raidstead.bosses.slug.name" });
      expect(toast()).toBe("");                // not said behind the card
      expect(marks()["1:hive-123456:ann"]).toBe(0);
      await act(async () => {
        fireEvent.click(within(week).getByRole("button", { name: "raidstead.boss.go" }));
      });
      const card = await screen.findByRole("dialog", { name: "raidstead.news.title" });
      expect(within(card).getByText(/raidstead.news.escaped/)).toBeTruthy();
    });

    it("keeps news that arrives in a background tab for when the tab shows again", async () => {
      const midnight = withNotes([]);
      midnight.calendar.nextDayAt = new Date(Date.now() + 1000).toISOString();
      answer(midnight);
      render(<RaidsteadGame />);
      await ready();
      tabHidden(true);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      // the new day's ask still goes out from a background tab, and brings the night's news
      const morning = withNotes([{ seq: 1, day: 3, kind: "webbed", what: "tower", text: "x" }]);
      morning.calendar.nextDayAt = new Date(Date.now() + 86_400_000).toISOString();
      answer(morning);
      await tick(31_000);
      expect(toast()).toBe("");                // not said to nobody
      expect(newsCard()).toBeNull();
      expect(marks()["1:hive-123456:ann"]).toBe(0); // and not counted as read
      tabHidden(false);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const card = await screen.findByRole("dialog", { name: "raidstead.news.title" });
      expect(within(card).getByText(/raidstead.news.webbed/)).toBeTruthy();
      expect(marks()["1:hive-123456:ann"]).toBe(1);
    });

    it("does not show news kept in a background tab when another tab has shown it meanwhile", async () => {
      const midnight = withNotes([]);
      midnight.calendar.nextDayAt = new Date(Date.now() + 1000).toISOString();
      answer(midnight);
      render(<RaidsteadGame />);
      await ready();
      tabHidden(true);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const morning = withNotes([copied, killedByBob]);
      morning.calendar.nextDayAt = new Date(Date.now() + 86_400_000).toISOString();
      answer(morning);
      await tick(31_000);
      // the player reads both lines in another tab, then comes back to this one
      readUpTo(2);
      tabHidden(false);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await tick(50);
      expect(newsCard()).toBeNull();
      expect(marks()["1:hive-123456:ann"]).toBe(2);
    });

    it("shows only what another tab has not, when it has shown part of what waited here", async () => {
      const midnight = withNotes([]);
      midnight.calendar.nextDayAt = new Date(Date.now() + 1000).toISOString();
      answer(midnight);
      render(<RaidsteadGame />);
      await ready();
      tabHidden(true);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const morning = withNotes([copied, killedByBob]);
      morning.calendar.nextDayAt = new Date(Date.now() + 86_400_000).toISOString();
      answer(morning);
      await tick(31_000);
      readUpTo(1);
      tabHidden(false);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const card = await screen.findByRole("dialog", { name: "raidstead.news.title" });
      expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["raidstead.news.day raidstead.news.killed"]);
    });

    it("holds news that arrives while another card is open until it is closed", async () => {
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.quests/ }));
      });
      answer(withNotes([killedByBob]));
      await tick(20_500);
      expect(toast()).toBe("");                // a toast would sit behind the open card
      expect(newsCard()).toBeNull();
      // the next answer repeats that line and adds one: each is told once
      answer(withNotes([killedByBob, chestByCat]));
      await tick(20_500);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "g.close" }));
      });
      const card = await screen.findByRole("dialog", { name: "raidstead.news.title" });
      expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
        "raidstead.news.day raidstead.news.chest",
        "raidstead.news.day raidstead.news.killed"
      ]);
      expect(marks()["1:hive-123456:ann"]).toBe(3);
    });

    it("keeps a line waiting for its card when the next answer brings only the player's own doing", async () => {
      readUpTo(0);
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.quests/ }));
      });
      answer(withNotes([killedByBob]));
      await tick(20_500);                      // bob's line waits behind the card
      // an answer that no longer lists it, only the player's own later doing
      answer(withNotes([chestByAnn]));
      await tick(20_500);
      expect(marks()["1:hive-123456:ann"]).toBe(0);   // not read past what is still waiting
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "g.close" }));
      });
      const card = await screen.findByRole("dialog", { name: "raidstead.news.title" });
      expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["raidstead.news.day raidstead.news.killed"]);
    });

    it("does not open one alliance's waiting news when the next render brings another alliance", async () => {
      readUpTo(0, { "1:hive-999:ann": 0 });
      const midnight = withNotes([]);
      midnight.calendar.nextDayAt = new Date(Date.now() + 1000).toISOString();
      answer(midnight);
      render(<RaidsteadGame />);
      await ready();
      tabHidden(true);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      // two lines wait in the background tab
      const morning = withNotes([copied, killedByBob]);
      morning.calendar.nextDayAt = new Date(Date.now() + 86_400_000).toISOString();
      answer(morning);
      await tick(31_000);
      // the tab shows again and, in the same render, the page is on another alliance with a line of its own
      const moved = withNotes([{ seq: 1, day: 3, kind: "webbed", what: "tower", text: "x" }]);
      moved.alliance.community = "hive-999";
      moved.calendar.nextDayAt = morning.calendar.nextDayAt;
      answer(moved);
      tabHidden(false);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await tick(50);
      const card = await screen.findByRole("dialog", { name: /^raidstead\.news\.(away|title)$/ });
      expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["raidstead.news.day raidstead.news.webbed"]);
      expect(marks()).toEqual({ "1:hive-123456:ann": 0, "1:hive-999:ann": 1 });
    });

    it("starts no message timer for an answer that comes back after the page closed", async () => {
      const view = render(<RaidsteadGame />);
      await ready();
      let done!: (r: unknown) => void;
      api.rally.mockReturnValueOnce(new Promise((r) => (done = r)));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.rally/ }));
      });
      view.unmount();
      await act(async () => {
        done({ applied: { energy: 10 }, balance: 400 });
      });
      expect(await pageTimers()).toBe(0);
    });

    it("stops both message timers when the page closes", async () => {
      answer(withNotes([]));
      const view = render(<RaidsteadGame />);
      await ready();
      answer(withNotes([{ seq: 1, day: 3, kind: "chest", who: "bob", text: "x" }]));
      await tick(20_500);
      expect(toast()).toBe("raidstead.news.chest");
      api.attack.mockResolvedValueOnce({ hit: "boss", damage: 6, weak: false, paired: null, killed: false, phaseShift: false, gnatsSpawned: 0, waspArrived: false, energy: 4, hp: 594, maxHp: 600 });
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      view.unmount();
      expect(await pageTimers()).toBe(0);
    });

    it("does not open waiting news on the way out when the player signs out", async () => {
      readUpTo(0);
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.menu/ }));
      });
      answer(withNotes([killedByBob]));
      await tick(20_500);                      // news waits behind the menu
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "raidstead.signin.sign-out" }));
      });
      await tick(50);
      expect(newsCard()).toBeNull();
      expect(marks()["1:hive-123456:ann"]).toBe(0);   // not read: it is told at the next visit
    });

    it("closes a card that was open for a session that is no longer the Ecency user's", async () => {
      readUpTo(0);
      answer(withNotes([copied]));
      const view = render(<RaidsteadGame />);
      await screen.findByRole("dialog", { name: "raidstead.news.away" });
      // another Ecency user on this tab: ann's game session ends, and bob signs in for his own
      asUser("bob");
      view.rerender(<RaidsteadGame />);
      await waitFor(() => expect(clearSession).toHaveBeenCalled());
      box.stored = { account: "bob", token: "rs1_bob", expiresAt: expiry(), ecency: true };
      const bobs = withNotes([]);
      bobs.account.name = "bob";
      answer(bobs);
      vi.mocked(signIn).mockResolvedValueOnce(box.stored as never);
      await act(async () => {
        fireEvent.click(await screen.findByRole("button", { name: /raidstead.signin.play-as/ }));
      });
      await ready();
      await tick(50);
      expect(newsCard()).toBeNull();           // ann's town news is not shown to bob
    });

    it("keeps lines an older server sent once, behind an open card, through its next empty answers", async () => {
      const line = (day: number, text: string) => ({ day, text });
      answer(withNotes([line(1, "Yesterday's line.")]));
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.quests/ }));
      });
      // that server sends news only on the request that rolled the day
      answer(withNotes([line(2, "The beetle copied itself.")]));
      await tick(20_500);
      answer(withNotes([]));
      await tick(20_500);
      await tick(20_500);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "g.close" }));
      });
      const card = await screen.findByRole("dialog", { name: "raidstead.news.title" });
      expect(within(card).getByText(/The beetle copied itself\./)).toBeTruthy();
    });

    it("never moves the mark back when another tab reads further between its look and its write", async () => {
      readUpTo(0);
      answer(withNotes([]));
      render(<RaidsteadGame />);
      await ready();
      await tick(50);                          // the first state has been looked at
      // from now on the shared mark reads 5 (another tab), except for this page's next look
      const real = Storage.prototype.getItem;
      let looks = 0;
      const written: string[] = [];
      const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, k: string) {
        if (k !== NEWS) return real.call(this, k);
        return JSON.stringify({ "1:hive-123456:ann": looks++ === 0 ? 0 : 5 });
      });
      const realSet = Storage.prototype.setItem;
      const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
        if (k === NEWS) written.push(v);
        return realSet.call(this, k, v);
      });
      try {
        answer(withNotes([{ seq: 1, day: 3, kind: "chest", who: "bob", text: "x" }]));
        await tick(20_500);
        expect(toast()).toBe("raidstead.news.chest");
        expect(written.map((w) => JSON.parse(w)["1:hive-123456:ann"])).toEqual([5]);
      } finally {
        get.mockRestore();
        set.mockRestore();
      }
    });

    it("shows the week's card first, then the news", async () => {
      localStorage.removeItem("ecency_raidstead_seen_week");
      readUpTo(0);
      answer(withNotes([copied]));
      render(<RaidsteadGame />);
      const week = await screen.findByRole("dialog", { name: "raidstead.bosses.beetle.name" });
      expect(newsCard()).toBeNull();
      await act(async () => {
        fireEvent.click(within(week).getByRole("button", { name: "raidstead.boss.go" }));
      });
      expect(await screen.findByRole("dialog", { name: "raidstead.news.away" })).toBeTruthy();
    });

    it("still tells the news after a reload that came before the week's card was closed", async () => {
      localStorage.removeItem("ecency_raidstead_seen_week");
      readUpTo(0);
      answer(withNotes([copied]));
      const first = render(<RaidsteadGame />);
      await screen.findByRole("dialog", { name: "raidstead.bosses.beetle.name" });
      expect(marks()["1:hive-123456:ann"]).toBe(0);   // news not shown yet is not read yet
      first.unmount();
      render(<RaidsteadGame />);
      expect(await screen.findByRole("dialog", { name: "raidstead.news.away" })).toBeTruthy();
    });

    it("does not carry news waiting for one alliance over to another", async () => {
      localStorage.removeItem("ecency_raidstead_seen_week");
      readUpTo(0);
      answer(withNotes([copied]));
      render(<RaidsteadGame />);
      const week = await screen.findByRole("dialog", { name: "raidstead.bosses.beetle.name" });
      // the news waits behind the week's card when the page learns of another alliance
      const moved = withNotes([]);
      moved.alliance.community = "hive-999";
      answer(moved);
      await tick(20_500);
      await act(async () => {
        fireEvent.click(within(week).getByRole("button", { name: "raidstead.boss.go" }));
      });
      await tick(50);
      expect(newsCard()).toBeNull();
    });

    it("shows another alliance only its own news, even when it has news of its own to tell", async () => {
      localStorage.removeItem("ecency_raidstead_seen_week");
      readUpTo(0, { "1:hive-999:ann": 0 });
      answer(withNotes([copied]));
      render(<RaidsteadGame />);
      const week = await screen.findByRole("dialog", { name: "raidstead.bosses.beetle.name" });
      // the first alliance's line waits behind the week's card; then the page is on another alliance
      const moved = withNotes([{ seq: 1, day: 2, kind: "webbed", what: "tower", text: "x" }]);
      moved.alliance.community = "hive-999";
      answer(moved);
      await tick(20_500);
      await act(async () => {
        fireEvent.click(within(week).getByRole("button", { name: "raidstead.boss.go" }));
      });
      const card = await screen.findByRole("dialog", { name: /^raidstead\.news\.(away|title)$/ });
      expect(within(card).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["raidstead.news.day raidstead.news.webbed"]);
      expect(marks()).toEqual({ "1:hive-123456:ann": 0, "1:hive-999:ann": 1 });
    });

    it("does not repeat news when the browser refuses to store how far the player has read", async () => {
      readUpTo(0);
      const real = Storage.prototype.setItem;
      const refuse = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
        if (k === NEWS) throw new Error("quota exceeded");
        return real.call(this, k, v);
      });
      try {
        answer(withNotes([copied]));
        render(<RaidsteadGame />);
        const card = await screen.findByRole("dialog", { name: "raidstead.news.away" });
        await act(async () => {
          fireEvent.click(within(card).getByRole("button", { name: "raidstead.news.ok" }));
        });
        for (let i = 0; i < 3; i++) {
          await tick(20_500);
          expect(newsCard()).toBeNull();
          expect(toast()).toBe("");
        }
      } finally {
        refuse.mockRestore();
      }
    });

    it("tells nothing again when an answer is older than what another tab has shown", async () => {
      readUpTo(3);                             // another tab has shown the first three lines
      answer(withNotes([copied, killedByBob]));
      render(<RaidsteadGame />);
      await ready();
      await tick(50);
      expect(newsCard()).toBeNull();
      expect(toast()).toBe("");
      expect(marks()["1:hive-123456:ann"]).toBe(3);   // the mark does not move back
    });

    it("keeps every account's own mark, and only this season's", async () => {
      readUpTo(0, { "1:hive-777:cat": 5, "0:hive-123456:ann": 9 });
      answer(withNotes([copied]));
      render(<RaidsteadGame />);
      const card = await screen.findByRole("dialog", { name: "raidstead.news.away" });
      await act(async () => {
        fireEvent.click(within(card).getByRole("button", { name: "raidstead.news.ok" }));
      });
      expect(marks()).toEqual({ "1:hive-123456:ann": 1, "1:hive-777:cat": 5 });
    });

    it("works with a server that does not number its news", async () => {
      const line = (day: number, text: string) => ({ day, text });
      answer(withNotes([line(1, "The beetle copied itself.")]));
      render(<RaidsteadGame />);
      await ready();
      await tick(50);
      expect(newsCard()).toBeNull();           // the first state: the news starts from now
      answer(withNotes([line(1, "The beetle copied itself."), line(2, "The Drama Spider webbed your tower.")]));
      await tick(20_500);
      expect(toast()).toBe("The Drama Spider webbed your tower.");
      await tick(20_500);
      expect(newsCard()).toBeNull();
    });

    it("keeps the town's news in the Library", async () => {
      readUpTo(1);
      answer(withNotes([{ seq: 1, day: 2, kind: "webbed", what: "tower", text: "x" }]));
      render(<RaidsteadGame />);
      await ready();
      const onTap = vi.mocked(createScene).mock.calls.at(-1)![1]!.onTap!;
      await act(async () => {
        onTap({ kind: "building", id: "library" });
      });
      const card = screen.getByRole("dialog", { name: "raidstead.town.buildings.library.name" });
      expect(within(card).getByRole("heading", { name: "raidstead.news.title" })).toBeTruthy();
      expect(within(card).getByText(/raidstead.news.webbed/)).toBeTruthy();
      // the Library does this at any stage: it is not waiting to be finished
      expect(within(card).queryByText(/raidstead.town.works-when-finished/)).toBeNull();
    });

    // ---- the page's own asks ----
    it("says nothing when one of its own regular asks fails", async () => {
      render(<RaidsteadGame />);
      await ready();
      api.state.mockRejectedValue({ status: 502, code: "error", message: "x" });
      await tick(20_500);
      await tick(20_500);
      expect(toast()).toBe("");
      // an action that went through keeps its own message when the ask after it fails:
      // "something went wrong, try again" would invite a second rally
      api.rally.mockResolvedValueOnce({ applied: { energy: 10 }, balance: 400 });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.rally/ }));
      });
      await waitFor(() => expect(toast()).toBe("raidstead.toast.rally"));
      // an action that fails is told
      api.rally.mockRejectedValueOnce({ status: 409, code: "rallied", message: "You already rallied today." });
      await waitFor(() => expect((screen.getByRole("button", { name: /raidstead.actions.rally/ }) as HTMLButtonElement).disabled).toBe(false));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.rally/ }));
      });
      await waitFor(() => expect(toast()).toBe("You already rallied today."));
    });

    it("does not end the session on a refusal older than an answer already applied", async () => {
      render(<RaidsteadGame />);
      await ready();
      let refuse!: (e: unknown) => void;
      api.state.mockReturnValueOnce(new Promise((_, reject) => (refuse = reject)));
      await tick(20_500);                      // a regular ask is on its way
      // the player acts, and the ask after the action answers first
      api.rally.mockResolvedValueOnce({ applied: { energy: 10 }, balance: 400 });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.rally/ }));
      });
      await waitFor(() => expect(toast()).toBe("raidstead.toast.rally"));
      await act(async () => {
        refuse({ status: 401, code: "unauthorized", message: "x" });
      });
      expect(clearSession).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /raidstead.actions.rally/ })).toBeTruthy();
      // a refusal to the newest ask still ends it
      api.state.mockRejectedValue({ status: 401, code: "unauthorized", message: "x" });
      await tick(20_500);
      expect(clearSession).toHaveBeenCalled();
    });

    it("does not ask again when the tab shows right after an ask", async () => {
      render(<RaidsteadGame />);
      await ready();
      const before = api.state.mock.calls.length;
      await tick(20_500);
      expect(api.state.mock.calls.length).toBe(before + 1);
      tabHidden(true);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      tabHidden(false);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(api.state.mock.calls.length).toBe(before + 1);
    });

    it("asks once, not twice, when a background tab shows again after midnight", async () => {
      const late = state();
      late.calendar.nextDayAt = new Date(Date.now() + 1000).toISOString();
      api.state.mockResolvedValue(late);
      render(<RaidsteadGame />);
      await ready();
      tabHidden(true);
      await tick(25_000);                      // past midnight, and a regular ask is overdue too
      const before = api.state.mock.calls.length;
      tabHidden(false);
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(api.state.mock.calls.length).toBe(before + 1);
    });

    it("does not put spent energy back when an ask from before the tap answers late", async () => {
      const one = state();
      one.member.energy = 1;
      api.state.mockResolvedValue(one);
      render(<RaidsteadGame />);
      await ready();
      let late!: (s: unknown) => void;
      api.state.mockReturnValueOnce(new Promise((r) => (late = r)));
      await tick(20_500);                      // a regular ask is on its way
      const zero = state();
      zero.member.energy = 0;
      api.state.mockResolvedValue(zero);
      let landed!: (r: unknown) => void;
      api.attack.mockReturnValueOnce(new Promise((r) => (landed = r)));
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(shown("raidstead.energy.value")).toEqual({ n: 0, max: 15 });
      // the answer from before the tap arrives while the attack is still on its way:
      // it says one energy, and would offer a second attack the server refuses
      await act(async () => {
        late(one);
      });
      expect(shown("raidstead.energy.value")).toEqual({ n: 0, max: 15 });
      expect((attackButton("ink") as HTMLButtonElement).disabled).toBe(true);
      await act(async () => {
        landed({ hit: "boss", damage: 6, weak: false, paired: null, killed: false, phaseShift: false, gnatsSpawned: 0, waspArrived: false, energy: 0, hp: 594, maxHp: 600 });
      });
      expect(shown("raidstead.energy.value")).toEqual({ n: 0, max: 15 });
    });

    it("says the Queen reshuffled whichever ask brings it", async () => {
      const t0 = Date.now();
      const queen = (counting: boolean) => {
        const s = state();
        Object.assign(s.alliance.boss, { kind: "queen", weakness: counting ? "ink" : null, reshuffleAt: counting ? t0 + 15_000 : null });
        s.alliance.week = 4;
        return s;
      };
      localStorage.setItem("ecency_raidstead_seen_week", JSON.stringify("1-4"));
      // she reshuffles 19.7 s in: her own asks (15 s, 17 s, 19 s) find her counting, the regular ask at 20 s does not
      api.state.mockImplementation(async () => queen(Date.now() - t0 < 19_700));
      render(<RaidsteadGame />);
      await ready();
      await tick(19_400);
      expect(toast()).toBe("");
      await tick(1200);
      expect(toast()).toBe("raidstead.toast.queen-shuffled");
    });

    it("does not say the Queen reshuffled when her countdown ends with the day or with her", async () => {
      const queen = (patch: Record<string, unknown>, day = 23) => {
        const s = state();
        Object.assign(s.alliance.boss, { kind: "queen", weakness: "ink", reshuffleAt: Date.now() + 15_000, ...patch });
        s.alliance.week = 4;
        s.calendar.day = day;
        return s;
      };
      localStorage.setItem("ecency_raidstead_seen_week", JSON.stringify("1-4"));
      answer(queen({}));
      render(<RaidsteadGame />);
      await ready();
      answer(queen({ reshuffleAt: null, weakness: null }, 24));   // a new day ends her countdown
      await tick(15_500);
      expect(toast()).toBe("");
      // she is scouted again on the new day, then chased off while counting
      answer(queen({}, 24));
      await tick(20_500);
      expect(screen.getByText(/raidstead.boss.reshuffle/)).toBeTruthy();
      answer(queen({ reshuffleAt: null, alive: false, killed: true }, 24));
      await tick(20_500);
      expect(screen.getByText("raidstead.boss.chased")).toBeTruthy();
      expect(toast()).toBe("");
    });

    it("lets an attack through right after a scout, before the state has been asked again", async () => {
      const wasp = state();
      wasp.alliance.boss.waspHp = 3;
      Object.assign(wasp.member, { scoutFree: true });
      api.state.mockResolvedValue(wasp);
      render(<RaidsteadGame />);
      await ready();
      api.scout.mockResolvedValueOnce({ weakness: "ink", scoutsLeft: 0 });
      api.state.mockReturnValueOnce(new Promise(() => undefined));   // the ask after the scout is still on its way
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.scout raidstead.actions.scout-wasp/ }));
      });
      api.attack.mockResolvedValueOnce({ hit: "wasp", dodged: false, waspHp: 2, energy: 4, hp: 600, maxHp: 600 });
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).toHaveBeenCalledWith("ink", 0);
    });

    it("does not forget a scout when an ask from before it answers afterwards", async () => {
      const wasp = state();
      wasp.alliance.boss.waspHp = 3;
      Object.assign(wasp.member, { scoutFree: true });
      api.state.mockResolvedValue(wasp);
      render(<RaidsteadGame />);
      await ready();
      let late!: (s: unknown) => void;
      api.state.mockReturnValueOnce(new Promise((r) => (late = r)));
      await tick(20_500);                      // a regular ask is on its way
      api.scout.mockResolvedValueOnce({ weakness: "ink", scoutsLeft: 0 });
      api.state.mockReturnValueOnce(new Promise(() => undefined));   // so is the ask after the scout
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.scout raidstead.actions.scout-wasp/ }));
      });
      await act(async () => {
        late(structuredClone(wasp));           // from before the scout: it still says "not scouted"
      });
      api.attack.mockResolvedValueOnce({ hit: "wasp", dodged: false, waspHp: 2, energy: 4, hp: 600, maxHp: 600 });
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).toHaveBeenCalledWith("ink", 0);
    });

    it("goes for the other twin by its own clock when the server does not send one", async () => {
      const twins = state();
      Object.assign(twins.alliance.boss, { kind: "twins", echo: { side: 0, by: "bob", until: Date.now() + 5000 } });
      api.state.mockResolvedValue(twins);
      api.attack.mockResolvedValue({ hit: "echo", side: 1, energy: 4, hp: 600, maxHp: 600 });
      render(<RaidsteadGame />);
      await ready();
      await act(async () => {
        fireEvent.click(attackButton("ink"));
      });
      expect(api.attack).toHaveBeenLastCalledWith("ink", 1);
    });

    it("says a pest that is gone without being chased off got away", async () => {
      const gone = state();
      Object.assign(gone.alliance.boss, { alive: false, killed: false });
      api.state.mockResolvedValue(gone);
      render(<RaidsteadGame />);
      await ready();
      expect(screen.getByText("raidstead.boss.escaped")).toBeTruthy();
      expect(screen.queryByText("raidstead.boss.chased")).toBeNull();
    });
  });

  describe("Points are never taken for nothing", () => {
    const rallyButton = () => screen.findByRole("button", { name: /raidstead.actions.rally/ }) as Promise<HTMLButtonElement>;
    const openChest = async () => {
      await rallyButton();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /raidstead.actions.quests/ }));
      });
      return screen.getByRole("button", { name: "raidstead.quests.donate" }) as HTMLButtonElement;
    };

    beforeEach(() => asUser("ann"));

    it("offers no rally without room for all of its energy", async () => {
      const full = state();
      full.member.energy = 11;
      api.state.mockResolvedValue(full);
      render(<RaidsteadGame />);
      const rally = await rallyButton();
      expect(rally.disabled).toBe(true);
      expect(rally.textContent).toContain("raidstead.actions.rally-full");
    });

    it("offers a rally with exactly enough room", async () => {
      const room = state();
      room.member.energy = 10;
      api.state.mockResolvedValue(room);
      render(<RaidsteadGame />);
      const rally = await rallyButton();
      expect(rally.disabled).toBe(false);
      expect(rally.textContent).toContain("raidstead.actions.rally-cost");
    });

    it("offers no rally once the week's pest is gone, from the button or the Herald's card", async () => {
      const gone = state();
      gone.alliance.boss.alive = false;
      api.state.mockResolvedValue(gone);
      render(<RaidsteadGame />);
      const rally = await rallyButton();
      expect(rally.disabled).toBe(true);
      expect(rally.textContent).toContain("raidstead.actions.rally-no-boss");
      const group = screen.getByRole("group", { name: "raidstead.hero-card.group" });
      await act(async () => {
        fireEvent.click(within(group).getAllByRole("button", { name: "raidstead.hero-card.about" })[3]);
      });
      expect(screen.getByText("raidstead.hero-card.rally-no-boss")).toBeTruthy();
      const fromCard = screen.getByRole("button", { name: /raidstead.actions.rally · raidstead.actions.rally-cost/ });
      expect((fromCard as HTMLButtonElement).disabled).toBe(true);
    });

    it("takes a chest gift while the pest is gone: it is kept for the next one", async () => {
      const gone = state();
      gone.alliance.boss.alive = false;
      api.state.mockResolvedValue(gone);
      render(<RaidsteadGame />);
      const donate = await openChest();
      expect(donate.disabled).toBe(false);
      api.chest.mockResolvedValueOnce({ applied: { chest: 0, filled: true, buffUntil: null, kept: true }, balance: 300 });
      await act(async () => {
        fireEvent.click(donate);
      });
      await waitFor(() => expect(screen.getByText("raidstead.toast.chest-kept")).toBeTruthy());
    });

    it("closes the chest while it pays out, while a full one is kept, and after the season's last pest", async () => {
      const active = state();
      Object.assign(active.alliance, { buffToday: true, buffUntil: Date.now() + 3_600_000 });
      api.state.mockResolvedValue(active);
      const first = render(<RaidsteadGame />);
      expect((await openChest()).disabled).toBe(true);
      expect(screen.getByText("raidstead.quests.chest-active-until")).toBeTruthy();
      first.unmount();

      const kept = state();
      Object.assign(kept.alliance, { buffKept: true });
      api.state.mockResolvedValue(kept);
      const second = render(<RaidsteadGame />);
      expect((await openChest()).disabled).toBe(true);
      expect(screen.getByText("raidstead.quests.chest-kept")).toBeTruthy();
      second.unmount();

      const last = state();
      last.alliance.week = 4;
      last.alliance.boss.alive = false;
      localStorage.setItem("ecency_raidstead_seen_week", JSON.stringify("1-4"));
      api.state.mockResolvedValue(last);
      render(<RaidsteadGame />);
      expect((await openChest()).disabled).toBe(true);
      expect(screen.getByText("raidstead.quests.chest-closed")).toBeTruthy();
    });

    it("says what a gift does when no pest is in town, shows a kept chest as full and closes it while the season rests", async () => {
      const gone = state();
      gone.alliance.boss.alive = false;
      gone.alliance.chest = 250;
      api.state.mockResolvedValue(gone);
      const first = render(<RaidsteadGame />);
      await openChest();
      expect(screen.getByText("raidstead.quests.chest-desc-kept")).toBeTruthy();
      expect(screen.queryByText("raidstead.quests.chest-desc")).toBeNull();
      expect(shown("raidstead.quests.chest-bar")).toEqual({ n: (250).toLocaleString() });
      first.unmount();

      const kept = state();
      Object.assign(kept.alliance, { buffKept: true, chest: 0 });
      api.state.mockResolvedValue(kept);
      const second = render(<RaidsteadGame />);
      await openChest();
      // the server has put the 1,000 aside: the card must not read "full" over "0 / 1,000"
      expect(shown("raidstead.quests.chest-bar")).toEqual({ n: (1000).toLocaleString() });
      second.unmount();

      const resting = state();
      resting.calendar = { ...resting.calendar, resting: true, day: 29 };
      resting.alliance.boss.alive = false;
      api.state.mockResolvedValue(resting);
      render(<RaidsteadGame />);
      expect((await openChest()).disabled).toBe(true);
      expect(screen.getByText("raidstead.quests.chest-resting")).toBeTruthy();
    });

    it.each(["points_unavailable", "unavailable"])(
      "drops a spend's key when games-api itself says Points could not be reached (%s)",
      async (code) => {
        render(<RaidsteadGame />);
        const rally = await rallyButton();
        api.rally.mockRejectedValueOnce({ status: 503, code, message: "x" });
        await act(async () => {
          fireEvent.click(rally);
        });
        await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(1));
        api.rally.mockResolvedValueOnce({ applied: { energy: 10 }, balance: 400 });
        await waitFor(() => expect(rally.disabled).toBe(false));
        await act(async () => {
          fireEvent.click(rally);
        });
        await waitFor(() => expect(api.rally).toHaveBeenCalledTimes(2));
        // that key was given back (or never charged) and is used up: the next tap is a new spend
        expect(api.rally.mock.calls[1][0]).not.toBe(api.rally.mock.calls[0][0]);
      }
    );
  });

  describe("before the first season", () => {
    const soon = (ms: number) => ({ season: 0, day: 0, week: 0, resting: true, startsAt: new Date(Date.now() + ms).toISOString(), nextDayAt: "" });
    const region = () => screen.queryByRole("region", { name: "raidstead.season.countdown-title" });
    const signInButton = () => screen.queryByRole("button", { name: /raidstead.signin.play-as/ });
    const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      // no spread: the ask at zero goes out at once, retries every 5s
      vi.spyOn(Math, "random").mockReturnValue(0);
      box.stored = null;
      asUser("ann");
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.mocked(Math.random).mockRestore();
    });

    it("counts down without asking anyone to sign in, and never flashes the sign-in first", async () => {
      let answer!: (c: unknown) => void;
      api.calendar.mockReturnValue(new Promise((r) => (answer = r)));
      render(<RaidsteadGame />);
      await tick(50);
      // the calendar has not answered yet: no sign-in sheet in the meantime
      expect(signInButton()).toBeNull();

      await act(async () => answer(soon(3 * 86_400_000 + 5 * 3_600_000)));
      await tick(50);
      expect(within(region()!).getByRole("timer").textContent).toMatch(/^03 raidstead.season.countdown-days(04|05) raidstead.season.countdown-hours/);
      expect(signInButton()).toBeNull();
      expect(api.state).not.toHaveBeenCalled();
    });

    it("opens the field guide from the countdown, with no game state yet", async () => {
      api.calendar.mockResolvedValue(soon(3 * 86_400_000));
      render(<RaidsteadGame />);
      await tick(50);
      fireEvent.click(within(region()!).getByRole("button", { name: "raidstead.guide.open" }));
      const guide = screen.getByRole("dialog", { name: "raidstead.guide.title" });
      expect(within(guide).getByText("raidstead.guide.ready-title")).toBeTruthy();
      expect(api.state).not.toHaveBeenCalled();
      fireEvent.click(within(guide).getByRole("button", { name: "raidstead.guide.close-preseason" }));
      expect(screen.queryByRole("dialog", { name: "raidstead.guide.title" })).toBeNull();
    });

    it("opens the season when the countdown ends and the server agrees", async () => {
      api.calendar.mockResolvedValueOnce(soon(1200)).mockResolvedValueOnce(soon(-1)).mockResolvedValue(state().calendar);
      render(<RaidsteadGame />);
      await tick(50);
      expect(region()).not.toBeNull();

      await tick(2100); // zero (the clock ticks once a second): the server still says "not yet"
      expect(region()).not.toBeNull();
      await tick(5100); // it asks again and the season is open
      expect(region()).toBeNull();
      expect(signInButton()).not.toBeNull();
      // the re-checks ask past any cached copy
      expect(api.calendar.mock.calls.slice(1).every(([fresh]) => fresh === true)).toBe(true);
    });

    it("a guide open when the season opens closes with the countdown, and stays closed once the game loads", async () => {
      box.stored = { account: "ann", token: "rs1_ann", expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
      api.calendar.mockResolvedValueOnce(soon(1200)).mockResolvedValue(state().calendar);
      render(<RaidsteadGame />);
      await tick(50);
      fireEvent.click(within(region()!).getByRole("button", { name: "raidstead.guide.open" }));
      expect(screen.queryByRole("dialog", { name: "raidstead.guide.title" })).not.toBeNull();

      await tick(2100); // zero, and the server agrees: the game boots with the stored session
      await waitFor(() => expect(api.state).toHaveBeenCalled());
      await tick(50);
      expect(region()).toBeNull();
      expect(screen.queryByRole("dialog", { name: "raidstead.guide.title" })).toBeNull();
    });

    it("counts down to a new start when the season was moved later", async () => {
      api.calendar.mockResolvedValueOnce(soon(1200)).mockResolvedValueOnce(soon(2 * 86_400_000 + 3_600_000));
      render(<RaidsteadGame />);
      await tick(2100);
      await tick(50);
      expect(within(region()!).getByRole("timer").textContent).toMatch(/^02 raidstead.season.countdown-days/);
      await tick(10_000);
      expect(api.calendar).toHaveBeenCalledTimes(2);
    });

    it("stops asking once the page is gone, even with an answer still on its way", async () => {
      let late!: (c: unknown) => void;
      api.calendar.mockResolvedValueOnce(soon(1200)).mockReturnValueOnce(new Promise((r) => (late = r))).mockResolvedValue(soon(-1));
      const { unmount } = render(<RaidsteadGame />);
      await tick(2100); // zero
      await tick(10); // the re-check goes out and is in flight
      expect(api.calendar).toHaveBeenCalledTimes(2);
      unmount();
      await act(async () => late(soon(-1))); // "not yet" arrives after the page closed
      await tick(30_000);
      expect(api.calendar).toHaveBeenCalledTimes(2);
    });

    it("falls back to the usual flow when the calendar cannot be reached", async () => {
      api.calendar.mockRejectedValue(new Error("offline"));
      render(<RaidsteadGame />);
      await tick(50);
      expect(signInButton()).not.toBeNull();
      expect(region()).toBeNull();
    });

    it("ignores a calendar that answers after the page has moved on", async () => {
      let late!: (c: unknown) => void;
      api.calendar.mockReturnValue(new Promise((r) => (late = r)));
      render(<RaidsteadGame />);
      await tick(4100); // the deadline passed: the usual sign-in shows
      expect(signInButton()).not.toBeNull();
      await act(async () => late(soon(3 * 86_400_000)));
      await tick(50);
      expect(region()).toBeNull();
      expect(signInButton()).not.toBeNull();
    });

    it("falls back to the usual flow when the server keeps failing at zero", async () => {
      api.calendar.mockResolvedValueOnce(soon(1200)).mockRejectedValue(new Error("offline"));
      render(<RaidsteadGame />);
      await tick(2100); // zero: the first ask fails
      await tick(5100); // the second
      expect(region()).not.toBeNull();
      await tick(5100); // the third: stop waiting
      expect(region()).toBeNull();
      expect(signInButton()).not.toBeNull();
    });

    it("counts down by the server's clock when the device clock is off", async () => {
      // this device runs a day behind the server
      const serverNow = Date.now() + 86_400_000;
      api.calendar.mockResolvedValue({ ...soon(0), startsAt: new Date(serverNow + 2 * 3_600_000).toISOString(), now: serverNow });
      render(<RaidsteadGame />);
      await tick(1100);
      expect(within(region()!).getByRole("timer").textContent).toMatch(/^00 raidstead.season.countdown-days(01|02) raidstead.season.countdown-hours/);
    });

    it("asks once per round at zero, even while the server clock keeps correcting it", async () => {
      api.calendar.mockResolvedValueOnce(soon(1200));
      // "not yet", each answer with a slightly different server clock
      api.calendar.mockImplementation(async () => ({ ...soon(-1), now: Date.now() - 400 }));
      render(<RaidsteadGame />);
      await tick(2100);
      await tick(10);
      for (let i = 0; i < 6; i++) await tick(5000);
      // the first answer, the ask at zero, then one ask per 5s round
      expect(api.calendar.mock.calls.length).toBeLessThanOrEqual(8);
      expect(region()).not.toBeNull();
    });

    it("trusts a first answer's clock only when the device is off by more than a minute", async () => {
      // the cached answer's clock is 50s old: this device is right, so it opens on its own time
      api.calendar.mockResolvedValueOnce({ ...soon(90_000), now: Date.now() - 50_000 });
      render(<RaidsteadGame />);
      await tick(1100);
      expect(within(region()!).getByRole("timer").textContent).toMatch(/^00 raidstead.season.countdown-days00 raidstead.season.countdown-hours01 raidstead.season.countdown-minutes2\d/);
    });

    it("counts the last seconds again when this device runs a few seconds fast", async () => {
      const startsAt = new Date(Date.now() + 1200).toISOString();
      api.calendar
        .mockResolvedValueOnce({ ...soon(0), startsAt })
        // at this device's zero the server is 3s behind it: same start, not yet
        .mockImplementationOnce(async () => ({ ...soon(0), startsAt, now: Date.now() - 3000 }))
        .mockResolvedValue(state().calendar);
      render(<RaidsteadGame />);
      await tick(2100);
      await tick(10);
      expect(api.calendar).toHaveBeenCalledTimes(2);
      expect(region()).not.toBeNull();
      // it counts down the server's remaining seconds, then asks again and opens
      await tick(4000);
      await tick(10);
      expect(api.calendar).toHaveBeenCalledTimes(3);
      expect(region()).toBeNull();
      expect(signInButton()).not.toBeNull();
    });

    it("keeps a single chain of checks when a small correction restarts the last second", async () => {
      const startsAt = new Date(Date.now() + 1200).toISOString();
      api.calendar
        .mockResolvedValueOnce({ ...soon(0), startsAt })
        // the server is 1.5s behind: under a second to go by its clock, so the check retries in 5s
        .mockImplementation(async () => ({ ...soon(0), startsAt, now: Date.now() - 1500 }));
      render(<RaidsteadGame />);
      await tick(2100);
      await tick(10);
      expect(api.calendar).toHaveBeenCalledTimes(2);
      // the corrected countdown reaches zero again before the retry: no second chain
      await tick(1500);
      expect(api.calendar).toHaveBeenCalledTimes(2);
      await tick(4000);
      expect(api.calendar).toHaveBeenCalledTimes(3);
    });

    it("counts again even when the server leaves out its clock", async () => {
      const startsAt = new Date(Date.now() + 1200).toISOString();
      // an older server: no clock in the answer, and this device's clock is the only one
      api.calendar.mockResolvedValueOnce({ ...soon(0), startsAt }).mockImplementationOnce(async () => {
        vi.setSystemTime(Date.now() - 3000); // the device clock is set back meanwhile
        return { ...soon(0), startsAt };
      }).mockResolvedValue(state().calendar);
      render(<RaidsteadGame />);
      await tick(2100);
      await tick(10);
      expect(api.calendar).toHaveBeenCalledTimes(2);
      await tick(4000);
      await tick(10);
      expect(api.calendar).toHaveBeenCalledTimes(3);
      expect(region()).toBeNull();
    });

    it("falls back when the calendar never answers", async () => {
      api.calendar.mockReturnValue(new Promise(() => undefined));
      render(<RaidsteadGame />);
      await tick(4100);
      expect(signInButton()).not.toBeNull();
    });
  });
});
