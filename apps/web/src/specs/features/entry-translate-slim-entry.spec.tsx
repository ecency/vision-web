import { screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntryTranslate } from "@/features/shared/entry-translate";
import { getTranslation, getLanguages } from "@/api/translation";
import { mockEntry, renderWithQueryClient } from "@/specs/test-utils";
import type { Entry } from "@/entities";

vi.mock("@/api/translation", () => ({
  getTranslation: vi.fn(async () => ({ translatedText: "hola mundo" })),
  getLanguages: vi.fn(async () => [{ code: "en", name: "English" }])
}));

const fullEntryQuery = vi.fn();
vi.mock("@/core/caches", () => ({
  EcencyEntriesCacheManagement: {
    getEntryQueryByPath: (...args: unknown[]) => fullEntryQuery(...args)
  }
}));

// A feed row as slimEntry leaves it: no body, card text in the metadata.
function slimRow(overrides: Partial<Entry> = {}): Entry {
  return mockEntry({
    author: "alice",
    permlink: "slim-post",
    title: "A title",
    body: "",
    json_metadata: { description: "A title" },
    ...overrides
  });
}

const ENTRY_KEY = ["posts", "entry", "/@alice/slim-post"];

function testClient() {
  // The shared helper's client keeps data fresh forever, which would defeat the
  // refetchOnMount the modal relies on to pull a missing body.
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderModal(entry: Entry, queryClient = testClient()) {
  return renderWithQueryClient(<EntryTranslate entry={entry} onHide={() => {}} />, {
    queryClient
  });
}

describe("EntryTranslate opened from a slim feed row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getLanguages as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { code: "en", name: "English" }
    ]);
  });

  it("fetches the full body and translates that, not the empty one", async () => {
    fullEntryQuery.mockReturnValue({
      queryKey: ["posts", "entry", "/@alice/slim-post"],
      queryFn: async () => slimRow({ body: "el cuerpo completo del post" }),
      select: (d: Entry) => d
    });

    renderModal(slimRow());

    await waitFor(() => expect(getTranslation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getTranslation).mock.calls[0][0]).toContain("el cuerpo completo del post");
  });

  it("shows the error state instead of spinning forever when the body cannot be fetched", async () => {
    fullEntryQuery.mockReturnValue({
      queryKey: ["posts", "entry", "/@alice/slim-post"],
      queryFn: async () => {
        throw new Error("rpc down");
      },
      select: (d: Entry) => d
    });

    renderModal(slimRow());

    await waitFor(() => expect(screen.queryByText(/entry-translate.error/i)).not.toBeNull());
    expect(getTranslation).not.toHaveBeenCalled();
  });

  it("shows the error state when the post is gone (fetch succeeds with no body)", async () => {
    fullEntryQuery.mockReturnValue({
      queryKey: ["posts", "entry", "/@alice/slim-post"],
      queryFn: async () => null,
      select: (d: Entry | null) => d ?? undefined
    });

    renderModal(slimRow());

    await waitFor(() => expect(screen.queryByText(/entry-translate.error/i)).not.toBeNull());
    expect(getTranslation).not.toHaveBeenCalled();
  });

  it("translates a full entry straight away without any extra fetch", async () => {
    fullEntryQuery.mockReturnValue({
      queryKey: ["posts", "entry", "/@alice/full-post"],
      queryFn: async () => {
        throw new Error("must not be called");
      },
      select: (d: Entry) => d
    });

    renderModal(slimRow({ body: "cuerpo ya presente" }));

    await waitFor(() => expect(getTranslation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getTranslation).mock.calls[0][0]).toContain("cuerpo ya presente");
  });

  it("keeps loading while a seeded slim row is being refetched, instead of flashing the error", async () => {
    // Feed cards seed this very key with the slim row, so React Query reports
    // success with an empty body the moment the modal mounts while the forced
    // refetch is still in flight. That is not a failure, and must not surface as
    // one.
    let deliver: (e: Entry) => void = () => {};
    const inFlight = new Promise<Entry>((resolve) => {
      deliver = resolve;
    });
    fullEntryQuery.mockReturnValue({
      queryKey: ENTRY_KEY,
      queryFn: () => inFlight,
      select: (d: Entry) => d
    });

    const queryClient = testClient();
    queryClient.setQueryData(ENTRY_KEY, slimRow());

    renderModal(slimRow(), queryClient);

    await waitFor(() => expect(getLanguages).toHaveBeenCalled());
    expect(screen.queryByText(/entry-translate.error/i)).toBeNull();
    expect(getTranslation).not.toHaveBeenCalled();

    deliver(slimRow({ body: "el cuerpo completo del post" }));

    await waitFor(() => expect(getTranslation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getTranslation).mock.calls[0][0]).toContain("el cuerpo completo del post");
    expect(screen.queryByText(/entry-translate.error/i)).toBeNull();
  });
});
