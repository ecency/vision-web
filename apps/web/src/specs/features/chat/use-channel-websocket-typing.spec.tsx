import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { MattermostUser } from "@/features/chat/mattermost-api";

let onTyping: ((userId: string) => void) | undefined;
let onPosted: ((post: { user_id: string; channel_id: string }) => void) | undefined;
let onConnectionChange: ((active: boolean) => void) | undefined;
const sendTyping = vi.fn();
const connect = vi.fn(() => Promise.resolve());

vi.mock("@/features/chat/mattermost-websocket", () => ({
  MattermostWebSocket: class {
    withChannel() { return this; }
    withQueryClient() { return this; }
    onConnectionChange(cb: (active: boolean) => void) { onConnectionChange = cb; return this; }
    onReconnecting() { return this; }
    onTyping(cb: (userId: string) => void) { onTyping = cb; return this; }
    onPosted(cb: (post: { user_id: string; channel_id: string }) => void) { onPosted = cb; return this; }
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
    ({ users, text }: { users: Record<string, MattermostUser>; text: string }) =>
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
        composerText: text,
        setIsWebSocketActive: vi.fn(),
        setReconnectAttempt: vi.fn(),
        setReconnectDelay: vi.fn(),
        isWebSocketActive
      }),
    { initialProps: { users: usersById, text: "h" } }
  );
}

describe("useChannelWebSocket typing", () => {
  beforeEach(() => {
    onTyping = undefined;
    onConnectionChange = undefined;
    sendTyping.mockClear();
    connect.mockClear();
  });

  // Esie answering the first question in a new DM has no message on the page yet
  it("asks for someone typing who is not loaded yet, then names them", () => {
    const { result, rerender } = setup({});

    act(() => onTyping!("esie-id"));
    expect(result.current.unknownTypingUserIds).toEqual(["esie-id"]);
    expect(result.current.typingUsernames).toEqual([]);

    rerender({ users: { "esie-id": esie }, text: "h" });
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
    result.current.onComposerTextChange("h");
    expect(sendTyping).toHaveBeenCalledWith("c1");
  });

  it("clears someone's typing as soon as their message arrives", () => {
    const { result } = setup({ "esie-id": esie });
    act(() => onTyping!("esie-id"));
    expect(result.current.typingUsernames).toEqual(["@esie"]);

    act(() => onPosted!({ user_id: "esie-id", channel_id: "other" }));
    expect(result.current.typingUsernames).toEqual(["@esie"]);

    act(() => onPosted!({ user_id: "esie-id", channel_id: "c1" }));
    expect(result.current.typingUsernames).toEqual([]);
  });

  it("sends typing from while the connection was opening once it is up", () => {
    const { result } = setup({}, false);
    result.current.onComposerTextChange("h");
    expect(sendTyping).not.toHaveBeenCalled();

    act(() => onConnectionChange!(true));
    expect(sendTyping).toHaveBeenCalledTimes(1);
    expect(sendTyping).toHaveBeenCalledWith("c1");

    // only once, and not for typing long gone
    act(() => onConnectionChange!(true));
    expect(sendTyping).toHaveBeenCalledTimes(1);
  });

  it("does not announce typing for a message already sent while offline", () => {
    const { result } = setup({}, false);
    result.current.onComposerTextChange("h");
    result.current.clearQueuedTyping();

    act(() => onConnectionChange!(true));
    expect(sendTyping).not.toHaveBeenCalled();
  });

  // however it empties: cleared by hand, edit canceled (button or Escape), sent
  it("does not announce typing after the box was emptied while offline", () => {
    const { result, rerender } = setup({}, false);
    result.current.onComposerTextChange("h");
    rerender({ users: {}, text: "" });

    act(() => onConnectionChange!(true));
    expect(sendTyping).not.toHaveBeenCalled();
  });

  it("sends nothing for an empty box", () => {
    const { result } = setup({});
    result.current.onComposerTextChange("");
    expect(sendTyping).not.toHaveBeenCalled();
  });

  it("retries a dropped connection from typing at most once every few seconds", () => {
    vi.useFakeTimers();
    try {
      const { result } = setup({}, false);
      connect.mockClear();
      for (let i = 0; i < 20; i++) result.current.onComposerTextChange("h");
      expect(connect).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5001);
      result.current.onComposerTextChange("h");
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  // the channel view is too heavy to render here: pin that sending a message and saving an edit
  // both drop queued typing, by clearing it before the two paths split
  it("is cleared by the composer on every submit, edits included", () => {
    const view = readFileSync(join(__dirname, "../../../features/chat/mattermost-channel-view.tsx"), "utf8");
    const submit = view.slice(view.indexOf("const submitMessage = () => {"));
    const clear = submit.indexOf("clearQueuedTyping();");
    expect(clear).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(submit.indexOf("if (editingPost) {"));
    // and hands the hook the live composer text, so canceling an edit or clearing the box drops it too
    expect(view).toContain("composerText: message,");
  });
});
