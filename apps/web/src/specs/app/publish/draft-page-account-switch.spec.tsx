import { act, render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// #2105: on /publish/drafts/[id], switching accounts must not leave the next
// account editing (and autosaving into) the previous account's draft. The page
// clears the composer, stops autosave and moves to a fresh /publish composer.
const h = vi.hoisted(() => ({
  username: "alice" as string | undefined,
  replace: vi.fn(),
  push: vi.fn(),
  clearAll: vi.fn(),
  autosaveSteps: [] as string[]
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "d1" }),
  useRouter: () => ({ replace: h.replace, push: h.push })
}));
vi.mock("@/core/hooks/use-active-username", () => ({ useActiveUsername: () => h.username }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ username: h.username, activeUser: h.username ? { username: h.username } : null })
}));
vi.mock("@/app/publish/_components", () => ({
  PublishActionBar: () => null,
  PublishEditor: () => <div data-testid="editor" />,
  PublishModeHeader: () => null,
  PublishValidatePost: () => null,
  PublishMultiTabWarning: () => null
}));
vi.mock("@/app/publish/_components/publish-editor-html-warning", () => ({ PublishEditorHtmlWarning: () => null }));
vi.mock("@/app/publish/_components/publish-success-state", () => ({ PublishSuccessState: () => null }));
vi.mock("@/app/publish/drafts/[id]/_components", () => ({ PublishDraftsNoDraft: () => null }));
vi.mock("@/app/publish/_hooks", async () => {
  const noop = () => undefined;
  return {
    usePublishEditor: () => ({ editor: null, setEditorContent: noop }),
    usePublishState: () => ({
      setTitle: noop, setContent: noop, setTags: noop, setLoadedDraftTags: noop, setLocation: noop,
      setReward: noop, setBeneficiaries: noop, loadMetaDescription: noop, setSelectedThumbnail: noop,
      setEntryImages: noop, setPoll: noop, setDecentMemes: noop, setAiTools: noop, clearAll: h.clearAll
    }),
    useAutoSavePublishDraft: (step: string) => {
      h.autosaveSteps.push(step);
      return { lastSaved: null, isActiveTab: true, flush: vi.fn() };
    }
  };
});
vi.mock("@/app/submit/_hooks", () => ({
  useApiDraftDetector: (_id: string, onLoad: (d: unknown) => void) => {
    React.useEffect(() => {
      onLoad({ title: "t", body: "b", tags_arr: [], meta: {} });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return { isError: false };
  }
}));
vi.mock("@/app/publish/_utils/autosave-pointer", () => ({ clearAutosavePointer: vi.fn() }));
vi.mock("i18next", () => ({ default: { t: (k: string) => k } }));

const { default: PublishDraftPage } = await import("@/app/publish/drafts/[id]/_page");

describe("draft editor page account switch", () => {
  beforeEach(() => {
    h.username = "alice";
    h.replace.mockReset();
    h.clearAll.mockReset();
    h.autosaveSteps = [];
  });

  it("clears the composer, stops autosave and goes to /publish when another account signs in", () => {
    const view = render(<PublishDraftPage />);
    expect(view.queryByTestId("editor")).not.toBeNull();
    h.clearAll.mockReset();

    h.username = "bob";
    act(() => view.rerender(<PublishDraftPage />));

    expect(h.clearAll).toHaveBeenCalledTimes(1);
    expect(h.replace).toHaveBeenCalledWith("/publish");
    expect(view.queryByTestId("editor")).toBeNull();
    expect(h.autosaveSteps[h.autosaveSteps.length - 1]).not.toBe("edit");
  });

  it("keeps editing for the account that opened the draft", () => {
    const view = render(<PublishDraftPage />);
    act(() => view.rerender(<PublishDraftPage />));
    expect(h.replace).not.toHaveBeenCalled();
    expect(view.queryByTestId("editor")).not.toBeNull();
  });
});
