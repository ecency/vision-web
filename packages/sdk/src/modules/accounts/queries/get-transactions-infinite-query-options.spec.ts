import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTransactionsInfiniteQueryOptions } from "./get-transactions-infinite-query-options";

const mockCallREST = vi.hoisted(() => vi.fn());

vi.mock("@/modules/core/hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modules/core/hive-tx")>();
  return {
    ...actual,
    callREST: mockCallREST,
  };
});

const op = (block: number) => ({
  op: { type: "transfer_operation", value: { from: "alice", to: "bob" } },
  block,
  trx_id: "abc",
  op_pos: 0,
  op_type_id: 2,
  timestamp: "2026-08-11T00:00:00",
  virtual_op: false,
  operation_id: String(block),
  trx_in_block: 0,
});

const hafahResponse = (totalPages: number, blocks: number[]) => ({
  total_operations: 0,
  total_pages: totalPages,
  operations_result: blocks.map(op),
});

type QueryFn = (ctx: { pageParam: number | null; signal?: AbortSignal }) => Promise<{
  entries: { num: number }[];
  currentPage: number;
}>;

const runQueryFn = (pageParam: number | null) => {
  const options = getTransactionsInfiniteQueryOptions("alice", 3);
  return (options.queryFn as unknown as QueryFn)({ pageParam });
};

describe("getTransactionsInfiniteQueryOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // hafah pages oldest-first: the newest page is the remainder bucket
  // (total_operations mod page-size rows), so an omitted `page` can return as
  // little as a single row. The queryFn must top the first screen up from the
  // next older page instead of rendering that stub as "the transactions list".
  it("chains the next older page when the newest bucket is short", async () => {
    mockCallREST
      .mockResolvedValueOnce(hafahResponse(146, [300]))
      .mockResolvedValueOnce(hafahResponse(146, [201, 202, 203]));

    const page = await runQueryFn(null);

    expect(page.entries).toHaveLength(4);
    expect(page.currentPage).toBe(145);
    expect(mockCallREST).toHaveBeenCalledTimes(2);
    // The chained call must ask for the page BELOW the remainder bucket —
    // asking for page=total_pages returns the same short bucket again.
    expect(mockCallREST.mock.calls[1][2]).toMatchObject({ page: 145 });
  });

  it("does not chain when the newest bucket is already full", async () => {
    mockCallREST.mockResolvedValueOnce(hafahResponse(146, [301, 302, 303]));

    const page = await runQueryFn(null);

    expect(page.entries).toHaveLength(3);
    expect(page.currentPage).toBe(146);
    expect(mockCallREST).toHaveBeenCalledTimes(1);
  });

  it("does not chain when there is no older page", async () => {
    mockCallREST.mockResolvedValueOnce(hafahResponse(1, [300]));

    const page = await runQueryFn(null);

    expect(page.entries).toHaveLength(1);
    expect(page.currentPage).toBe(1);
    expect(mockCallREST).toHaveBeenCalledTimes(1);
  });

  it("does not chain on explicit page requests", async () => {
    mockCallREST.mockResolvedValueOnce(hafahResponse(146, [100]));

    const page = await runQueryFn(50);

    expect(page.currentPage).toBe(50);
    expect(mockCallREST).toHaveBeenCalledTimes(1);
  });

  it("keeps the short page and cursor when the chained fetch fails", async () => {
    mockCallREST
      .mockResolvedValueOnce(hafahResponse(146, [300]))
      .mockRejectedValueOnce(new Error("HTTP 503"));

    const page = await runQueryFn(null);

    // The cursor stays at total_pages so the failed page is the next
    // fetchNextPage target instead of being skipped.
    expect(page.entries).toHaveLength(1);
    expect(page.currentPage).toBe(146);
  });

  it("walks pages downward and stops below page 1", () => {
    const options = getTransactionsInfiniteQueryOptions("alice", 3);
    const next = options.getNextPageParam as (lastPage: { currentPage: number }) => number | undefined;
    expect(next({ currentPage: 145 })).toBe(144);
    expect(next({ currentPage: 1 })).toBeUndefined();
  });
});
