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
});
