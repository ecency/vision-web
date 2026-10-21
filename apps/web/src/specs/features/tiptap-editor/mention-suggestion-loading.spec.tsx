import { act, render, waitFor } from "@testing-library/react";
import Mention from "@tiptap/extension-mention";
import { Editor, EditorContent, useEditor } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { JSX } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// TipTap 3 opens the suggestion popup before items() resolves, and sends
// items: [] with loading: true on every new query. The list must not claim
// "No result" then, keeps the previous results visible meanwhile, and must not
// let those previous results be picked for the new query.

const search = vi.hoisted(() => {
  const state = { resolve: (): void => {}, results: [] as string[] };
  return {
    state,
    client: {
      prefetchQuery: (): Promise<void> =>
        new Promise<void>((resolve) => {
          state.resolve = resolve;
        }),
      prefetchInfiniteQuery: (): Promise<void> =>
        new Promise<void>((resolve) => {
          state.resolve = resolve;
        }),
      // Tags come from an infinite query, accounts from a plain one.
      getQueryData: (queryKey: string[]): string[] | { pages: string[][] } =>
        queryKey[0] === "trending-tags" ? { pages: [state.results] } : state.results
    }
  };
});

vi.mock("@/core/react-query", () => ({ getQueryClient: () => search.client }));
vi.mock("@/features/shared", () => ({ UserAvatar: () => null }));
vi.mock("@ecency/sdk", () => ({
  getSearchAccountsByUsernameQueryOptions: (query: string) => ({ queryKey: ["search", query] }),
  getTrendingTagsQueryOptions: () => ({ queryKey: ["trending-tags"] })
}));

import { PublishStarterKit } from "@/features/tiptap-editor/extensions/publish-starter-kit";
import { TagMentionExtensionConfig } from "@/features/tiptap-editor/extensions/tag-mention-extension-config";
import { UserMentionExtensionConfig } from "@/features/tiptap-editor/extensions/user-mention-extension-config";

function TestEditor({ onReady }: { onReady: (editor: Editor) => void }): JSX.Element {
  const editor = useEditor({
    extensions: [
      PublishStarterKit,
      Mention.configure({
        suggestion: UserMentionExtensionConfig as Partial<SuggestionOptions>
      }),
      Mention.extend({ name: "tag", priority: 102 }).configure({
        suggestion: TagMentionExtensionConfig as Partial<SuggestionOptions>
      })
    ],
    content: "<p></p>"
  });
  if (editor) onReady(editor);
  return <EditorContent editor={editor} />;
}

async function mountEditor(): Promise<Editor> {
  let editor: Editor | undefined;
  render(<TestEditor onReady={(e) => (editor = e)} />);
  await waitFor(() => expect(editor).toBeDefined());
  return editor!;
}

const popper = (): HTMLElement => document.getElementById("popper-container")!;
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

async function showFirstResults(editor: Editor): Promise<void> {
  act(() => {
    editor.chain().focus().insertContent("@ab").run();
  });
  search.state.results = ["ecency"];
  await act(async () => {
    search.state.resolve();
  });
  await waitFor(() => expect(popper().textContent).toContain("ecency"));
}

function pressEnter(editor: Editor): void {
  act(() => {
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

describe("mention suggestion while loading", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="popper-container"></div>';
    search.state.results = [];
  });

  it("shows nothing until results arrive, then the results", async () => {
    const editor = await mountEditor();

    act(() => {
      editor.chain().focus().insertContent("@ab").run();
    });
    await tick();
    expect(popper().textContent).not.toContain("No result");

    search.state.results = ["ecency"];
    await act(async () => {
      search.state.resolve();
    });

    await waitFor(() => expect(popper().textContent).toContain("ecency"));
    expect(popper().textContent).not.toContain("No result");
  });

  it("says No result once the search finished empty", async () => {
    const editor = await mountEditor();

    act(() => {
      editor.chain().focus().insertContent("@zz").run();
    });
    await act(async () => {
      search.state.resolve();
    });

    await waitFor(() => expect(popper().textContent).toContain("No result"));
  });

  it("keeps the previous results visible while the next search runs", async () => {
    const editor = await mountEditor();
    await showFirstResults(editor);

    act(() => {
      editor.chain().insertContent("c").run();
    });
    await tick();
    expect(popper().textContent).toContain("ecency");
  });

  it("does not insert a previous result while the next search runs", async () => {
    const editor = await mountEditor();
    await showFirstResults(editor);

    act(() => {
      editor.chain().insertContent("c").run();
    });
    await tick();

    // A result row, not the renderer wrapper around the list.
    const row = Array.from(popper().querySelectorAll("div")).find(
      (element) => element.textContent?.trim() === "ecency" && element.children.length === 0
    );
    expect(row).toBeDefined();
    act(() => {
      row!.click();
    });
    expect(editor.getText()).toBe("@abc");

    pressEnter(editor);

    expect(editor.getText()).toBe("@abc");
    expect(editor.getHTML()).not.toContain('data-type="mention"');

    // Once the current query resolves, its results can be picked.
    search.state.results = ["abc-user"];
    await act(async () => {
      search.state.resolve();
    });
    await waitFor(() => expect(popper().textContent).toContain("abc-user"));
    pressEnter(editor);
    expect(editor.getHTML()).toContain('data-id="abc-user"');
  });

  it("does not insert a previous tag while the next tag search runs", async () => {
    const editor = await mountEditor();

    act(() => {
      editor.chain().focus().insertContent("#ca").run();
    });
    search.state.results = ["cars", "cats"];
    await act(async () => {
      search.state.resolve();
    });
    await waitFor(() => expect(popper().textContent).toContain("#cars"));

    act(() => {
      editor.chain().insertContent("t").run();
    });
    await tick();
    pressEnter(editor);

    expect(editor.getText()).toBe("#cat");
    expect(editor.getHTML()).not.toContain('data-type="tag"');
  });
});
