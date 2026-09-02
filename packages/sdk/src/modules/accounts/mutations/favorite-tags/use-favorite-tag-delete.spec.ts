import { ConfigManager, QueryKeys } from "@/modules/core";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { favoriteTagDeleteMutationOptions } from "./use-favorite-tag-delete";

const row = (tag: string) => ({ _id: `id-${tag}`, tag, created: "2026-09-02T00:00:00+00:00", timestamp: 1 });

const LIST_KEY = QueryKeys.accounts.favoriteTags("alice");
const INFINITE_KEY = QueryKeys.accounts.favoriteTagsInfinite("alice", 10);
const checkKey = (tag: string) => QueryKeys.accounts.checkFavoriteTag("alice", tag);

function infinite(...tags: string[]) {
  return {
    pageParams: [0],
    pages: [{ data: tags.map(row), pagination: { total: tags.length, limit: 10, offset: 0, has_next: false } }],
  };
}

// Drives the option handlers directly against the SDK's query client, which is
// exactly what useMutation would do, minus the render.
describe("favoriteTagDeleteMutationOptions", () => {
  let client: QueryClient;
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const options = () => favoriteTagDeleteMutationOptions("alice", "hs-token", onSuccess, onError);
  // react-query passes a mutation context as the trailing argument; nothing here reads it.
  const mutate = (tag: string) =>
    options().onMutate!(tag, undefined as never) as Promise<
      Awaited<ReturnType<NonNullable<ReturnType<typeof options>["onMutate"]>>>
    >;
  const fail = (tag: string, context: Awaited<ReturnType<typeof mutate>>) =>
    options().onError!(new Error("boom"), tag, context, undefined as never);

  beforeEach(() => {
    client = new QueryClient();
    ConfigManager.setQueryClient(client);
    client.setQueryData(LIST_KEY, [row("photography"), row("hive")]);
    client.setQueryData(INFINITE_KEY, infinite("photography", "hive"));
    onSuccess.mockReset();
    onError.mockReset();
  });

  it("removes the tag everywhere optimistically, in normalised form", async () => {
    client.setQueryData(checkKey("photography"), true);

    const context = await mutate("#Photography");

    expect(context?.normalized).toBe("photography");
    expect(client.getQueryData(LIST_KEY)).toEqual([row("hive")]);
    expect((client.getQueryData(INFINITE_KEY) as ReturnType<typeof infinite>).pages[0].data).toEqual([row("hive")]);
    expect(client.getQueryData(checkKey("photography"))).toBe(false);
  });

  it("puts the snapshots back on failure and marks every key for refetch", async () => {
    client.setQueryData(checkKey("photography"), true);
    const context = await mutate("photography");

    fail("photography", context);

    expect(client.getQueryData(LIST_KEY)).toEqual([row("photography"), row("hive")]);
    expect((client.getQueryData(INFINITE_KEY) as ReturnType<typeof infinite>).pages[0].data).toHaveLength(2);
    expect(client.getQueryData(checkKey("photography"))).toBe(true);
    for (const key of [LIST_KEY, INFINITE_KEY, checkKey("photography")]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  // The check query may never have run for this tag. Restoring "the previous value"
  // would then be a no-op and the optimistic false would stay cached as if the
  // server had said so.
  it("drops the optimistic check entry on failure when nothing was cached before", async () => {
    const context = await mutate("photography");
    expect(client.getQueryData(checkKey("photography"))).toBe(false);

    fail("photography", context);

    expect(client.getQueryCache().find({ queryKey: checkKey("photography"), exact: true })).toBeUndefined();
  });

  // Two deletes in flight snapshot each other's tag. When the earlier one fails, its
  // snapshot brings the later tag back; the invalidation is what makes that
  // transient instead of authoritative.
  it("invalidates after an overlapping delete rolls back, so a resurrected tag is refetched", async () => {
    const first = await mutate("photography");
    const second = await mutate("hive");
    expect(client.getQueryData(LIST_KEY)).toEqual([]);

    options().onSuccess!([], "hive", second, undefined as never);
    fail("photography", first);

    // The stale snapshot is visible for a moment...
    expect(client.getQueryData(LIST_KEY)).toEqual([row("photography"), row("hive")]);
    // ...but every list key is flagged, so the next read goes to the server.
    expect(client.getQueryState(LIST_KEY)?.isInvalidated).toBe(true);
    expect(client.getQueryState(INFINITE_KEY)?.isInvalidated).toBe(true);
  });

  it("does nothing for an unusable tag", async () => {
    const context = await mutate("hive-123456");

    expect(context).toBeUndefined();
    expect(client.getQueryData(LIST_KEY)).toEqual([row("photography"), row("hive")]);
  });
});
