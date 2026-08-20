import { describe, expect, it, vi } from "vitest";
import { QueryKeys } from "@ecency/sdk";
import type { QueryFunctionContext } from "@tanstack/react-query";
import { mockEntry } from "@/specs/test-utils";

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

import { pendingPayoutsQueryOptions } from "@/api/queries/pending-payouts-query";

const votes = Array.from({ length: 400 }, (_, i) => ({ voter: `v${i}`, rshares: 1_000_000 }));

function entry(overrides: Partial<ReturnType<typeof mockEntry>> = {}) {
  return mockEntry({
    author: "alice",
    permlink: "p",
    active_votes: votes as never,
    payout_at: "2026-08-27T00:00:00",
    pending_payout_value: "1.234 HBD",
    ...overrides
  });
}

/** A context of the shape React Query hands a queryFn. */
function context(signal: AbortSignal): QueryFunctionContext {
  return { queryKey: [], signal, meta: undefined } as unknown as QueryFunctionContext;
}

function run(sort: "posts" | "comments", ctx = context(new AbortController().signal)) {
  const { queryFn } = pendingPayoutsQueryOptions("alice", sort);
  return (queryFn as (c: QueryFunctionContext) => Promise<unknown[]>)(ctx);
}

/**
 * The wallet total reads two fields and the bridge answers with whole entries,
 * about 660 KB per wallet view across the two calls, mostly voter records.
 */
describe("pendingPayoutsQueryOptions", () => {
  it("keeps only the payout fields", async () => {
    fetchSpy.mockResolvedValueOnce([entry(), entry({ pending_payout_value: "2.000 HBD" })]);
    const rows = await run("posts");

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
    const projected = pendingPayoutsQueryOptions("alice", "posts").queryKey as unknown[];

    expect(projected).not.toEqual(shared);
    expect(projected.slice(0, shared.length)).toEqual(shared);
    expect(projected[projected.length - 1]).toBe("pending-payouts");
  });

  it("survives an empty or missing answer", async () => {
    fetchSpy.mockResolvedValueOnce(null);
    await expect(run("comments")).resolves.toEqual([]);
  });

  it("hands React Query's cancellation context to the request underneath", async () => {
    // The SDK query reads `signal` off this context and gives it to the bridge
    // call. Dropping the context does not fail anything visibly: the wallet a
    // reader has navigated away from just keeps downloading entries, which is
    // the opposite of what this projection is for.
    fetchSpy.mockResolvedValueOnce([]);
    const controller = new AbortController();
    const ctx = context(controller.signal);

    await run("posts", ctx);

    expect(fetchSpy).toHaveBeenCalledWith(ctx);
    expect(fetchSpy.mock.calls.at(-1)?.[0]?.signal).toBe(controller.signal);
  });

  it("counts only the account whose wallet this is", async () => {
    // One node answering with somebody else's post must not move the total.
    fetchSpy.mockResolvedValueOnce([
      entry(),
      entry({ author: "mallory", pending_payout_value: "999.000 HBD" })
    ]);

    await expect(run("posts")).resolves.toEqual([
      { payout_at: "2026-08-27T00:00:00", pending_payout_value: "1.234 HBD" }
    ]);
  });
});
