import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { postBodySummary } from "@ecency/render-helper";
import type { Draft } from "@ecency/sdk";
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
import { useApplyTemplate } from "@/app/publish/_hooks/use-apply-template";
import { usableDescription } from "@/app/publish/_utils/content";

const FIRST = "Let me tell you a story about O.";
const SECOND = "O is short for Orchestrator.";
const FINAL = `${FIRST}\n\n${SECOND}`;
const REWRITTEN = "Today I shipped the orchestrator. It routes every task to the right agent.";
const LONG = Array.from(
  { length: 12 },
  (_, i) => `Sentence ${i + 1} of a long opening paragraph that keeps going.`
).join(" ");
// What EntryMetadataBuilder.withSummary keeps when a draft or template is saved.
const SAVED_LENGTH = 200;

// The body as the editor reports it while the author types, one update per step.
const TYPING = ["L", "Le", "Let me", FIRST, FINAL];

const summaryOf = (content: string) => postBodySummary(content, SUBMIT_DESCRIPTION_MAX_LENGTH);

function renderComposer() {
  return renderHook(
    () => ({
      state: usePublishState(),
      handOff: useBackToClassic(),
      applyTemplate: useApplyTemplate()
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PublishStateProvider>{children}</PublishStateProvider>
      )
    }
  );
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

  it("hands over no description while it is still the auto summary", () => {
    const { result } = renderComposer();

    act(() => result.current.state.setTitle("Vibe coding"));
    typeBody(result, TYPING);
    act(() => result.current.handOff.backToClassic());

    expect(readClassicDraft()?.description).toBe("");
    expect(push).toHaveBeenCalledWith("/submit");
  });

  it("hands over a description the author typed", () => {
    const { result } = renderComposer();

    act(() => result.current.state.setTitle("Vibe coding"));
    typeBody(result, TYPING);
    act(() => result.current.state.editMetaDescription("My own summary"));
    act(() => result.current.handOff.backToClassic());

    expect(readClassicDraft()?.description).toBe("My own summary");
  });

  it("hands over a description loaded with its draft", () => {
    const { result } = renderComposer();

    act(() => {
      result.current.state.setTitle("Vibe coding");
      result.current.state.setContent(FINAL);
      result.current.state.loadMetaDescription("Written in the draft", FINAL);
    });
    act(() => result.current.handOff.backToClassic());

    expect(readClassicDraft()?.description).toBe("Written in the draft");
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

  it("keeps a loaded description that matches the previous body's summary", () => {
    const { result } = renderComposer();

    typeBody(result, [FIRST]);
    act(() => {
      result.current.state.setContent("A different post about something else entirely.");
      result.current.state.setMetaDescription(summaryOf(FIRST));
    });

    expect(result.current.state.metaDescription).toBe(summaryOf(FIRST));
  });

  it("keeps following the body after a draft saved with its auto summary is reopened", () => {
    const { result } = renderComposer();

    typeBody(result, TYPING);
    const saved = postBodySummary(result.current.state.metaDescription, SAVED_LENGTH);
    act(() => {
      result.current.state.clearAll();
      result.current.state.setContent(FINAL);
      result.current.state.loadMetaDescription(saved, FINAL);
    });
    typeBody(result, [REWRITTEN]);

    expect(result.current.state.metaDescription).toBe(summaryOf(REWRITTEN));
  });

  it("recognises a saved auto summary that was cut to the saved length", () => {
    const { result } = renderComposer();

    typeBody(result, [LONG]);
    const saved = postBodySummary(result.current.state.metaDescription, SAVED_LENGTH);
    expect(saved.length).toBeLessThan(result.current.state.metaDescription.length);
    act(() => {
      result.current.state.clearAll();
      result.current.state.setContent(LONG);
      result.current.state.loadMetaDescription(saved, LONG);
    });
    typeBody(result, [REWRITTEN]);

    expect(result.current.state.metaDescription).toBe(summaryOf(REWRITTEN));
  });

  it("follows the body of a post started from a template", () => {
    const { result } = renderComposer();
    const template = "Weekly report. What I worked on this week.";
    const filled = `${template}\n\nShipped the description fix and reviewed two pull requests.`;

    act(() =>
      result.current.applyTemplate({
        title: "Weekly report",
        body: template,
        tags_arr: [],
        meta: { description: postBodySummary(summaryOf(template), SAVED_LENGTH) }
      } as unknown as Draft)
    );
    typeBody(result, [filled]);

    expect(result.current.state.metaDescription).toBe(summaryOf(filled));
  });

  it("keeps a description the author wrote when it is loaded with its draft", () => {
    const { result } = renderComposer();

    act(() => {
      result.current.state.setContent(FIRST);
      result.current.state.loadMetaDescription("Written in the draft", FIRST);
    });
    typeBody(result, [FINAL]);

    expect(result.current.state.metaDescription).toBe("Written in the draft");
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

  it.each(["😀", "👍🏽", "🇵🇭", " 😀 "])("treats the single emoji %j as missing", (value) => {
    expect(usableDescription(value)).toBeUndefined();
  });

  it("keeps a description of two emoji", () => {
    expect(usableDescription("😀😀")).toBe("😀😀");
  });

  it("returns a real description unchanged", () => {
    expect(usableDescription("Hi")).toBe("Hi");
    expect(usableDescription("A short summary")).toBe("A short summary");
  });
});
