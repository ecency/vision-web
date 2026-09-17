import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver, dehydrate, hydrate } from "@tanstack/react-query";
import { getNotificationsUnreadCountQueryOptions } from "./get-notifications-unread-count-query-options";

// Both apps run their clients with a 60s default staleTime.
const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });

describe("getNotificationsUnreadCountQueryOptions", () => {
  let client: QueryClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    client = makeClient();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ json: async () => ({ count: 7 }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });

  it("carries no initialData seed", () => {
    // A seed is stamped as fetched at creation, so it counts as a fresh 0.
    expect(getNotificationsUnreadCountQueryOptions("alice", "code")).not.toHaveProperty(
      "initialData"
    );
  });

  it("fetches on a cold cache instead of returning a cached 0", async () => {
    await expect(
      client.fetchQuery(getNotificationsUnreadCountQueryOptions("alice", "code"))
    ).resolves.toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches nothing when called without an access code", async () => {
    const options = getNotificationsUnreadCountQueryOptions("alice", undefined);

    await expect(client.fetchQuery(options)).rejects.toThrow("Missing access token");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(client.getQueryData(options.queryKey)).toBeUndefined();

    // Once the code is there, the real count comes back at once.
    await expect(
      client.fetchQuery(getNotificationsUnreadCountQueryOptions("alice", "code"))
    ).resolves.toBe(7);
  });

  it("fetches when an observer mounts, showing 0 until the count arrives", async () => {
    const observer = new QueryObserver(
      client,
      getNotificationsUnreadCountQueryOptions("alice", "code")
    );
    const seen: (number | undefined)[] = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));

    expect(observer.getCurrentResult().data).toBe(0);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(7));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seen).not.toContain(undefined);
    unsubscribe();
  });

  it("lets a count restored from a persisted cache stand", () => {
    const previous = makeClient();
    previous.setQueryData(getNotificationsUnreadCountQueryOptions("alice", "code").queryKey, 3);
    const persisted = dehydrate(previous);
    previous.clear();

    // The query exists (an observer mounted) before the cache is restored.
    const observer = new QueryObserver(
      client,
      getNotificationsUnreadCountQueryOptions("alice", undefined)
    );
    const unsubscribe = observer.subscribe(() => undefined);
    hydrate(client, persisted);

    expect(observer.getCurrentResult().data).toBe(3);
    unsubscribe();
  });
});
