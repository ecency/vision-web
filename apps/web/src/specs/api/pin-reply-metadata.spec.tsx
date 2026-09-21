import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/specs/test-utils";

const updateReply = vi.fn(async () => ({}));
const updateReplyTarget = vi.fn();
vi.mock("@/api/mutations/update-reply", () => ({
  useUpdateReply: (entry: unknown) => {
    updateReplyTarget(entry);
    return { mutateAsync: updateReply };
  }
}));

import { usePinReply } from "@/api/mutations/pin-reply";
import type { Entry } from "@/entities";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
);

const reply = { author: "bob", permlink: "a-reply" } as Entry;

/**
 * Pinning re-broadcasts the PARENT POST, and a comment operation replaces its
 * json_metadata rather than merging into it, so whatever this builds is the
 * post's metadata from then on.
 */
describe("usePinReply metadata", () => {
  beforeEach(() => {
    updateReply.mockClear();
    updateReplyTarget.mockClear();
  });

  it("keeps everything the post carried and changes only pinned_reply", async () => {
    const parent = {
      author: "alice",
      permlink: "a-post",
      body: "the post body",
      json_metadata: {
        tags: ["photography", "hive"],
        image: ["https://i.ecency.com/DQmX/cover.png"],
        thumbnails: ["https://i.ecency.com/DQmX/cover.png"],
        image_ratios: ["1.7778"],
        description: "the author's own summary",
        content_type: "poll"
      }
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await result.current.mutateAsync({ pin: true });

    await waitFor(() => expect(updateReply).toHaveBeenCalled());
    const { jsonMeta } = updateReply.mock.calls[0][0] as unknown as { jsonMeta: Record<string, unknown> };

    expect(jsonMeta.pinned_reply).toBe("bob/a-reply");
    expect(jsonMeta.tags).toEqual(["photography", "hive"]);
    expect(jsonMeta.image).toEqual(["https://i.ecency.com/DQmX/cover.png"]);
    expect(jsonMeta.thumbnails).toEqual(["https://i.ecency.com/DQmX/cover.png"]);
    expect(jsonMeta.image_ratios).toEqual(["1.7778"]);
    expect(jsonMeta.description).toBe("the author's own summary");
    expect(jsonMeta.content_type).toBe("poll");
  });

  it("carries the post's title, which the operation would otherwise blank", async () => {
    // The update path defaults the title to "" because a comment has none. This
    // caller updates a ROOT POST, and a comment operation replaces the title, so
    // a missing one here publishes an empty title over the author's own.
    const parent = {
      author: "alice",
      permlink: "a-post",
      title: "The famous Balkan meatball",
      body: "the post body",
      json_metadata: { tags: ["food"] }
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await result.current.mutateAsync({ pin: true });

    const payload = updateReply.mock.calls[0][0] as unknown as { title?: string };
    expect(payload.title).toBe("The famous Balkan meatball");
  });

  it("does not invent tags for a post that has none", async () => {
    const parent = {
      author: "alice",
      permlink: "a-post",
      body: "the post body",
      json_metadata: { tags: [], image: ["https://i.ecency.com/DQmY/x.png"] }
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await result.current.mutateAsync({ pin: true });

    const { jsonMeta } = updateReply.mock.calls.at(-1)![0] as unknown as {
      jsonMeta: Record<string, unknown>;
    };
    expect(jsonMeta.tags).toEqual([]);
  });

  it("drops pinned_reply when unpinning, without touching the rest", async () => {
    const parent = {
      author: "alice",
      permlink: "a-post",
      body: "the post body",
      json_metadata: { tags: ["hive"], image: ["https://i.ecency.com/DQmZ/y.png"] }
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await result.current.mutateAsync({ pin: false });

    const { jsonMeta } = updateReply.mock.calls.at(-1)![0] as unknown as {
      jsonMeta: Record<string, unknown>;
    };
    expect(jsonMeta.pinned_reply).toBeUndefined();
    expect(jsonMeta.image).toEqual(["https://i.ecency.com/DQmZ/y.png"]);
  });

  it("updates the POST, with the post's own body", async () => {
    // Swapping these two addresses the reply's permlink instead, which would
    // broadcast the post's body and metadata over the reply.
    const parent = {
      author: "alice",
      permlink: "a-post",
      title: "a title",
      body: "the post body",
      json_metadata: { tags: ["hive"] }
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await result.current.mutateAsync({ pin: true });

    expect(updateReplyTarget).toHaveBeenCalledWith(parent);
    const payload = updateReply.mock.calls[0][0] as unknown as { text: string };
    expect(payload.text).toBe("the post body");
  });

  it("replaces a pin the post already had, and clears it on unpin", async () => {
    const parent = {
      author: "alice",
      permlink: "a-post",
      body: "the post body",
      json_metadata: { tags: ["hive"], pinned_reply: "carol/an-older-reply" }
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await result.current.mutateAsync({ pin: true });
    let { jsonMeta } = updateReply.mock.calls.at(-1)![0] as unknown as {
      jsonMeta: Record<string, unknown>;
    };
    // The explicit key has to follow the spread, or the stale pin wins and the
    // post can never pin another reply or be unpinned.
    expect(jsonMeta.pinned_reply).toBe("bob/a-reply");

    await result.current.mutateAsync({ pin: false });
    ({ jsonMeta } = updateReply.mock.calls.at(-1)![0] as unknown as {
      jsonMeta: Record<string, unknown>;
    });
    expect(jsonMeta.pinned_reply).toBeUndefined();
  });

  it("reads metadata that arrived as a string, and never spreads it", async () => {
    // condenser_api.get_content returns json_metadata as a string, and the decks
    // notifications column fetches through it. Spreading that publishes one key
    // per character over the post's metadata.
    const parent = {
      author: "alice",
      permlink: "a-post",
      body: "the post body",
      json_metadata: '{"tags":["hive"],"image":["https://i.ecency.com/DQmX/cover.png"]}'
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await result.current.mutateAsync({ pin: true });

    const { jsonMeta } = updateReply.mock.calls.at(-1)![0] as unknown as {
      jsonMeta: Record<string, unknown>;
    };
    expect(jsonMeta.tags).toEqual(["hive"]);
    expect(jsonMeta.image).toEqual(["https://i.ecency.com/DQmX/cover.png"]);
    expect(jsonMeta["0"]).toBeUndefined();
  });

  it("refuses to publish when the metadata cannot be read at all", async () => {
    // A search-deck row carries no json_metadata. Publishing then means
    // `{app, format, pinned_reply}` over everything the post had.
    const parent = {
      author: "alice",
      permlink: "a-post",
      body: "the post body"
    } as unknown as Entry;

    const { result } = renderHook(() => usePinReply(reply, parent), { wrapper });
    await expect(result.current.mutateAsync({ pin: true })).rejects.toThrow();
    expect(updateReply).not.toHaveBeenCalled();
  });
});
