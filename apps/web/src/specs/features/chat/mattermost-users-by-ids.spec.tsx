import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMattermostUsersByIds } from "@/features/chat/mattermost-api";

describe("useMattermostUsersByIds", () => {
  let qc: QueryClient;
  let fetchMock: ReturnType<typeof vi.fn>;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ users: [{ id: "u1", username: "alice" }] }))
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks the ids up in one POST and returns the users", async () => {
    const { result } = renderHook(() => useMattermostUsersByIds(["u1", "u2"]), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/mattermost/users/ids");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ ids: ["u1", "u2"] });
    expect(result.current.data).toEqual([{ id: "u1", username: "alice" }]);
  });

  it("does not ask when there is nothing to look up", () => {
    renderHook(() => useMattermostUsersByIds([]), { wrapper });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a failed lookup as an error", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ error: "boom" }))
    });
    const { result } = renderHook(() => useMattermostUsersByIds(["u1"]), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe("boom");
  });
});
