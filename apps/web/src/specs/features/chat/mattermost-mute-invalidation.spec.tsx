import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMattermostLeaveChannel, useMattermostMuteChannel } from "@/features/chat/mattermost-api";

/**
 * Regression: toggling a channel's mute state must refresh the unread summary,
 * not only the channel list. The summary carries `unread_eligible`, which the
 * realtime updater trusts; without this invalidation the badge would keep using
 * the stale flag until the periodic refetch (missing an unread after unmute, or
 * over-counting after mute).
 */
describe("useMattermostMuteChannel", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ ok: true }))
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("invalidates both the channel list and the unread summary on success", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useMattermostMuteChannel(), { wrapper });
    await result.current.mutateAsync({ channelId: "c1", mute: true });

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => (call[0] as any)?.queryKey?.[0]);
    expect(invalidatedKeys).toContain("mattermost-channels");
    expect(invalidatedKeys).toContain("mattermost-unread");
  });

  // Closing a group marks it read server-side, so the summary changes as well.
  it("invalidates the unread summary after leaving or closing a conversation", async () => {
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useMattermostLeaveChannel(), { wrapper });
    await result.current.mutateAsync("g1");

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => (call[0] as any)?.queryKey?.[0]);
    expect(invalidatedKeys).toContain("mattermost-channels");
    expect(invalidatedKeys).toContain("mattermost-unread");
  });
});
