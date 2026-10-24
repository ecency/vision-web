import { describe, it, expect, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "token"),
  getRefreshToken: vi.fn(() => "refresh")
}));

import { useMattermostChannelSearch } from "@/features/chat/mattermost-api";

describe("useMattermostChannelSearch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits for typing to pause and searches only the final term", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ channels: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { rerender } = renderHook(({ term }) => useMattermostChannelSearch(term, true), {
      wrapper,
      initialProps: { term: "" }
    });
    for (const term of ["ph", "pho", "phot", "photo"]) {
      rerender({ term });
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ term: "photo" });
  });

  it("hides the previous term's results while the new term is pending", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ channels: [{ id: "old" }] })))
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result, rerender } = renderHook(({ term }) => useMattermostChannelSearch(term, true), {
      wrapper,
      initialProps: { term: "photo" }
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(result.current.data?.channels).toEqual([{ id: "old" }]);

    rerender({ term: "photography" });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(true);

    // the debounce fires first, then the new request runs and settles
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        await vi.runAllTimersAsync();
      });
    }
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data?.channels).toEqual([{ id: "old" }]);
  });
});
