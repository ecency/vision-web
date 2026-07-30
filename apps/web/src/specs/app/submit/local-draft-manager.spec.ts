import { SUBMIT_TITLE_MAX_LENGTH } from "@/app/submit/_consts";
import { useLocalDraftManager } from "@/app/submit/_hooks/local-draft-manager";
import { PREFIX } from "@/utils/local-storage";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = PREFIX + "_local_draft";

// Regression: the waves composer and the deck threads form persist an
// overflowing post as { ...localDraft, body } into this shared key, with
// localDraft defaulting to {}. That stores a draft carrying neither title nor
// tags, and the submit page passed title straight into applyTitle ->
// value.slice(...), so every later visit to /submit crashed on mount
// (ECENCY-NEXT-1GJC). The manager now substitutes empty values for whichever
// fields the stored draft is missing.
function renderManager(
  onDraftLoaded: (
    title: string,
    tags: string[],
    body: string,
    description: string | null
  ) => void = vi.fn(),
  route: {
    path?: string;
    username?: string;
    permlink?: string;
    draftId?: string;
  } = {}
) {
  const { path = "/submit", username, permlink, draftId } = route;
  const view = renderHook(() =>
    useLocalDraftManager(path, username, permlink, draftId, onDraftLoaded)
  );
  return { ...view, onDraftLoaded };
}

describe("useLocalDraftManager", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("substitutes empty values for a draft stored without title and tags", () => {
    localStorage.setItem(KEY, JSON.stringify({ body: "an overflowing wave" }));

    const { onDraftLoaded } = renderManager();

    expect(onDraftLoaded).toHaveBeenCalledWith("", [], "an overflowing wave", null);
  });

  it("survives a consumer that treats title as a string and tags as an array", () => {
    localStorage.setItem(KEY, JSON.stringify({ body: "an overflowing wave" }));

    // Mirrors applyTitle/applyTags on the submit page, which is where the
    // TypeError was raised.
    const applied = { title: "unset", tags: ["unset"] };
    expect(() =>
      renderManager((title, tags) => {
        applied.title = title.slice(0, SUBMIT_TITLE_MAX_LENGTH);
        applied.tags = tags.filter((tag) => !!tag);
      })
    ).not.toThrow();

    expect(applied).toEqual({ title: "", tags: [] });
  });

  it("passes a complete draft through untouched", () => {
    const draft = { title: "a title", tags: ["hive", "ecency"], body: "a body" };
    localStorage.setItem(KEY, JSON.stringify(draft));

    const { onDraftLoaded, result } = renderManager();

    expect(onDraftLoaded).toHaveBeenCalledWith(draft.title, draft.tags, draft.body, null);
    expect(result.current.isNewPostRoute).toBe(true);
  });

  // The publish composer hands a post over through this key when leaving for
  // the classic editor. Dropping the description here meant a custom meta
  // description was silently replaced by whatever the persisted advanced state
  // still held, and then written back over the transferred one.
  it("restores a description carried over from the composer", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        title: "a title",
        tags: ["hive"],
        body: "a body",
        description: "a hand-written summary"
      })
    );

    const { onDraftLoaded } = renderManager();

    expect(onDraftLoaded).toHaveBeenCalledWith(
      "a title",
      ["hive"],
      "a body",
      "a hand-written summary"
    );
  });

  it("loads nothing for a missing or empty draft", () => {
    const missing = renderManager();
    expect(missing.onDraftLoaded).not.toHaveBeenCalled();

    localStorage.setItem(KEY, JSON.stringify({}));

    const empty = renderManager();
    expect(empty.onDraftLoaded).not.toHaveBeenCalled();
  });

  // Regression, two causes. useEntryTypeDetection used to publish
  // isEntry/isDraft from an effect, so they were still false during the commit
  // in which this hook's useMount runs; and it also required an activeUser,
  // which client-init only loads in a post-mount effect and which is therefore
  // null on every first render. Either alone kept the guard open, so opening a
  // saved draft or an entry edit restored the unrelated /submit local draft
  // over it. These run under the global mock's null active user on purpose -
  // that is the real first-render condition.
  it("does not restore the local draft on the draft route", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ title: "a title", tags: ["hive"], body: "a body" })
    );

    const { onDraftLoaded, result } = renderManager(vi.fn(), {
      path: "/draft/abc123",
      draftId: "abc123"
    });

    expect(onDraftLoaded).not.toHaveBeenCalled();
    expect(result.current.isNewPostRoute).toBe(false);
  });

  it("does not restore the local draft on the entry edit route", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ title: "a title", tags: ["hive"], body: "a body" })
    );

    const { onDraftLoaded, result } = renderManager(vi.fn(), {
      path: "/@coloneljethro/error-404-title-not-found/edit",
      username: "@coloneljethro",
      permlink: "error-404-title-not-found"
    });

    expect(onDraftLoaded).not.toHaveBeenCalled();
    expect(result.current.isNewPostRoute).toBe(false);
  });
});
