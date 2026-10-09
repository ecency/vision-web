import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { setupModalContainers } from "@/specs/test-utils";

vi.mock("i18next", () => {
  const en: Record<string, string> = {
    "chat.reactor-you": "You",
    "chat.reactor-unknown": "someone",
    "chat.reactors-more": "{{names}} and {{count}} more",
    "chat.reacted-with": "{{names}} reacted with {{emoji}}",
    "chat.see-who-reacted": "See who reacted"
  };
  const t = (key: string, opts: Record<string, unknown> = {}) =>
    (en[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name) => String(opts[name]));
  return { __esModule: true, default: { t, language: "en" } };
});


vi.mock("@/features/shared", () => ({
  UserAvatar: ({ username }: { username: string }) => <span data-testid={`avatar-${username}`} />,
  ProfileLink: ({ children, username }: { children: React.ReactNode; username: string }) => (
    <a href={`/@${username}`}>{children}</a>
  )
}));

import { MessageItem } from "@/features/chat/components/message-item";
import type { MattermostPost, MattermostUser } from "@/features/chat/mattermost-api";

const users: Record<string, MattermostUser> = {
  author: { id: "author", username: "author" },
  u1: { id: "u1", username: "alice" },
  u2: { id: "u2", username: "bob" }
};

const post: MattermostPost = {
  id: "p1",
  user_id: "author",
  channel_id: "c1",
  message: "hello",
  create_at: 1,
  metadata: {
    reactions: [
      { user_id: "u1", post_id: "p1", emoji_name: "+1" },
      { user_id: "me", post_id: "p1", emoji_name: "+1" },
      { user_id: "u2", post_id: "p1", emoji_name: "heart" },
      { user_id: "ghost", post_id: "p1", emoji_name: "heart" }
    ]
  }
};

function renderItem(
  toggleReaction = vi.fn(),
  item: MattermostPost = post,
  renderMessageContent = (content: string) => <span>{content}</span>
) {
  render(
    <MessageItem
      post={item}
      index={0}
      isGroupStart={true}
      showUnreadDivider={false}
      firstUnreadIndex={-1}
      channelId="c1"
      usersById={users}
      channelData={{ member: { user_id: "me" }, channel: { type: "O" } }}
      activeUser={{ username: "me" }}
      postsById={new Map()}
      parentPostById={new Map()}
      getDisplayName={() => "author"}
      getUsername={() => "author"}
      getDecodedDisplayMessage={(p) => p.message}
      renderMessageContent={renderMessageContent}
      normalizeUsername={(name) => name ?? undefined}
      startDirectMessage={vi.fn()}
      openThread={vi.fn()}
      handleReply={vi.fn()}
      handleEdit={vi.fn()}
      handleDelete={vi.fn()}
      handlePinToggle={vi.fn()}
      toggleReaction={toggleReaction}
      openReactionPostId={null}
      setOpenReactionPostId={vi.fn()}
      deletingPostId={null}
      reactMutationPending={false}
      deleteMutationPending={false}
      canPin={false}
      pinMutationPending={false}
    />
  );
}

describe("MessageItem reactions", () => {
  beforeEach(() => setupModalContainers());
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("names who reacted in each pill's tooltip, viewer first", () => {
    renderItem();

    const pills = screen.getAllByRole("button", { pressed: true });
    expect(pills).toHaveLength(1);
    expect(pills[0].getAttribute("title")).toMatch(/^You and @alice reacted with /);

    const heart = screen.getByRole("button", { pressed: false, name: /someone/ });
    expect(heart.getAttribute("title")).toMatch(/^@bob and someone reacted with/);
  });

  it("still toggles the viewer's reaction on click", () => {
    const toggle = vi.fn();
    renderItem(toggle);

    fireEvent.click(screen.getAllByRole("button", { pressed: true })[0]);

    expect(toggle).toHaveBeenCalledWith(post, "+1");
  });

  it("lists every reactor per emoji", () => {
    renderItem();

    fireEvent.click(screen.getByRole("button", { name: "See who reacted" }));

    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("someone")).toBeTruthy();
    const profileLinks = Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(profileLinks).toEqual(expect.arrayContaining(["/@alice", "/@bob"]));
  });

  it("shows a group rename as plain text, never through the markdown renderer", () => {
    const rendered = vi.fn((content: string) => <span data-testid="markdown">{content}</span>);
    const rename = {
      ...post,
      type: "system_header_change",
      message: "renamed the group to \"![x](https://example.com/a.png) [click](https://example.com)\"",
      metadata: {}
    } as MattermostPost;

    renderItem(vi.fn(), rename, rendered);

    expect(rendered).not.toHaveBeenCalled();
    expect(screen.queryByTestId("markdown")).toBeNull();
    expect(screen.getByText(/renamed the group to/).textContent).toContain("[click](https://example.com)");
  });
});
