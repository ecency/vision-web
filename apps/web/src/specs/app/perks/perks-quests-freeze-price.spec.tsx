import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerksQuestsSection } from "@/app/perks/components/perks-quests-section";

type RosterState = { status: "pending" | "error" | "success"; members?: string[] };
// "error" with members set models a failed background refetch that keeps the last data.
const { roster } = vi.hoisted(() => ({
  roster: { status: "pending", members: undefined } as RosterState
}));

vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ecency/sdk")>()),
  getQuestsQueryOptions: () => ({ queryKey: ["quests"] }),
  getGameStatusCheckQueryOptions: () => ({ queryKey: ["spin"] }),
  getProMembersQueryOptions: () => ({ queryKey: ["pro-members"] }),
  useBuyStreakFreeze: () => ({ mutateAsync: vi.fn(), isPending: false }),
  QUEST_CATALOG: [],
  STREAK_FREEZE_MAX_OWNED: 2,
  STREAK_FREEZE_PRICE: 100
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: (opts: { queryKey: string[] }) => {
    if (opts.queryKey[0] === "pro-members") {
      return {
        data: roster.members ? { members: roster.members } : undefined,
        isSuccess: roster.status === "success",
        isError: roster.status === "error"
      };
    }
    if (opts.queryKey[0] === "quests") {
      return {
        data: { daily: [], weekly: [], monthly: [], streak: { current: 3, freezes_owned: 0 } },
        isSuccess: true
      };
    }
    return { data: undefined, isSuccess: false };
  }
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" } })
}));
vi.mock("@/features/shared", () => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/utils", () => ({ getAccessToken: () => "code", useCountdown: () => [0] }));
vi.mock("@/app/perks/components/perks-quest-item", () => ({ PerksQuestItem: () => null }));

const priced = /perks\.quests\.buy-freeze(?!-)/;

describe("perks quests: streak freeze price waits for the Pro roster", () => {
  beforeEach(() => {
    roster.status = "pending";
    roster.members = undefined;
  });

  it.each(["pending", "error"] as const)(
    "does not quote the Points price while the roster is %s",
    (status) => {
      roster.status = status;
      render(<PerksQuestsSection />);
      expect(screen.queryByText(priced)).toBeNull();
      expect(screen.queryByText("perks.quests.buy-freeze-free")).toBeNull();
      const button = screen.getByText("perks.quests.buy-freeze-neutral").closest("button");
      // No price shown, so the purchase cannot be made either.
      expect(button).toBeDisabled();
    }
  );

  it("treats a malformed roster response as unknown", () => {
    roster.status = "success";
    roster.members = {} as unknown as string[];
    render(<PerksQuestsSection />);
    expect(screen.getByText("perks.quests.buy-freeze-neutral").closest("button")).toBeDisabled();
  });

  it("keeps the price after a failed refetch that kept the roster", () => {
    roster.status = "error";
    roster.members = ["bob"];
    render(<PerksQuestsSection />);
    expect(screen.getByText(priced).closest("button")).toBeEnabled();
  });

  it("quotes the price to a resolved non-Pro member", () => {
    roster.status = "success";
    roster.members = ["bob"];
    render(<PerksQuestsSection />);
    expect(screen.getByText(priced)).toBeInTheDocument();
  });

  it("shows free to a resolved Pro member", () => {
    roster.status = "success";
    roster.members = ["alice"];
    render(<PerksQuestsSection />);
    expect(screen.getByText("perks.quests.buy-freeze-free")).toBeInTheDocument();
  });
});
