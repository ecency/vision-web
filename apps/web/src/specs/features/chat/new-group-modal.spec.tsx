import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { setupModalContainers } from "@/specs/test-utils";

const mutate = vi.fn();
const reset = vi.fn();
let groupState: { isPending: boolean; error: Error | null } = { isPending: false, error: null };
let searchUsers: Array<{ id: string; username: string }> = [];

vi.mock("@/features/chat/mattermost-api", () => ({
  useMattermostUserSearch: () => ({ data: { users: searchUsers }, isFetching: false }),
  useMattermostGroupChannel: () => ({ mutate, reset, ...groupState })
}));

vi.mock("@/features/shared/user-avatar", () => ({
  UserAvatar: ({ username }: { username: string }) => <span data-testid={`avatar-${username}`} />
}));

import { NewGroupModal } from "@/features/chat/components/new-group-modal";

function renderModal(props: Partial<React.ComponentProps<typeof NewGroupModal>> = {}) {
  const onCreated = vi.fn();
  render(
    <NewGroupModal show={true} onHide={vi.fn()} currentUsername="me" onCreated={onCreated} {...props} />
  );
  return { onCreated };
}

const pick = (username: string) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`@${username}\\b`) }));

function search(term: string) {
  fireEvent.change(screen.getByPlaceholderText("chat.new-group-search"), { target: { value: term } });
}

describe("NewGroupModal", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.clearAllMocks();
    groupState = { isPending: false, error: null };
    searchUsers = [
      { id: "1", username: "alice" },
      { id: "2", username: "bob" },
      { id: "3", username: "me" }
    ];
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("never offers the viewer and needs two people before it can start", () => {
    renderModal();
    search("al");

    expect(screen.queryByText("@me")).toBeNull();
    const start = screen.getByRole("button", { name: "chat.new-group-create" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);

    pick("alice");
    expect(start.disabled).toBe(true);

    search("bo");
    pick("bob");
    expect(start.disabled).toBe(false);

    fireEvent.click(start);
    expect(mutate).toHaveBeenCalledWith(["alice", "bob"], expect.any(Object));
  });

  it("drops a selected person from the results and lets them be removed", () => {
    renderModal();
    search("al");
    pick("alice");

    search("al");
    // Only the chip remains; alice is no longer offered.
    expect(screen.queryByRole("button", { name: /@alice/ })).toBeNull();
    expect(screen.getByRole("button", { name: /@bob/ })).toBeTruthy();

    fireEvent.click(screen.getByLabelText("chat.new-group-remove"));
    expect(screen.queryByLabelText("chat.new-group-members")).toBeNull();
  });

  it("stops adding at the group size limit", () => {
    searchUsers = Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, username: `user${i}` }));
    renderModal();
    for (let i = 0; i < 7; i++) {
      search("us");
      pick(`user${i}`);
    }

    expect((screen.getByPlaceholderText("chat.new-group-full") as HTMLInputElement).disabled).toBe(true);
  });

  it("shows why the server refused the group", () => {
    groupState = { isPending: false, error: new Error("@bob does not accept messages from you") };
    renderModal();

    expect(screen.getByRole("alert").textContent).toContain("@bob does not accept messages from you");
  });

  it("opens the new channel once created", () => {
    mutate.mockImplementation((_usernames: string[], options: { onSuccess: (v: unknown) => void }) =>
      options.onSuccess({ channelId: "chan-1" })
    );
    const { onCreated } = renderModal();
    search("al");
    pick("alice");
    search("bo");
    pick("bob");
    fireEvent.click(screen.getByRole("button", { name: "chat.new-group-create" }));

    expect(onCreated).toHaveBeenCalledWith("chan-1");
  });
});
