import { PostBase } from "@/app/submit/_types";
import { PREFIX } from "@/utils/local-storage";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = PREFIX + "_local_draft";

const push = vi.hoisted(() => vi.fn());
const publishState = vi.hoisted(() => ({
  current: {
    title: "",
    content: "",
    tags: [] as string[],
    metaDescription: ""
  }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

vi.mock("@/app/publish/_hooks/use-publish-state", () => ({
  usePublishState: () => publishState.current
}));

const { useBackToClassic } = await import("@/app/publish/_hooks/use-back-to-classic");

function readDraft(): PostBase | undefined {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : undefined;
}

// Regression: "back to classic editor" was a bare router.push, so the composer
// state - which lives only in memory - was dropped on the way out, and the
// classic editor restored whatever unrelated local draft it already had.
describe("useBackToClassic", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
    publishState.current = { title: "", content: "", tags: [], metaDescription: "" };
  });

  it("hands the composer post over to the classic editor", () => {
    publishState.current = {
      title: "Error 404: Title Not Found",
      content: "Smoke'em if you got'em!",
      tags: ["photofeed", "bnwphotography"],
      metaDescription: "a summary"
    };

    const { result } = renderHook(() => useBackToClassic());
    act(() => result.current());

    expect(readDraft()).toEqual({
      title: "Error 404: Title Not Found",
      tags: ["photofeed", "bnwphotography"],
      body: "Smoke'em if you got'em!",
      description: "a summary"
    });
    expect(push).toHaveBeenCalledWith("/submit");
  });

  it("hands over a body written before any title", () => {
    publishState.current = {
      title: "",
      content: "had written something to follow that up",
      tags: [],
      metaDescription: ""
    };

    const { result } = renderHook(() => useBackToClassic());
    act(() => result.current());

    expect(readDraft()).toEqual({
      title: "",
      tags: [],
      body: "had written something to follow that up",
      description: ""
    });
  });

  it("leaves an existing classic draft alone when the composer is empty", () => {
    const existing: PostBase = {
      title: "a post in progress",
      tags: ["hive"],
      body: "already being written over there",
      description: null
    };
    localStorage.setItem(KEY, JSON.stringify(existing));

    const { result } = renderHook(() => useBackToClassic());
    act(() => result.current());

    expect(readDraft()).toEqual(existing);
    expect(push).toHaveBeenCalledWith("/submit");
  });
});
