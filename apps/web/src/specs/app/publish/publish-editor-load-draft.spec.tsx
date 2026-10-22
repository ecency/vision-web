import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// TipTap 3 made setContent emit an update by default. The publish editor's
// onUpdate writes the draft, so loading a draft must not echo it back through
// that path: the stored draft would be re-serialised before the user typed.

const publishState = vi.hoisted(() => ({
  content: "Hello **world**",
  setContent: vi.fn()
}));

vi.mock("@/app/publish/_hooks/use-publish-state", () => ({
  usePublishState: () => publishState
}));
vi.mock("@/app/publish/_hooks/use-publish-links-attach", () => ({
  usePublishLinksAttach: () => undefined
}));
vi.mock("@/app/publish/_hooks/use-editor-drag-drop", () => ({
  useEditorDragDrop: () => undefined
}));
vi.mock("@/app/publish/_editor-extensions", () => ({
  PublishEditorImageViewer: () => null
}));
vi.mock("@/features/shared", () => ({ error: vi.fn() }));

import { usePublishEditor } from "@/app/publish/_hooks/use-publish-editor";
import { applyRewrittenBody } from "@/app/publish/_utils/apply-rewritten-body";

describe("publish editor draft loading", () => {
  beforeEach(() => {
    publishState.content = "Hello **world**";
    publishState.setContent.mockClear();
  });

  it("loads the draft without writing it back", async () => {
    const { result } = renderHook(() => usePublishEditor(() => undefined));

    await waitFor(() => expect(result.current.editor?.getText()).toBe("Hello world"));

    expect(publishState.setContent).not.toHaveBeenCalled();
  });

  it("still writes the draft when the user edits", async () => {
    const { result } = renderHook(() => usePublishEditor(() => undefined));
    await waitFor(() => expect(result.current.editor?.getText()).toBe("Hello world"));

    act(() => {
      result.current.editor!.chain().focus("end").insertContent("!").run();
    });

    expect(publishState.setContent).toHaveBeenCalledTimes(1);
    expect(publishState.setContent.mock.calls[0][0]).toBe("Hello **world!**");
  });

  it("writes an applied rewrite to the draft without another keystroke", async () => {
    const { result } = renderHook(() => usePublishEditor(() => undefined));
    await waitFor(() => expect(result.current.editor?.getText()).toBe("Hello world"));

    act(() => {
      applyRewrittenBody(result.current.editor, "Rewritten **body**");
    });

    expect(result.current.editor?.getText()).toBe("Rewritten body");
    expect(publishState.setContent).toHaveBeenCalledTimes(1);
    expect(publishState.setContent.mock.calls[0][0]).toBe("Rewritten **body**");
  });

  it("keeps text colour when a saved draft is loaded", async () => {
    publishState.content =
      'Hello <span style="color: rgb(220, 38, 38)" class="ecency-text-color-dc2626">red</span>';
    const { result } = renderHook(() => usePublishEditor(() => undefined));

    await waitFor(() => expect(result.current.editor?.getText()).toBe("Hello red"));

    expect(result.current.editor?.getHTML()).toContain('class="ecency-text-color-dc2626"');
    expect(publishState.setContent).not.toHaveBeenCalled();
  });
});
