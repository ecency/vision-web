import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/specs/test-utils";

const updateReply = vi.fn(async () => ({}));
vi.mock("@/api/mutations/update-reply", () => ({
  useUpdateReply: () => ({ mutateAsync: updateReply })
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
  beforeEach(() => updateReply.mockClear());

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
});
