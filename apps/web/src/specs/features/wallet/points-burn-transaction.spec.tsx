import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// @ecency/sdk is globally mocked, which leaves PointTransactionType undefined -- both
// this suite and the component under test compare against its real values.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk"))
}));

// i18next is deliberately NOT mocked here: the global setup already stubs it to echo
// keys, and replacing it locally breaks setup-any-spec's own i18next.init() call,
// which silently aborts the rest of setup (including the jest-dom matchers).

// Avatars fetch and ProfileLink pulls in routing; neither is relevant to labelling.
vi.mock("@/features/shared", () => ({
  ProfileLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  UserAvatar: () => <span />
}));

const { PointTransactionType } = await import("@ecency/sdk");
const { TRANSACTIONS_LABELS } = await import(
  "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_consts/transactions-labels"
);
const { ProfileWalletTokenHistory } = await import(
  "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/profile-wallet-token-history"
);

function burnRow(amount: number) {
  return {
    id: 1,
    // A burn has NO counterparty: that absence is what distinguishes it from a
    // treasury transfer, and it is why the sign has to carry the meaning.
    type: PointTransactionType.BURNED,
    created: new Date("2026-07-31T00:00:00Z"),
    results: [{ amount, asset: "POINTS" }]
  };
}

/**
 * Burns are the one points transaction with no counterparty at all, so a refund
 * cannot be told apart by who it came from. A refunded burn arrives as the SAME type
 * with a positive amount, which makes the sign the only signal -- and labelling a
 * refund "Spent on AI" would be actively wrong.
 */
describe("points burn transactions", () => {
  test("BURNED is a distinct type from a treasury transfer", () => {
    // Before this existed, burn rows fell through the receiver/sender/minted checks
    // to a null type and rendered as a bare amount with no label at all.
    expect(PointTransactionType.BURNED).toBe(997);
    expect(PointTransactionType.BURNED).not.toBe(PointTransactionType.TRANSFER_SENT);
    expect(PointTransactionType.BURNED).not.toBe(PointTransactionType.MINTED);
  });

  test("every point transaction type has a label", () => {
    // An unlabelled type is precisely the bug being fixed, so guard the whole enum
    // rather than only the member added here.
    const numericTypes = Object.values(PointTransactionType).filter(
      (v): v is number => typeof v === "number"
    );
    expect(numericTypes.filter((t) => !TRANSACTIONS_LABELS[t])).toEqual([]);
  });

  test("renders a spent burn as a spend", () => {
    render(<ProfileWalletTokenHistory data={[burnRow(-15)] as any} action={null} />);
    expect(screen.getByText("points.burned-list-desc")).toBeInTheDocument();
    expect(screen.queryByText("points.burn-refund-list-desc")).not.toBeInTheDocument();
  });

  test("renders a refunded burn as a refund, not a spend", () => {
    // The regression that matters: same type, opposite sign.
    render(<ProfileWalletTokenHistory data={[burnRow(15)] as any} action={null} />);
    expect(screen.getByText("points.burn-refund-list-desc")).toBeInTheDocument();
    expect(screen.queryByText("points.burned-list-desc")).not.toBeInTheDocument();
  });
});
