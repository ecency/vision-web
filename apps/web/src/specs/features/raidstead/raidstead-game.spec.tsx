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

import { createScene } from "@ecency/raidstead";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { clearSession, signerFor, signIn } from "@/features/raidstead/client";
import { RaidsteadGame } from "@/app/raidstead/_components/raidstead-game";

const expiry = () => new Date(Date.now() + 86_400_000).toISOString();

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
