// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node environment: isServer is true, so the SSR timeout is armed.
vi.mock("../../../core/react-query/index", () => ({
  getQueryClient: vi.fn()
}));
vi.mock("../../../config", () => ({ EcencyConfigManager: { CONFIG: {} } }));

import {
  prefetchQuery,
  prefetchInfiniteQuery,
  fetchQuery
} from "../../../core/react-query/query-helpers";
import { getQueryClient } from "../../../core/react-query/index";

type DegradedGlobal = { __ecencySsrDegraded?: { mark: (reason: string) => void } };

describe("SSR prefetch timeout and failure", () => {
  const mark = vi.fn();
  let client: any;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as DegradedGlobal).__ecencySsrDegraded = { mark };
    client = {
      prefetchQuery: vi.fn(() => new Promise(() => {})),
      prefetchInfiniteQuery: vi.fn(() => new Promise(() => {})),
      fetchQuery: vi.fn(() => new Promise(() => {})),
      getQueryState: vi.fn(() => undefined),
      cancelQueries: vi.fn(),
      getQueryData: vi.fn(() => undefined)
    };
    (getQueryClient as any).mockReturnValue(client);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as DegradedGlobal).__ecencySsrDegraded;
    vi.clearAllMocks();
  });

  it("marks the response degraded when a prefetch times out", async () => {
    const pending = prefetchQuery({ queryKey: ["account", "someone"], queryFn: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeUndefined();
    expect(client.cancelQueries).toHaveBeenCalledWith({ queryKey: ["account", "someone"] });
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith("prefetch-timeout");
  });

  it("marks fetchQuery timeouts too", async () => {
    const pending = fetchQuery({ queryKey: ["post", "a", "b"], queryFn: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeUndefined();
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it("does not mark a prefetch that finishes in time", async () => {
    client.prefetchQuery.mockResolvedValue(undefined);
    client.getQueryData.mockReturnValue({ name: "someone" });
    const pending = prefetchQuery({ queryKey: ["account", "someone"], queryFn: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ name: "someone" });
    expect(mark).not.toHaveBeenCalled();
  });

  it("marks a prefetch that failed (react-query swallows it, the state says error)", async () => {
    client.prefetchQuery.mockResolvedValue(undefined);
    client.getQueryState.mockReturnValue({ status: "error" });
    await expect(
      prefetchQuery({ queryKey: ["account", "someone"], queryFn: vi.fn() })
    ).resolves.toBeUndefined();
    expect(client.getQueryState).toHaveBeenCalledWith(["account", "someone"]);
    // The state is read from the client the prefetch ran on, not a second lookup.
    expect(getQueryClient).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith("prefetch-error");
  });

  it("marks a failed infinite prefetch too", async () => {
    client.prefetchInfiniteQuery.mockResolvedValue(undefined);
    client.getQueryState.mockReturnValue({ status: "error" });
    await prefetchInfiniteQuery({
      queryKey: ["posts", "someone"],
      queryFn: vi.fn(),
      initialPageParam: undefined,
      getNextPageParam: vi.fn()
    } as any);
    expect(mark).toHaveBeenCalledWith("prefetch-error");
  });

  it("marks a fetchQuery that rejected", async () => {
    client.fetchQuery.mockRejectedValue(new Error("all nodes failed"));
    await expect(
      fetchQuery({ queryKey: ["post", "a", "b"], queryFn: vi.fn() })
    ).resolves.toBeUndefined();
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith("prefetch-error");
  });

  it("does not mark a prefetch whose query succeeded with no data (a genuine not-found)", async () => {
    client.prefetchQuery.mockResolvedValue(undefined);
    client.getQueryState.mockReturnValue({ status: "success" });
    client.getQueryData.mockReturnValue(null);
    await expect(
      prefetchQuery({ queryKey: ["account", "nobody"], queryFn: vi.fn() })
    ).resolves.toBeNull();
    expect(mark).not.toHaveBeenCalled();
  });

  it("leaves a node's not-found answer cacheable (prefetch state and fetchQuery rejection)", async () => {
    const notFound = new Error("Assert Exception:Post ecency/gone does not exist");
    client.prefetchQuery.mockResolvedValue(undefined);
    client.getQueryState.mockReturnValue({ status: "error", error: notFound });
    await prefetchQuery({ queryKey: ["post", "ecency", "gone"], queryFn: vi.fn() });
    client.fetchQuery.mockRejectedValue(notFound);
    await fetchQuery({ queryKey: ["post", "ecency", "gone"], queryFn: vi.fn() });
    expect(mark).not.toHaveBeenCalled();
  });

  it("still marks a transport failure in both paths", async () => {
    const transport = new Error("HTTP 503 from https://node.example");
    client.prefetchQuery.mockResolvedValue(undefined);
    client.getQueryState.mockReturnValue({ status: "error", error: transport });
    await prefetchQuery({ queryKey: ["post", "a", "b"], queryFn: vi.fn() });
    client.fetchQuery.mockRejectedValue(transport);
    await fetchQuery({ queryKey: ["post", "a", "b"], queryFn: vi.fn() });
    expect(mark).toHaveBeenCalledTimes(2);
    expect(mark).toHaveBeenNthCalledWith(1, "prefetch-error");
    expect(mark).toHaveBeenNthCalledWith(2, "prefetch-error");
  });

  it("still degrades gracefully without the preload (dev, tests, other entry points)", async () => {
    delete (globalThis as DegradedGlobal).__ecencySsrDegraded;
    const pending = prefetchQuery({ queryKey: ["account", "someone"], queryFn: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeUndefined();
  });
});
