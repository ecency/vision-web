import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { setupModalContainers } from "@/specs/test-utils";

const createMutate = vi.fn();
const manageMutate = vi.fn();
let searchUsers: Array<{ id: string; username: string }> = [];
let details: { data?: unknown; isLoading: boolean; error: Error | null } = { isLoading: false, error: null };

vi.mock("@/features/chat/mattermost-api", () => ({
  useMattermostUserSearch: () => ({ data: { users: searchUsers }, isFetching: false }),
  useMattermostCreatePrivateChannel: () => ({
    mutate: createMutate,
    reset: vi.fn(),
    isPending: false,
    error: null
  }),
  useMattermostPrivateChannel: () => details,
  useMattermostManagePrivateChannel: () => ({
    mutate: manageMutate,
    reset: vi.fn(),
    isPending: false,
    error: null
  })
}));

vi.mock("@/features/shared/user-avatar", () => ({
  UserAvatar: ({ username }: { username: string }) => <span data-testid={`avatar-${username}`} />
}));

import {
  ManagePrivateChannelModal,
  NewPrivateChannelModal
} from "@/features/chat/components/private-channel-modals";

function search(term: string) {
  fireEvent.change(screen.getByPlaceholderText("chat.new-group-search"), { target: { value: term } });
}

const pick = (username: string) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`@${username}\\b`) }));

describe("private channel dialogs", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.clearAllMocks();
    searchUsers = [
      { id: "1", username: "alice" },
      { id: "2", username: "bob" },
      { id: "3", username: "ecency" }
    ];
    details = {
      isLoading: false,
      error: null,
      data: {
        channel: { id: "c1", display_name: "Curators" },
        members: [
          { id: "3", username: "ecency" },
          { id: "2", username: "bob" }
        ]
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("needs a name, then creates the channel with the picked people", () => {
    render(<NewPrivateChannelModal show={true} onHide={vi.fn()} currentUsername="ecency" onCreated={vi.fn()} />);
    const create = screen.getByRole("button", { name: "chat.private-channel-create" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);

    search("a");
    search("al");
    expect(screen.queryByRole("button", { name: /@ecency\b/ })).toBeNull();
    pick("alice");
    fireEvent.change(screen.getByLabelText("chat.private-channel-name"), { target: { value: " Curators " } });
    expect(create.disabled).toBe(false);

    fireEvent.click(create);
    expect(createMutate).toHaveBeenCalledWith({ name: "Curators", usernames: ["alice"] }, expect.any(Object));
  });

  it("lists members, removes one and adds only people not already in", () => {
    render(<ManagePrivateChannelModal show={true} onHide={vi.fn()} channelId="c1" />);

    const bobRow = screen.getByText("@bob").closest("li")!;
    fireEvent.click(within(bobRow).getByRole("button"));
    expect(manageMutate).toHaveBeenCalledWith({ kind: "remove", username: "bob" });

    search("bo");
    expect(screen.queryByRole("button", { name: /@bob\b/ })).toBeNull();
    search("al");
    pick("alice");
    fireEvent.click(screen.getByRole("button", { name: "chat.private-channel-add" }));
    expect(manageMutate).toHaveBeenCalledWith(
      { kind: "add", usernames: ["alice"] },
      expect.any(Object)
    );
  });

  it("renames only to a changed, valid name", () => {
    render(<ManagePrivateChannelModal show={true} onHide={vi.fn()} channelId="c1" />);
    const input = screen.getByLabelText("chat.private-channel-name") as HTMLInputElement;
    const save = screen.getByRole("button", { name: "g.save" }) as HTMLButtonElement;

    expect(input.value).toBe("Curators");
    expect(save.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "Curation team" } });
    fireEvent.click(save);
    expect(manageMutate).toHaveBeenCalledWith({ kind: "rename", name: "Curation team" });
  });
});
