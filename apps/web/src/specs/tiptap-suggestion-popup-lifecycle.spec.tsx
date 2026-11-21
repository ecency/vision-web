import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computePosition } from "@floating-ui/dom";

// Mirrors the real floating-ui failure: a null reference has no getBoundingClientRect.
vi.mock("@floating-ui/dom", () => ({
  computePosition: vi.fn((reference: any) => {
    reference.getBoundingClientRect();
    return Promise.resolve({ x: 11, y: 22 });
  }),
  flip: vi.fn(() => ({ name: "flip" }))
}));

vi.mock("@tiptap/react", () => ({
  ReactRenderer: class {
    element = document.createElement("div");
    ref = null;
    updateProps = vi.fn();
    destroy = vi.fn(() => this.element.remove());
  }
}));

vi.mock("@/core/react-query", () => ({ getQueryClient: () => undefined }));
vi.mock("@/features/shared", () => ({ UserAvatar: () => null }));

import { UserMentionExtensionConfig } from "@/features/tiptap-editor/extensions/user-mention-extension-config";
import { TagMentionExtensionConfig } from "@/features/tiptap-editor/extensions/tag-mention-extension-config";

const configs = [
  ["@ user mention", UserMentionExtensionConfig],
  ["# tag mention", TagMentionExtensionConfig]
] as const;

const rect = new DOMRect(5, 6, 7, 8);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe.each(configs)("%s popup lifecycle", (_name, config) => {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);

  beforeEach(() => {
    rejections.length = 0;
    process.on("unhandledRejection", onRejection);
    document.body.innerHTML = '<div id="popper-container"></div>';
    vi.mocked(computePosition).mockClear();
  });

  afterEach(() => {
    process.off("unhandledRejection", onRejection);
  });

  const props = (clientRect: (() => DOMRect | null) | null) => ({
    editor: {},
    decorationNode: null,
    clientRect
  });

  it("positions on start and update with a null decorationNode", async () => {
    const lifecycle = config.render();
    lifecycle.onStart(props(() => rect));
    await flush();

    const popup = document.querySelector<HTMLElement>("#popper-container > div")!;
    expect(popup.style.left).toBe("11px");
    expect(popup.style.top).toBe("22px");

    popup.style.left = "0px";
    lifecycle.onUpdate(props(() => rect));
    await flush();
    expect(popup.style.left).toBe("11px");
    expect(rejections).toEqual([]);
  });

  it("leaves the popup in place when clientRect returns null on update", async () => {
    const lifecycle = config.render();
    lifecycle.onStart(props(() => rect));
    await flush();

    const popup = document.querySelector<HTMLElement>("#popper-container > div")!;
    vi.mocked(computePosition).mockClear();
    lifecycle.onUpdate(props(() => null));
    await flush();

    expect(computePosition).not.toHaveBeenCalled();
    expect(popup.style.left).toBe("11px");
    expect(popup.style.top).toBe("22px");
    expect(rejections).toEqual([]);
  });
});
