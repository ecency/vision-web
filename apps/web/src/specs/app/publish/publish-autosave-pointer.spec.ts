import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAutosavePointer, writeAutosavePointer } from "@/app/publish/_utils/autosave-pointer";

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

const state = vi.hoisted(() => ({ clearGeneration: 0 }));
vi.mock("@/app/publish/_hooks/use-publish-state", () => ({
  usePublishState: () => ({ title: "t", content: "c", tags: [], clearGeneration: state.clearGeneration })
}));

const account = vi.hoisted(() => ({ username: "alice" }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ username: account.username, activeUser: { username: account.username } })
}));

const { usePublishAutosave } = await import("@/app/publish/_hooks/use-publish-autosave");

// The pointer is what lets a returning session find the draft this composer
// was writing to, rather than leaving it orphaned in the Drafts list.
describe("usePublishAutosave pointer", () => {
  beforeEach(() => {
    localStorage.clear();
    engine.current = { draftId: undefined, lastSaved: null, isActiveTab: true, flush: vi.fn() };
    account.username = "alice";
    state.clearGeneration = 0;
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

  // The publish flow can start before the first autosave returns: the success
  // callback it holds was made while there was no draft id yet. The draft the
  // autosave then created is the one the post went out from, so its pointer has
  // to go too, or the next empty /publish offers an already published post.
  it("forgets the pointer from a callback made before the draft existed", () => {
    const { result, rerender } = renderHook(() => usePublishAutosave());
    const forgetFromEarlyCallback = result.current.forgetPointer;

    engine.current = { ...engine.current, draftId: "d1", lastSaved: new Date(1000) };
    rerender();
    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 1000 });

    forgetFromEarlyCallback();
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  it("forgetting leaves a pointer to some other draft alone", () => {
    const { result } = renderHook(() => usePublishAutosave());
    writeAutosavePointer("alice", "other", 1);

    result.current.forgetPointer();
    expect(readAutosavePointer("alice")).toEqual({ id: "other", savedAt: 1 });
  });

  // Switching accounts with /publish still open must not file the first
  // account's draft under the second account's pointer: the second account's
  // lookup would not find it and would drop the pointer, losing its own offer.
  it("does not write the previous account's draft under a new account", () => {
    const { rerender } = renderHook(() => usePublishAutosave());
    engine.current = { ...engine.current, draftId: "d1", lastSaved: new Date(1000) };
    rerender();
    writeAutosavePointer("bob", "b1", 500);

    account.username = "bob";
    rerender();

    expect(readAutosavePointer("bob")).toEqual({ id: "b1", savedAt: 500 });
    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 1000 });
  });

  // Publish can succeed while the first autosave is still on the wire. The
  // composer's reset (clearAll) commits a render later, so that save can land
  // first, under the old post, after the pointer was already forgotten.
  it("does not write a pointer for a save that lands after publish forgot it", () => {
    const { result, rerender } = renderHook(() => usePublishAutosave());
    const forgetFromEarlyCallback = result.current.forgetPointer;

    forgetFromEarlyCallback();
    engine.current = { ...engine.current, draftId: "d1", lastSaved: new Date(1000) };
    rerender();
    expect(readAutosavePointer("alice")).toBeUndefined();

    // the same, landing in the render that carries the reset
    state.clearGeneration = 1;
    engine.current = { ...engine.current, draftId: "d1", lastSaved: new Date(2000) };
    rerender();
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  it("points again once the next post saves", () => {
    const { result, rerender } = renderHook(() => usePublishAutosave());
    result.current.forgetPointer();

    state.clearGeneration = 1;
    engine.current = { ...engine.current, draftId: undefined, lastSaved: null };
    rerender();
    engine.current = { ...engine.current, draftId: "d2", lastSaved: new Date(3000) };
    rerender();

    expect(readAutosavePointer("alice")).toEqual({ id: "d2", savedAt: 3000 });
  });
});
