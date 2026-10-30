// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// Node environment: isServer is true, so the SSR timeout is armed. The query
// client is a real one, so the error, timeout and empty states below are the
// states React Query really leaves behind, not hand-written stand-ins.
vi.mock("../../../core/react-query/index", () => ({ getQueryClient: vi.fn() }));
vi.mock("../../../config", () => ({ EcencyConfigManager: { CONFIG: {} } }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  }
}));

import {
  prefetchRequired,
  SsrLookupUnavailableError
} from "../../../core/react-query/query-helpers";
import { getQueryClient } from "../../../core/react-query/index";

type DegradedGlobal = { __ecencySsrDegraded?: { mark: (reason: string, detail?: string) => void } };

const KEY = ["accounts", "full", "alice"];

describe("prefetchRequired", () => {
  const mark = vi.fn();
  let client: QueryClient;

  beforeEach(() => {
    (globalThis as DegradedGlobal).__ecencySsrDegraded = { mark };
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(getQueryClient).mockReturnValue(client);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as DegradedGlobal).__ecencySsrDegraded;
    vi.clearAllMocks();
  });

  it("returns the record when the lookup succeeded", async () => {
    const account = { name: "alice" };
    await expect(
      prefetchRequired({ queryKey: KEY, queryFn: async () => account })
    ).resolves.toEqual(account);
    expect(mark).not.toHaveBeenCalled();
  });

  it("answers not found when the lookup succeeded and found nothing", async () => {
    await expect(prefetchRequired({ queryKey: KEY, queryFn: async () => null })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(mark).not.toHaveBeenCalled();
  });

  it("answers not found when a node asserted the record does not exist", async () => {
    const queryFn = async () => {
      throw new Error("Assert Exception:given community name is not valid");
    };
    await expect(prefetchRequired({ queryKey: KEY, queryFn })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mark).not.toHaveBeenCalled();
  });

  it("throws a lookup-unavailable error, not not-found, when the lookup failed", async () => {
    const queryFn = async () => {
      throw new Error("HTTP 429 rate limited");
    };
    const result = prefetchRequired({ queryKey: KEY, queryFn });
    await expect(result).rejects.toBeInstanceOf(SsrLookupUnavailableError);
    await expect(result).rejects.not.toThrow("NEXT_NOT_FOUND");
    expect(mark).toHaveBeenCalledWith(
      "lookup-unavailable",
      expect.stringContaining("HTTP 429 rate limited")
    );
  });

  it("returns a record read earlier even when a later refetch errored", async () => {
    const account = { name: "alice" };
    await client.prefetchQuery({ queryKey: KEY, queryFn: async () => account });
    await client.prefetchQuery({
      queryKey: KEY,
      staleTime: 0,
      queryFn: async () => {
        throw new Error("HTTP 429 rate limited");
      }
    });
    expect(client.getQueryState(KEY)?.status).toBe("error");
    await expect(
      prefetchRequired({ queryKey: KEY, queryFn: async () => account })
    ).resolves.toEqual(account);
    expect(mark).not.toHaveBeenCalled();
  });

  it("names the node an SDK node error came from in the marked detail", async () => {
    const queryFn = async () => {
      throw Object.assign(new Error("HTTP 429 Rate Limited"), { node: "https://node.example" });
    };
    await expect(prefetchRequired({ queryKey: KEY, queryFn })).rejects.toBeInstanceOf(
      SsrLookupUnavailableError
    );
    expect(mark).toHaveBeenCalledWith(
      "lookup-unavailable",
      "Error: HTTP 429 Rate Limited (https://node.example)"
    );
  });

  it("throws a lookup-unavailable error when the lookup timed out", async () => {
    vi.useFakeTimers();
    const result = prefetchRequired({ queryKey: KEY, queryFn: () => new Promise(() => {}) });
    const settled = expect(result).rejects.toBeInstanceOf(SsrLookupUnavailableError);
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(mark).toHaveBeenCalledWith("lookup-unavailable", expect.stringContaining("timed out"));
  });

  it("keeps the lookup-unavailable error recognisable by name across module copies", () => {
    expect(new SsrLookupUnavailableError("x").name).toBe("SsrLookupUnavailableError");
  });
});
