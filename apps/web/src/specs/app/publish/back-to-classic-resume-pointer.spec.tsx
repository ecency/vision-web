import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAutosavePointer,
  writeAutosavePointer
} from "@/app/publish/_utils/autosave-pointer";

const push = vi.hoisted(() => vi.fn());
const publishState = vi.hoisted(() => ({
  current: { title: "", content: "", tags: [] as string[], metaDescription: "" }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("@/app/publish/_hooks/use-publish-state", () => ({
  usePublishState: () => ({ isMetaDescriptionAuto: () => false, ...publishState.current })
}));

vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ username: "alice", activeUser: { username: "alice" } })
}));

const { useBackToClassic } = await import("@/app/publish/_hooks/use-back-to-classic");

// Once the post lives in the classic editor's local draft, /publish offering the
// older server copy on the next visit would split the writer's work in two.
describe("useBackToClassic and the resume offer", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
    publishState.current = { title: "", content: "", tags: [], metaDescription: "" };
  });

  it("clears the pointer when the post is handed over", () => {
    writeAutosavePointer("alice", "d1", 1234);
    publishState.current = { title: "a title", content: "a body", tags: [], metaDescription: "" };

    const { result } = renderHook(() => useBackToClassic());
    act(() => result.current.backToClassic());

    expect(push).toHaveBeenCalledWith("/submit");
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  it("clears it once a replacement of a classic post is confirmed", () => {
    writeAutosavePointer("alice", "d1", 1234);
    localStorage.setItem(
      "ecency_local_draft",
      JSON.stringify({ title: "classic", body: "post", tags: [], description: "" })
    );
    publishState.current = { title: "a title", content: "a body", tags: [], metaDescription: "" };

    const { result } = renderHook(() => useBackToClassic());
    act(() => result.current.backToClassic());
    expect(result.current.conflict).toBe(true);
    // nothing handed over yet, so the offer still stands
    expect(readAutosavePointer("alice")?.id).toBe("d1");

    act(() => result.current.confirmHandOver());
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  // An empty composer hands nothing over, so its pointer is left alone.
  it("keeps the pointer when the composer is empty", () => {
    writeAutosavePointer("alice", "d1", 1234);

    const { result } = renderHook(() => useBackToClassic());
    act(() => result.current.backToClassic());

    expect(push).toHaveBeenCalledWith("/submit");
    expect(readAutosavePointer("alice")?.id).toBe("d1");
  });
});
