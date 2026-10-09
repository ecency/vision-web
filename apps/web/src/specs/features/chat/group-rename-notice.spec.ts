import { describe, expect, it } from "vitest";
import { getDisplayMessage, isChannelNoticePost } from "@/features/chat/format-utils";
import type { MattermostPost } from "@/features/chat/mattermost-api";

const post = (overrides: Partial<MattermostPost>) =>
  ({ id: "p", user_id: "u", message: "raw", create_at: 0, ...overrides }) as MattermostPost;

describe("group rename notices", () => {
  it("shows a header change as a rename, not Mattermost's header wording", () => {
    const renamed = post({ type: "system_header_change", props: { new_header: " Book club " } });
    const cleared = post({ type: "system_header_change", props: { new_header: "" } });

    expect(getDisplayMessage(renamed)).not.toBe("raw");
    expect(getDisplayMessage(renamed)).toContain("chat.group-renamed");
    expect(getDisplayMessage(cleared)).toContain("chat.group-name-cleared");
  });

  it("renders joins and renames as notices, and ordinary messages as messages", () => {
    expect(isChannelNoticePost({ type: "system_header_change" })).toBe(true);
    expect(isChannelNoticePost({ type: "system_add_to_channel" })).toBe(true);
    expect(isChannelNoticePost({ type: "" })).toBe(false);
  });
});
