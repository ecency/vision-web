import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { MattermostUser } from "@/features/chat/mattermost-api";

let onTyping: ((userId: string) => void) | undefined;
let onPosted: ((post: { user_id: string }) => void) | undefined;
const sendTyping = vi.fn();
const connect = vi.fn(() => Promise.resolve());

vi.mock("@/features/chat/mattermost-websocket", () => ({
  MattermostWebSocket: class {
    withChannel() { return this; }
    withQueryClient() { return this; }
    onConnectionChange() { return this; }
    onReconnecting() { return this; }
    onTyping(cb: (userId: string) => void) { onTyping = cb; return this; }
    onPosted(cb: (post: { user_id: string }) => void) { onPosted = cb; return this; }
    connect = connect;
    disconnect() {}
    sendTyping = sendTyping;
  }
}));

import { useChannelWebSocket } from "@/features/chat/hooks/use-channel-websocket";

const esie = { id: "esie-id", username: "esie", nickname: "", first_name: "", last_name: "" } as MattermostUser;
const ref = <T,>(current: T) => ({ current });

function setup(usersById: Record<string, MattermostUser>, isWebSocketActive = true) {
  return renderHook(
    ({ users }) =>
      useChannelWebSocket({
        channelId: "c1",
        queryClient: new QueryClient(),
        getCurrentUserId: () => "me-id",
        onPostedConfirm: vi.fn(),
        pendingPostRefs: {
          lastSentPendingIdRef: ref(null),
          lastSentMessageRef: ref(null),
          lastSentRootIdRef: ref(null),
          lastSentAtRef: ref(0),
          confirmedPendingPostIdsRef: ref(new Set<string>()),
          pendingAbortControllerRef: ref(null),
          sendMutationRef: ref({ reset: vi.fn() })
        },
        usersById: users,
        setIsWebSocketActive: vi.fn(),
        setReconnectAttempt: vi.fn(),
        setReconnectDelay: vi.fn(),
        isWebSocketActive
      }),
    { initialProps: { users: usersById } }
  );
}

describe("useChannelWebSocket typing", () => {
  beforeEach(() => {
    onTyping = undefined;
    sendTyping.mockClear();
    connect.mockClear();
  });

  // Esie answering the first question in a new DM has no message on the page yet
  it("asks for someone typing who is not loaded yet, then names them", () => {
    const { result, rerender } = setup({});

    act(() => onTyping!("esie-id"));
    expect(result.current.unknownTypingUserIds).toEqual(["esie-id"]);
    expect(result.current.typingUsernames).toEqual([]);

    rerender({ users: { "esie-id": esie } });
    expect(result.current.unknownTypingUserIds).toEqual([]);
    expect(result.current.typingUsernames).toEqual(["@esie"]);
  });

  it("ignores the viewer's own typing", () => {
    const { result } = setup({});
    act(() => onTyping!("me-id"));
    expect(result.current.unknownTypingUserIds).toEqual([]);
  });

  it("sends typing on the first keystroke, not after a pause", () => {
    const { result } = setup({});
    result.current.sendTypingDebounced();
    expect(sendTyping).toHaveBeenCalledWith("c1");
  });

  it("clears someone's typing as soon as their message arrives", () => {
    const { result } = setup({ "esie-id": esie });
    act(() => onTyping!("esie-id"));
    expect(result.current.typingUsernames).toEqual(["@esie"]);

    act(() => onPosted!({ user_id: "esie-id" }));
    expect(result.current.typingUsernames).toEqual([]);
  });

  it("retries a dropped connection from typing at most once every few seconds", () => {
    vi.useFakeTimers();
    try {
      const { result } = setup({}, false);
      connect.mockClear();
      for (let i = 0; i < 20; i++) result.current.sendTypingDebounced();
      expect(connect).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5001);
      result.current.sendTypingDebounced();
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
