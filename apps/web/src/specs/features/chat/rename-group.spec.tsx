import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupModalContainers } from "@/specs/test-utils";
import { useChannelMetadata } from "@/features/chat/hooks/use-channel-metadata";
import { RenameGroupModal } from "@/features/chat/components/rename-group-modal";

function metadataFor(channel: Record<string, unknown>) {
  return renderHook(() =>
    useChannelMetadata({
      channelId: "g1",
      channelData: undefined,
      usersById: {},
      activeUsername: "me",
      channels: { channels: [{ id: "g1", type: "G", name: "x", display_name: "x", ...channel }] },
      showOnlineUsers: false,
      setShowOnlineUsers: () => {}
    })
  ).result.current;
}

describe("who is offered Rename", () => {
  it("offers it to the owner and to anyone while the group has no owner", () => {
    expect(metadataFor({ group_owner: true }).canRenameGroup).toBe(true);
    expect(metadataFor({ group_claimable: true }).canRenameGroup).toBe(true);
    expect(metadataFor({ group_owner: false, group_claimable: false }).canRenameGroup).toBe(false);
    expect(metadataFor({}).canRenameGroup).toBe(false);
  });

  it("titles a named group by its name", () => {
    expect(metadataFor({ group_name: "Book club" }).channelTitle).toBe("Book club");
  });
});

describe("RenameGroupModal", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupModalContainers();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  function renderModal() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RenameGroupModal show={true} onHide={() => {}} channelId="g1" currentName="" />
      </QueryClientProvider>
    );
    return screen.getByRole("textbox") as HTMLInputElement;
  }

  it("counts emoji as one character each, as the server does", () => {
    const input = renderModal();

    fireEvent.change(input, { target: { value: "🙂".repeat(64) } });
    expect(input.value).toBe("🙂".repeat(64));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button", { name: "g.save" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(input, { target: { value: "🙂".repeat(65) } });
    expect(screen.getByRole("alert").textContent).toBe("chat.rename-group-too-long");
    expect((screen.getByRole("button", { name: "g.save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a translated message when someone else owns the group", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Only the person...", code: "not_owner" }), { status: 403 })
    );
    const input = renderModal();

    fireEvent.change(input, { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "g.save" }));

    expect((await screen.findByRole("alert")).textContent).toBe("chat.rename-group-not-owner");
  });
});
