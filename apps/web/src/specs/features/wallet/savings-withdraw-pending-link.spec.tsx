import "@testing-library/jest-dom";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { renderWithQueryClient, setupModalContainers } from "@/specs/test-utils";

// The pending savings withdrawals list existed but nothing rendered it, so the web
// wallet never showed pending withdrawals (#1973). The token summary now shows a link
// to it, counted per token.

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const requests = [
  { request_id: 1, from: "alice", to: "alice", amount: "10.000 HBD", memo: "", complete: "2026-11-18T00:00:00" },
  { request_id: 2, from: "alice", to: "bob", amount: "5.000 HBD", memo: "", complete: "2026-11-18T01:00:00" },
  { request_id: 3, from: "alice", to: "alice", amount: "7.000 HIVE", memo: "", complete: "2026-11-18T02:00:00" }
];

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
  return {
    ...actual,
    getSavingsWithdrawFromQueryOptions: (username: string) => ({
      ...actual.getSavingsWithdrawFromQueryOptions(username),
      queryFn: async () => (username === "alice" ? requests : [])
    })
  };
});

const { SavingsWithdrawPendingLink } = await import(
  "@/app/(dynamicPages)/profile/[username]/_components/savings-withdraw"
);

describe("SavingsWithdrawPendingLink", () => {
  test("counts only the token's pending withdrawals and opens the list", async () => {
    setupModalContainers();
    renderWithQueryClient(<SavingsWithdrawPendingLink username="alice" tokenType="HBD" />);

    const link = await screen.findByText(/savings-withdraw.pending-link/);
    fireEvent.click(link);

    expect(await screen.findByText("@bob")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  test("renders nothing without pending withdrawals", async () => {
    const { container } = renderWithQueryClient(
      <SavingsWithdrawPendingLink username="carol" tokenType="HIVE" />
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });
});
