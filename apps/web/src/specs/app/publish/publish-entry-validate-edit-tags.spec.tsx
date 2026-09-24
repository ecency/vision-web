import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Entry } from "@/entities";

const h = vi.hoisted(() => ({ editPost: vi.fn(async () => undefined) }));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
vi.mock("@/app/publish/_hooks", async () =>
  vi.importActual("@/app/publish/_hooks/use-publish-state")
);
vi.mock("@/app/publish/entry/[author]/[permlink]/_hooks", () => ({
  usePostEdit: () => ({ mutateAsync: h.editPost, isPending: false })
}));
vi.mock("@/app/publish/_components/publish-validate-post-meta", () => ({
  PublishValidatePostMeta: () => null
}));
vi.mock("@/app/publish/_components/publish-validate-post-thumbnail-picker", () => ({
  PublishValidatePostThumbnailPicker: () => null
}));
vi.mock("@/app/submit/_components", () => ({ TagSelector: () => null }));
vi.mock("@/features/shared", () => ({ error: vi.fn() }));

import { PublishStateProvider, usePublishState } from "@/app/publish/_hooks/use-publish-state";
import { PublishEntryValidateEdit } from "@/app/publish/entry/[author]/[permlink]/_components/publish-entry-validate-edit";
import { error } from "@/features/shared";
import { renderWithQueryClient } from "@/specs/test-utils";

const entry = { json_metadata: { tags: ["hive", "3speak"] } } as unknown as Entry;

function openEdit(tags: string[]) {
  const state: { current: ReturnType<typeof usePublishState> | null } = { current: null };
  function Harness() {
    state.current = usePublishState();
    return <PublishEntryValidateEdit entry={entry} onClose={() => {}} onSuccess={() => {}} />;
  }
  renderWithQueryClient(
    <PublishStateProvider>
      <Harness />
    </PublishStateProvider>
  );
  act(() => state.current!.setTags(tags));
}

describe("composer edit tag check", () => {
  beforeEach(() => {
    h.editPost.mockClear();
    vi.mocked(error).mockClear();
  });

  it("refuses an added tag the rules reject", async () => {
    openEdit(["hive", "3speak", "2026recap"]);

    await act(async () => fireEvent.click(screen.getByText("submit.update")));

    expect(h.editPost).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("tag-selector.limited_firstchar");
  });

  // 3speak fails the first-character rule but the post already carries it.
  it("updates a post keeping the tags it was published with", async () => {
    openEdit(["hive", "3speak"]);

    await act(async () => fireEvent.click(screen.getByText("submit.update")));

    expect(error).not.toHaveBeenCalled();
    expect(h.editPost).toHaveBeenCalled();
  });
});
