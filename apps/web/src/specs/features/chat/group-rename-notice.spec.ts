import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getGroupRenameText, isChannelNoticePost } from "@/features/chat/format-utils";
import { useMessageRendering } from "@/features/chat/hooks/use-message-rendering";
import type { MattermostPost } from "@/features/chat/mattermost-api";

const post = (overrides: Partial<MattermostPost>) =>
  ({ id: "p", user_id: "u1", message: "raw", create_at: 0, ...overrides }) as MattermostPost;

const hookProps = {
  usersById: { u1: { id: "u1", username: "alice" } },
  usersByUsername: {},
  activeUsername: undefined,
  startDirectMessage: () => {},
  normalizeUsername: (username?: string | null) => username ?? undefined
};

describe("group rename notices", () => {
  it("words a header change as a rename", () => {
    const renamed = post({ type: "system_header_change", props: { new_header: " Book club " } });
    const cleared = post({ type: "system_header_change", props: { new_header: "" } });

    expect(getGroupRenameText(renamed)).toContain("chat.group-renamed");
    expect(getGroupRenameText(cleared)).toContain("chat.group-name-cleared");
  });

  it("calls it a rename only in a group, keeping Mattermost's wording elsewhere", () => {
    const change = post({
      type: "system_header_change",
      message: "@alice updated the channel header to: Welcome",
      props: { new_header: "Welcome" }
    });

    const group = renderHook(() => useMessageRendering({ ...hookProps, channelType: "G" }));
    const open = renderHook(() => useMessageRendering({ ...hookProps, channelType: "O" }));

    expect(group.result.current.getDecodedDisplayMessage(change)).toContain("chat.group-renamed");
    expect(open.result.current.getDecodedDisplayMessage(change)).toBe(
      "@alice updated the channel header to: Welcome"
    );
  });

  it("renders joins and renames as notices, and ordinary messages as messages", () => {
    expect(isChannelNoticePost({ type: "system_header_change" })).toBe(true);
    expect(isChannelNoticePost({ type: "system_add_to_channel" })).toBe(true);
    expect(isChannelNoticePost({ type: "" })).toBe(false);
  });
});
