import { SUBMIT_TITLE_MAX_LENGTH } from "@/app/submit/_consts";
import { useLocalDraftManager } from "@/app/submit/_hooks/local-draft-manager";
import { PREFIX } from "@/utils/local-storage";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = PREFIX + "_local_draft";

// The route guard only engages for a signed-in user, so these tests need a real
// one rather than the null active user the global setup mock hands out.
const activeAccount = vi.hoisted(() => ({
  current: null as { username: string } | null
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: activeAccount.current })
}));

// Regression: the waves composer and the deck threads form persist an
// overflowing post as { ...localDraft, body } into this shared key, with
// localDraft defaulting to {}. That stores a draft carrying neither title nor
// tags, and the submit page passed title straight into applyTitle ->
// value.slice(...), so every later visit to /submit crashed on mount
// (ECENCY-NEXT-1GJC). The manager now substitutes empty values for whichever
// fields the stored draft is missing.
function renderManager(
  onDraftLoaded: (title: string, tags: string[], body: string) => void = vi.fn(),
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
    activeAccount.current = null;
  });

  it("substitutes empty values for a draft stored without title and tags", () => {
    localStorage.setItem(KEY, JSON.stringify({ body: "an overflowing wave" }));

    const { onDraftLoaded } = renderManager();

    expect(onDraftLoaded).toHaveBeenCalledWith("", [], "an overflowing wave");
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

    expect(onDraftLoaded).toHaveBeenCalledWith(draft.title, draft.tags, draft.body);
    expect(result.current.isNewPostRoute).toBe(true);
  });

  it("loads nothing for a missing or empty draft", () => {
    const missing = renderManager();
    expect(missing.onDraftLoaded).not.toHaveBeenCalled();

    localStorage.setItem(KEY, JSON.stringify({}));

    const empty = renderManager();
    expect(empty.onDraftLoaded).not.toHaveBeenCalled();
  });

  // Regression: useEntryTypeDetection used to publish isEntry/isDraft from an
  // effect, so they were still false during the commit in which this hook's
  // useMount ran. The guard below therefore never held, and opening a saved
  // draft or an entry edit restored the unrelated /submit local draft over it.
  it("does not restore the local draft on the draft route", () => {
    activeAccount.current = { username: "coloneljethro" };
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
    activeAccount.current = { username: "coloneljethro" };
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
