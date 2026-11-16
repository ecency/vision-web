import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";
import {
  readAutosavePointer,
  writeAutosavePointer
} from "@/app/publish/_utils/autosave-pointer";

// Deleting a draft from the Drafts list must take /publish's resume offer for
// it along, or the next empty /publish offers a draft that no longer exists.
const onDeleted = vi.hoisted(() => ({ current: (_id: string) => {} }));

vi.mock("@/api/mutations", () => ({
  useCloneDraft: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDraft: (cb: (id: string) => void) => {
    onDeleted.current = cb;
    return { mutateAsync: vi.fn() };
  }
}));

vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@ecency/sdk")>()),
  getDraftsInfiniteQueryOptions: () => ({
    queryKey: ["drafts-infinite"],
    queryFn: () => new Promise(() => {}),
    initialPageParam: 0,
    getNextPageParam: () => undefined
  })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ username: "alice", activeUser: { username: "alice" } })
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/publish"
}));

import { DraftsList } from "@/features/shared/drafts/drafts-list";

describe("DraftsList delete and the resume offer", () => {
  beforeEach(() => localStorage.clear());

  it("forgets the pointer to the deleted draft", () => {
    writeAutosavePointer("alice", "d1", 1234);
    renderWithQueryClient(<DraftsList onHide={() => {}} />);

    onDeleted.current("d1");

    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  it("keeps the pointer when some other draft is deleted", () => {
    writeAutosavePointer("alice", "d1", 1234);
    renderWithQueryClient(<DraftsList onHide={() => {}} />);

    onDeleted.current("d2");

    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 1234 });
  });
});
