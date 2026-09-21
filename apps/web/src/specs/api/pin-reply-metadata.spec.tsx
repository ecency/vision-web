import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/specs/test-utils";

/**
 * The real `useUpdateReply` runs here, stubbed only at its leaves, so these
 * cases read the operation that would actually be broadcast rather than the
 * argument one hook hands another. A title dropped between the two (the
 * `title: ""` this path used to hardcode) is invisible from the hook boundary.
 */
const sdkUpdateReply = vi.fn(async () => ({ id: "tx" }));
vi.mock("@/api/sdk-mutations", () => ({
  useUpdateReplyMutation: () => ({ mutateAsync: sdkUpdateReply })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" } })
}));

vi.mock("@/api/mutations/validate-post-updating", () => ({
  useValidatePostUpdating: () => ({ mutateAsync: vi.fn(async () => true) })
}));

vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    useUpdateEntry: () => ({ updateEntryQueryData: vi.fn() })
  }
}));

// The global "@ecency/sdk" mock does not carry the cache writers this path uses.
vi.mock("@ecency/sdk", () => ({
  updateEntryInCache: vi.fn(),
  restoreEntryInCache: vi.fn()
}));

vi.mock("@/features/shared", () => ({ error: vi.fn(), success: vi.fn() }));

// "@/utils" is globally mocked down to two helpers; the blank-body guard is a
// real gate on this path, so hand out the real implementation of just that one.
vi.mock("@/utils", async () => {
  const { isBlankBody } =
    await vi.importActual<typeof import("@/utils/is-blank-body")>("@/utils/is-blank-body");
  return { isBlankBody, random: vi.fn(), getAccessToken: vi.fn(() => "mock-token") };
});

import { usePinReply } from "@/api/mutations/pin-reply";
import { useUpdateReply } from "@/api/mutations/update-reply";
import type { Entry } from "@/entities";

/** The comment operation the pin would broadcast. */
function broadcastOp() {
  return sdkUpdateReply.mock.calls.at(-1)![0] as unknown as {
    author: string;
    permlink: string;
    parentAuthor: string;
    parentPermlink: string;
    title: string;
    body: string;
    jsonMetadata: Record<string, unknown>;
  };
}

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
    sdkUpdateReply.mockClear();
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

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    const jsonMeta = broadcastOp().jsonMetadata;

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

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    expect(broadcastOp().title).toBe("The famous Balkan meatball");
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

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    expect(broadcastOp().jsonMetadata.tags).toEqual([]);
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

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    expect(broadcastOp().jsonMetadata.pinned_reply).toBeUndefined();
    expect(broadcastOp().jsonMetadata.image).toEqual(["https://i.ecency.com/DQmZ/y.png"]);
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

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    const op = broadcastOp();
    expect(op.permlink).toBe("a-post");
    expect(op.body).toBe("the post body");
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
    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    // The explicit key has to follow the spread, or the stale pin wins and the
    // post can never pin another reply or be unpinned.
    expect(broadcastOp().jsonMetadata.pinned_reply).toBe("bob/a-reply");

    await result.current.mutateAsync({ pin: false });
    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalledTimes(2));
    expect(broadcastOp().jsonMetadata.pinned_reply).toBeUndefined();
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

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    const jsonMeta = broadcastOp().jsonMetadata;
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
    expect(sdkUpdateReply).not.toHaveBeenCalled();
  });
});

/**
 * The title default belongs to the update path, not to its callers: a comment
 * has none, so it sends "", while a caller editing a ROOT POST must be able to
 * carry the post's own title through. A comment operation replaces the title
 * either way.
 */
describe("useUpdateReply title", () => {
  beforeEach(() => {
    sdkUpdateReply.mockClear();
  });

  it("sends an empty title for a comment, which has none", async () => {
    const comment = {
      author: "alice",
      permlink: "re-a-post",
      parent_author: "bob",
      parent_permlink: "a-post",
      body: "the reply body",
      json_metadata: {}
    } as unknown as Entry;

    const { result } = renderHook(() => useUpdateReply(comment), { wrapper });
    await result.current.mutateAsync({
      text: "an edited reply",
      jsonMeta: { tags: ["hive"] },
      point: true
    });

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    expect(broadcastOp().title).toBe("");
  });

  it("carries a title the caller passes through to the operation", async () => {
    const post = {
      author: "alice",
      permlink: "a-post",
      parent_author: "",
      parent_permlink: "hive-125125",
      category: "hive-125125",
      body: "the post body",
      json_metadata: {}
    } as unknown as Entry;

    const { result } = renderHook(() => useUpdateReply(post), { wrapper });
    await result.current.mutateAsync({
      text: "the post body",
      jsonMeta: { tags: ["hive"] },
      point: true,
      title: "The famous Balkan meatball"
    });

    await waitFor(() => expect(sdkUpdateReply).toHaveBeenCalled());
    expect(broadcastOp().title).toBe("The famous Balkan meatball");
  });
});
