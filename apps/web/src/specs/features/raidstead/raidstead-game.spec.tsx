import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    session: vi.fn()
  },
  box: { stored: null as { account: string; token: string; expiresAt: string } | null }
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
  signerFor: () => "extension",
  signOut: vi.fn(async () => {
    box.stored = null;
  })
}));
vi.mock("@/api/queries", () => ({ useHydrated: () => true }));
vi.mock("@/features/shared/login", () => ({ LoginDialog: () => null }));
vi.mock("@/app/publish/_hooks", () => ({ usePublishHandoffWriter: () => vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { clearSession } from "@/features/raidstead/client";
import { RaidsteadGame } from "@/app/raidstead/_components/raidstead-game";

const asUser = (username: string | null) =>
  vi
    .mocked(useActiveAccount)
    .mockReturnValue({ activeUser: username ? { username } : null, username } as any);

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
});
