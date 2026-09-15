import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { postBodySummary } from "@ecency/render-helper";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";
import { PostBase } from "@/app/submit/_types";
import { PREFIX } from "@/utils/local-storage";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

import { PublishStateProvider, usePublishState } from "@/app/publish/_hooks/use-publish-state";
import { useBackToClassic } from "@/app/publish/_hooks/use-back-to-classic";
import { usableDescription } from "@/app/publish/_utils/content";

const FIRST = "Let me tell you a story about O.";
const SECOND = "O is short for Orchestrator.";
const FINAL = `${FIRST}\n\n${SECOND}`;

// The body as the editor reports it while the author types, one update per step.
const TYPING = ["L", "Le", "Let me", FIRST, FINAL];

const summaryOf = (content: string) => postBodySummary(content, SUBMIT_DESCRIPTION_MAX_LENGTH);

function renderComposer() {
  return renderHook(() => ({ state: usePublishState(), handOff: useBackToClassic() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <PublishStateProvider>{children}</PublishStateProvider>
    )
  });
}

type Composer = ReturnType<typeof renderComposer>["result"];

function typeBody(result: Composer, steps: string[]) {
  for (const step of steps) {
    act(() => result.current.state.setContent(step));
  }
}

function readClassicDraft(): PostBase | undefined {
  const raw = localStorage.getItem(PREFIX + "_local_draft");
  return raw ? JSON.parse(raw) : undefined;
}

// Regression: the composer filled the description only while it was empty, so a
// typed post froze it at its first letter and handed that letter to the classic
// editor, which published it.
describe("publish state description", () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
  });

  it("follows the body while the author types", () => {
    const { result } = renderComposer();

    typeBody(result, TYPING);

    expect(summaryOf(FINAL).length).toBeGreaterThan(1);
    expect(result.current.state.metaDescription).toBe(summaryOf(FINAL));
  });

  it("hands the current summary, not the first letter, to the classic editor", () => {
    const { result } = renderComposer();

    act(() => result.current.state.setTitle("Vibe coding"));
    typeBody(result, TYPING);
    act(() => result.current.handOff.backToClassic());

    expect(readClassicDraft()?.description).toBe(summaryOf(FINAL));
    expect(push).toHaveBeenCalledWith("/submit");
  });

  it("leaves a description the author typed alone, even a single character", () => {
    const { result } = renderComposer();

    typeBody(result, ["L"]);
    act(() => result.current.state.editMetaDescription("A"));
    typeBody(result, TYPING.slice(1));
    expect(result.current.state.metaDescription).toBe("A");

    act(() => result.current.state.editMetaDescription("My own summary"));
    typeBody(result, [`${FINAL} More.`]);
    expect(result.current.state.metaDescription).toBe("My own summary");
  });

  it("follows the body again for the next post after the composer is cleared", () => {
    const { result } = renderComposer();

    typeBody(result, [FIRST]);
    act(() => result.current.state.editMetaDescription("My own summary"));
    act(() => result.current.state.clearAll());
    typeBody(result, TYPING);

    expect(result.current.state.metaDescription).toBe(summaryOf(FINAL));
  });

  it("keeps a loaded description but replaces one too short to be meaningful", () => {
    const { result } = renderComposer();

    act(() => {
      result.current.state.setContent(FIRST);
      result.current.state.setMetaDescription("Written in the draft");
    });
    typeBody(result, [FINAL]);
    expect(result.current.state.metaDescription).toBe("Written in the draft");

    act(() => result.current.state.setMetaDescription("L"));
    expect(result.current.state.metaDescription).toBe(summaryOf(FINAL));
  });
});

describe("usableDescription", () => {
  it("treats empty and single character values as missing", () => {
    expect(usableDescription(undefined)).toBeUndefined();
    expect(usableDescription(null)).toBeUndefined();
    expect(usableDescription("")).toBeUndefined();
    expect(usableDescription("L")).toBeUndefined();
    expect(usableDescription("  I  ")).toBeUndefined();
  });

  it("returns a real description unchanged", () => {
    expect(usableDescription("Hi")).toBe("Hi");
    expect(usableDescription("A short summary")).toBe("A short summary");
  });
});
