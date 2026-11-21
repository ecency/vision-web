import { describe, it, expect, vi, beforeEach } from "vitest";
import { computePosition } from "@floating-ui/dom";
import {
  getSuggestionReference,
  positionSuggestionPopup
} from "@/features/tiptap-editor/extensions/position-suggestion-popup";

vi.mock("@floating-ui/dom", () => ({
  computePosition: vi.fn(),
  flip: vi.fn(() => ({ name: "flip" }))
}));

function connected(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("getSuggestionReference", () => {
  it("uses a connected decoration node", () => {
    const node = connected();
    expect(getSuggestionReference({ decorationNode: node })).toBe(node);
    node.remove();
  });

  it("falls back to clientRect when the decoration node is null", () => {
    const rect = new DOMRect(1, 2, 3, 4);
    const ref = getSuggestionReference({ decorationNode: null, clientRect: () => rect });
    expect(ref?.getBoundingClientRect()).toBe(rect);
  });

  it("ignores a detached decoration node", () => {
    const node = document.createElement("span");
    expect(getSuggestionReference({ decorationNode: node, clientRect: () => null })).toBeNull();
  });

  it("returns null when nothing can be measured", () => {
    expect(getSuggestionReference({ decorationNode: null, clientRect: null })).toBeNull();
  });
});

describe("positionSuggestionPopup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call computePosition with a null decoration node", async () => {
    const floating = connected();
    await expect(
      positionSuggestionPopup({ decorationNode: null, clientRect: null }, floating)
    ).resolves.toBeUndefined();
    expect(computePosition).not.toHaveBeenCalled();
    floating.remove();
  });

  it("positions the popup under a connected decoration node", async () => {
    const node = connected();
    const floating = connected();
    vi.mocked(computePosition).mockResolvedValue({ x: 10, y: 20 } as any);

    await positionSuggestionPopup({ decorationNode: node }, floating);

    expect(computePosition).toHaveBeenCalledWith(node, floating, expect.anything());
    expect(floating.style.left).toBe("10px");
    expect(floating.style.top).toBe("20px");
    node.remove();
    floating.remove();
  });

  it("ignores a rejection once the popup is detached", async () => {
    const node = connected();
    const floating = connected();
    vi.mocked(computePosition).mockImplementation(async () => {
      floating.remove();
      throw new TypeError("detached");
    });

    await expect(positionSuggestionPopup({ decorationNode: node }, floating)).resolves.toBeUndefined();
    node.remove();
  });

  it("still surfaces unexpected errors while the popup is mounted", async () => {
    const node = connected();
    const floating = connected();
    vi.mocked(computePosition).mockRejectedValue(new Error("boom"));

    await expect(positionSuggestionPopup({ decorationNode: node }, floating)).rejects.toThrow("boom");
    node.remove();
    floating.remove();
  });
});
