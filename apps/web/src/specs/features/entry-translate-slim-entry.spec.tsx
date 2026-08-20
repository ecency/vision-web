import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntryTranslate } from "@/features/shared/entry-translate";
import { getTranslation, getLanguages } from "@/api/translation";
import { EcencyEntriesCacheManagement } from "@/core/caches";
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

function slimRow(): Entry {
  return {
    author: "alice",
    permlink: "slim-post",
    title: "A title",
    body: "",
    json_metadata: { description: "A title" }
  } as Entry;
}

function renderModal(entry: Entry) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <EntryTranslate entry={entry} onHide={() => {}} />
    </QueryClientProvider>
  );
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
      queryFn: async () => ({ ...slimRow(), body: "el cuerpo completo del post" }),
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

    renderModal({ ...slimRow(), body: "cuerpo ya presente" });

    await waitFor(() => expect(getTranslation).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getTranslation).mock.calls[0][0]).toContain("cuerpo ya presente");
  });
});
