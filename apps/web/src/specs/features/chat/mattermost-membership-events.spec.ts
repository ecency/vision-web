import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { MattermostWebSocket } from "@/features/chat/mattermost-websocket";

function handle(qc: QueryClient, message: unknown) {
  const ws = new MattermostWebSocket().withQueryClient(qc);
  (ws as unknown as { handleUserChange: (m: unknown) => void }).handleUserChange(message);
}

describe("MattermostWebSocket membership events", () => {
  it("refreshes the channel list when the viewer is removed from a channel", () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    // Mattermost tells the removed person in a user-scoped event: the channel
    // is only in data, since they are no longer in it.
    handle(qc, {
      event: "user_removed",
      data: { channel_id: "c1", remover_id: "admin" },
      broadcast: { channel_id: "", user_id: "me" }
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mattermost-channels"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mattermost-posts-infinite", "c1"] });
  });

  it("refreshes for a change announced to the whole channel", () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    handle(qc, { event: "user_added", data: { user_id: "bob" }, broadcast: { channel_id: "c1" } });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["mattermost-channels"] });
  });
});
