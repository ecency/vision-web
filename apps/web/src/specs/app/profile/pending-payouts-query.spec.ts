import { describe, expect, it, vi } from "vitest";
import { QueryKeys } from "@ecency/sdk";
import type { Entry } from "@/entities";

const fetchSpy = vi.hoisted(() => vi.fn());

vi.mock("@ecency/sdk", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ecency/sdk");
  const { QueryKeys: keys } = actual as { QueryKeys: typeof QueryKeys };
  return {
    ...actual,
    getAccountPostsQueryOptions: (
      username: string,
      sort: string,
      a: string,
      p: string,
      limit: number,
      observer: string
    ) => ({
      queryKey: keys.posts.accountPostsPage(username, sort, a, p, limit, observer),
      queryFn: fetchSpy
    })
  };
});

import { pendingPayoutsQueryOptions } from "@/app/(dynamicPages)/profile/[username]/wallet/_components/pending-payouts-query";

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    author: "alice",
    permlink: "p",
    body: "a very long post body that the wallet total has no use for",
    active_votes: Array.from({ length: 400 }, (_, i) => ({ voter: `v${i}`, rshares: 1_000_000 })),
    payout_at: "2026-08-27T00:00:00",
    pending_payout_value: "1.234 HBD",
    ...overrides
  } as unknown as Entry;
}

/**
 * The wallet total reads two fields and the bridge answers with whole entries,
 * about 660 KB per wallet view across the two calls, mostly voter records.
 */
describe("pendingPayoutsQueryOptions", () => {
  it("keeps only the payout fields", async () => {
    fetchSpy.mockResolvedValueOnce([entry(), entry({ pending_payout_value: "2.000 HBD" })]);
    const rows = await pendingPayoutsQueryOptions("alice", "posts").queryFn();

    expect(rows).toEqual([
      { payout_at: "2026-08-27T00:00:00", pending_payout_value: "1.234 HBD" },
      { payout_at: "2026-08-27T00:00:00", pending_payout_value: "2.000 HBD" }
    ]);
    for (const row of rows) {
      expect(row).not.toHaveProperty("body");
      expect(row).not.toHaveProperty("active_votes");
    }
  });

  it("does not answer under the key that whole-entry readers use", () => {
    // The waves composer and the decks user column read accountPostsPage and
    // need whole entries; a projected row there would be issue #1556 again.
    const shared = QueryKeys.posts.accountPostsPage("alice", "posts", "", "", 20, "");
    const projected = pendingPayoutsQueryOptions("alice", "posts").queryKey;

    expect(projected).not.toEqual(shared);
    expect(projected.slice(0, shared.length)).toEqual(shared);
    expect(projected[projected.length - 1]).toBe("pending-payouts");
  });

  it("survives an empty or missing answer", async () => {
    fetchSpy.mockResolvedValueOnce(null);
    await expect(pendingPayoutsQueryOptions("alice", "comments").queryFn()).resolves.toEqual([]);
  });
});
