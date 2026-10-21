import { act, render, waitFor } from "@testing-library/react";
import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// TipTap 3 opens the suggestion popup before items() resolves, with
// items: [] and loading: true. The list must not claim "No result" then.

const search = vi.hoisted(() => {
  const state = { resolve: () => {}, results: [] as string[] };
  return {
    state,
    client: {
      prefetchQuery: () =>
        new Promise<void>((resolve) => {
          state.resolve = resolve;
        }),
      getQueryData: () => state.results
    }
  };
});

vi.mock("@/core/react-query", () => ({ getQueryClient: () => search.client }));
vi.mock("@/features/shared", () => ({ UserAvatar: () => null }));
vi.mock("@ecency/sdk", () => ({
  getSearchAccountsByUsernameQueryOptions: (query: string) => ({ queryKey: ["search", query] })
}));

import { PublishStarterKit } from "@/features/tiptap-editor/extensions/publish-starter-kit";
import { UserMentionExtensionConfig } from "@/features/tiptap-editor/extensions/user-mention-extension-config";

function TestEditor({ onReady }: { onReady: (editor: NonNullable<ReturnType<typeof useEditor>>) => void }) {
  const editor = useEditor({
    extensions: [
      PublishStarterKit,
      Mention.configure({ suggestion: UserMentionExtensionConfig as any })
    ],
    content: "<p></p>"
  });
  if (editor) onReady(editor);
  return <EditorContent editor={editor} />;
}

describe("mention suggestion while loading", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="popper-container"></div>';
    search.state.results = [];
  });

  it("shows nothing until results arrive, then the results", async () => {
    let editor: any;
    render(<TestEditor onReady={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());

    act(() => {
      editor.chain().focus().insertContent("@ab").run();
    });

    const popper = document.getElementById("popper-container")!;
    await new Promise((r) => setTimeout(r, 50));
    expect(popper.textContent).not.toContain("No result");

    search.state.results = ["ecency"];
    await act(async () => {
      search.state.resolve();
    });

    await waitFor(() => expect(popper.textContent).toContain("ecency"));
    expect(popper.textContent).not.toContain("No result");
  });

  it("says No result once the search finished empty", async () => {
    let editor: any;
    render(<TestEditor onReady={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());

    act(() => {
      editor.chain().focus().insertContent("@zz").run();
    });
    await act(async () => {
      search.state.resolve();
    });

    await waitFor(() =>
      expect(document.getElementById("popper-container")!.textContent).toContain("No result")
    );
  });

  it("keeps the previous results while the next search runs", async () => {
    let editor: any;
    render(<TestEditor onReady={(e) => (editor = e)} />);
    await waitFor(() => expect(editor).toBeDefined());
    const popper = document.getElementById("popper-container")!;

    act(() => {
      editor.chain().focus().insertContent("@ab").run();
    });
    search.state.results = ["ecency"];
    await act(async () => {
      search.state.resolve();
    });
    await waitFor(() => expect(popper.textContent).toContain("ecency"));

    // Next keystroke starts a new search that has not resolved yet.
    act(() => {
      editor.chain().insertContent("c").run();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(popper.textContent).toContain("ecency");
  });
});
