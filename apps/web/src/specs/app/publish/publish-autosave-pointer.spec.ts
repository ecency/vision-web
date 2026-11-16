import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAutosavePointer } from "@/app/publish/_utils/autosave-pointer";

const engine = vi.hoisted(() => ({
  current: {
    draftId: undefined as string | undefined,
    lastSaved: null as Date | null,
    isActiveTab: true,
    flush: vi.fn()
  }
}));

vi.mock("@/app/publish/_hooks/use-draft-autosave", () => ({
  useDraftAutosave: () => engine.current
}));

vi.mock("@/app/publish/_hooks/use-publish-state", () => ({
  usePublishState: () => ({ title: "t", content: "c", tags: [], clearGeneration: 0 })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ username: "alice", activeUser: { username: "alice" } })
}));

const { usePublishAutosave } = await import("@/app/publish/_hooks/use-publish-autosave");

// The pointer is what lets a returning session find the draft this composer
// was writing to, rather than leaving it orphaned in the Drafts list.
describe("usePublishAutosave pointer", () => {
  beforeEach(() => {
    localStorage.clear();
    engine.current = { draftId: undefined, lastSaved: null, isActiveTab: true, flush: vi.fn() };
  });

  it("writes nothing before a draft exists", () => {
    renderHook(() => usePublishAutosave());
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  it("points at the draft once a save lands, and follows later saves", () => {
    const { rerender } = renderHook(() => usePublishAutosave());

    engine.current = { ...engine.current, draftId: "d1", lastSaved: new Date(1000) };
    rerender();
    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 1000 });

    engine.current = { ...engine.current, lastSaved: new Date(5000) };
    rerender();
    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 5000 });
  });
});
