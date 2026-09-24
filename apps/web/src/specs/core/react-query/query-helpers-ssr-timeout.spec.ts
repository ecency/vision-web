// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Node environment: isServer is true, so the SSR timeout is armed.
vi.mock("../../../core/react-query/index", () => ({
  getQueryClient: vi.fn()
}));
vi.mock("../../../config", () => ({ EcencyConfigManager: { CONFIG: {} } }));

import { prefetchQuery, fetchQuery } from "../../../core/react-query/query-helpers";
import { getQueryClient } from "../../../core/react-query/index";

type DegradedGlobal = { __ecencySsrDegraded?: { mark: (reason: string) => void } };

describe("SSR prefetch timeout", () => {
  const mark = vi.fn();
  let client: any;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as DegradedGlobal).__ecencySsrDegraded = { mark };
    client = {
      prefetchQuery: vi.fn(() => new Promise(() => {})),
      fetchQuery: vi.fn(() => new Promise(() => {})),
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

  it("still degrades gracefully without the preload (dev, tests, other entry points)", async () => {
    delete (globalThis as DegradedGlobal).__ecencySsrDegraded;
    const pending = prefetchQuery({ queryKey: ["account", "someone"], queryFn: vi.fn() });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toBeUndefined();
  });
});
