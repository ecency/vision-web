import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getChatBanInfo } from "@/features/chat/chat-ban-notice";
import { useMattermostSendMessage } from "@/features/chat/mattermost-api";

/**
 * Guards the WIRE, not the copy.
 *
 * The ban notice shipped once with a formatter that was fully unit-tested and a send path that
 * threw `new Error(data.error)`, discarding bannedUntil and reason. Every formatter test passed
 * and the feature never activated: the UI fell straight back to the operator-facing string it
 * was written to replace. These tests assert the payload survives the throw, which is the only
 * thing that makes the rest of it reachable.
 */

const BAN_BODY = {
  error: "@someone is banned from chat until 2026-08-13T00:00:00.000Z",
  bannedUntil: Date.now() + 48 * 3_600_000,
  reason: "spray",
  prop: "ecency_chat_banned_until"
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("send path preserves the ban payload", () => {
  it("keeps bannedUntil and reason on the thrown error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(BAN_BODY), { status: 403 }))
    );

    const { result } = renderHook(() => useMattermostSendMessage("chan1"), { wrapper });

    const err = await result.current.mutateAsync({ message: "hi" }).catch((e) => e);

    // the exact shape getChatBanInfo reads; a bare Error here strands the whole feature
    expect((err as { status?: number }).status).toBe(403);
    expect(getChatBanInfo(err)).toMatchObject({ reason: "spray" });
  });

  it("leaves ordinary failures as plain errors, so they still surface normally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }))
    );

    const { result } = renderHook(() => useMattermostSendMessage("chan1"), { wrapper });

    const err = await result.current.mutateAsync({ message: "hi" }).catch((e) => e);

    expect((err as Error).message).toBe("boom");
    expect(getChatBanInfo(err)).toBeNull();
  });

  it("survives a non-JSON error body without masking the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>gateway</html>", { status: 502 }))
    );

    const { result } = renderHook(() => useMattermostSendMessage("chan1"), { wrapper });

    const err = await result.current.mutateAsync({ message: "hi" }).catch((e) => e);

    expect((err as Error).message).toContain("502");
    expect(getChatBanInfo(err)).toBeNull();
  });
});
