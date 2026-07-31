import { describe, expect, test, vi } from "vitest";

// @ecency/sdk is globally mocked, which leaves PointTransactionType undefined; this
// suite is about the enum's actual values, so pull in the real module.
vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk"))
}));

vi.mock("i18next", () => ({
  default: { t: (key: string) => key }
}));

const { PointTransactionType } = await import("@ecency/sdk");
// Imported from the module rather than the _consts barrel: the barrel also pulls in
// transactions-icons.tsx, which builds JSX at module scope and is irrelevant here.
const { TRANSACTIONS_LABELS } = await import(
  "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_consts/transactions-labels"
);

/**
 * Burns are the one points transaction with no counterparty at all: `sender` and
 * `receiver` are both null, which is what separates them from a treasury transfer.
 *
 * That also means a refund cannot be told apart by who it came from. A refunded burn
 * arrives as the SAME type with a positive amount, so the sign is the only signal and
 * labelling it "Spent on AI" would be actively wrong.
 */
describe("points burn transactions", () => {
  test("BURNED is a distinct type from a treasury transfer", () => {
    // Before this existed, burn rows fell through to a null type and rendered as a
    // bare amount with no label in web and a generic row in mobile.
    expect(PointTransactionType.BURNED).toBe(997);
    expect(PointTransactionType.BURNED).not.toBe(PointTransactionType.TRANSFER_SENT);
    expect(PointTransactionType.BURNED).not.toBe(PointTransactionType.MINTED);
  });

  test("a burn is labelled as a spend", () => {
    const label = TRANSACTIONS_LABELS[PointTransactionType.BURNED];
    expect(label).toBeDefined();
    expect(label("spend")).toBe("points.burned-list-desc");
  });

  test("a refunded burn is labelled as a refund, not a spend", () => {
    const label = TRANSACTIONS_LABELS[PointTransactionType.BURNED];
    expect(label("refund")).toBe("points.burn-refund-list-desc");
  });

  test("defaults to spend when no direction is passed", () => {
    // The component passes a direction, but the map is also read generically.
    const label = TRANSACTIONS_LABELS[PointTransactionType.BURNED];
    expect(label()).toBe("points.burned-list-desc");
  });

  test("every point transaction type has a label", () => {
    // A type without an entry renders as an empty label, which is exactly the bug
    // this change fixes -- so guard the whole enum, not just the new member.
    const numericTypes = Object.values(PointTransactionType).filter(
      (v): v is number => typeof v === "number"
    );
    const missing = numericTypes.filter((t) => !TRANSACTIONS_LABELS[t]);
    expect(missing).toEqual([]);
  });
});
