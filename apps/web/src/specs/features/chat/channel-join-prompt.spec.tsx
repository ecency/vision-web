import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mutate = vi.fn();
let joinState: { error: Error | null; isPending: boolean } = { error: null, isPending: false };

vi.mock("@/features/chat/mattermost-api", () => ({
  useMattermostJoinChannel: () => ({ mutate, reset: vi.fn(), ...joinState })
}));

import { ChannelJoinPrompt } from "@/features/chat/components/channel-join-prompt";

describe("ChannelJoinPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    joinState = { error: null, isPending: false };
  });

  it("joins the channel and reports success", () => {
    const onJoined = vi.fn();
    render(<ChannelJoinPrompt channelId="c-1" onJoined={onJoined} />);

    fireEvent.click(screen.getByRole("button", { name: "chat.join-channel-button" }));

    expect(mutate).toHaveBeenCalledWith("c-1", expect.objectContaining({ onSuccess: expect.any(Function) }));
    mutate.mock.calls[0][1].onSuccess();
    expect(onJoined).toHaveBeenCalled();
  });

  it.each(["forbidden", "Mattermost request failed (404): {}", "Mattermost request failed (400): {}"])(
    "says the conversation is not accessible and drops the button when the join fails with %s",
    (message) => {
      joinState = { error: new Error(message), isPending: false };
      render(<ChannelJoinPrompt channelId="c-1" onJoined={vi.fn()} />);

      expect(screen.getByText("chat.join-no-access")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
    }
  );

  it("shows any other join error and keeps the button for a retry", () => {
    joinState = { error: new Error("Mattermost request timed out"), isPending: false };
    render(<ChannelJoinPrompt channelId="c-1" onJoined={vi.fn()} />);

    expect(screen.getByText("Mattermost request timed out")).toBeTruthy();
    expect(screen.getByRole("button", { name: "chat.join-channel-button" })).toBeTruthy();
  });
});
