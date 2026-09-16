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
import {
  hasWordCharacter,
  plainTextDescription,
  usableDescription
} from "@/app/publish/_utils/content";

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

  it("keeps following the body after a draft saved by the classic editor is reopened", () => {
    const { result } = renderComposer();
    // The shape submit/_api/save-draft.ts stores: withSummary(postBodySummary(body)).
    const stored = postBodySummary(postBodySummary(LONG), SAVED_LENGTH);

    act(() => {
      result.current.state.setContent(LONG);
      result.current.state.loadMetaDescription(stored, LONG);
    });
    typeBody(result, [REWRITTEN]);

    expect(result.current.state.metaDescription).toBe(summaryOf(REWRITTEN));
  });

  it("treats a loaded description that matches its body summary as auto", () => {
    const { result } = renderComposer();
    const body = REWRITTEN;
    const stored = postBodySummary(body, SAVED_LENGTH);
    const extended = `${body} And then a second paragraph about the same work.`;

    act(() => {
      result.current.state.setContent(body);
      result.current.state.loadMetaDescription(stored, body);
    });
    typeBody(result, [extended]);

    // Once saved, a description the author wrote that matches the summary of its own body
    // cannot be told apart from a generated one, so it follows the body. Deliberate.
    expect(result.current.state.metaDescription).toBe(summaryOf(extended));
  });

  it("falls back to the body as plain text when the summariser returns nothing", () => {
    const { result } = renderComposer();
    // A long run with no spaces summarises to "", which is why the fallback exists.
    const spaceless = "今日はいい天気ですね散歩に行きます".repeat(40);
    const rewritten = "明日は雨が降るでしょう家で本を読みます".repeat(40);

    expect(summaryOf(spaceless)).toBe("");
    typeBody(result, [spaceless]);
    expect(result.current.state.metaDescription).toBe(spaceless.slice(0, 350));

    typeBody(result, [rewritten]);

    expect(result.current.state.metaDescription).toBe(rewritten.slice(0, 350));
  });

  it("leaves an image wrapped in HTML without a description rather than a fragment", () => {
    const { result } = renderComposer();

    typeBody(result, [
      '<div class="pull-right"><center>![](https://i.ecency.com/DQmX/a.png)</center></div>'
    ]);

    expect(result.current.state.metaDescription).toBe("");
  });

  it("leaves an image only post without a description rather than its markdown", () => {
    const { result } = renderComposer();

    typeBody(result, ["<center>![](https://i.ecency.com/DQmX/a.png)</center>"]);

    expect(result.current.state.metaDescription).toBe("");
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

describe("hasWordCharacter", () => {
  it("rejects punctuation the summariser can leave behind", () => {
    expect(hasWordCharacter("![](")).toBe(false);
    expect(hasWordCharacter("   ")).toBe(false);
  });

  it("accepts text in any script", () => {
    expect(hasWordCharacter("Hello")).toBe(true);
    expect(hasWordCharacter("今日")).toBe(true);
    expect(hasWordCharacter("7")).toBe(true);
  });
});

describe("plainTextDescription", () => {
  const IMAGE = "https://i.ecency.com/DQmX/a.png";

  it("drops an image whose file name holds parentheses", () => {
    expect(plainTextDescription("![](https://i.ecency.com/DQmX/a_(1).png)", 350)).toBe("");
  });

  it("drops a linked image together with the link target", () => {
    expect(plainTextDescription(`[![](${IMAGE})](https://ecency.com/@ecency)`, 350)).toBe("");
  });

  it("keeps the label of a link but not its target", () => {
    expect(plainTextDescription("[Hello there](https://ecency.com/@ecency)", 350)).toBe(
      "Hello there"
    );
  });

  it("keeps the text around a dropped image", () => {
    expect(plainTextDescription(`Before ![](${IMAGE}) after`, 350)).toBe("Before after");
  });

  it("leaves brackets that open no link alone", () => {
    expect(plainTextDescription("see [1] and [2] below", 350)).toBe("see [1] and [2] below");
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

  it("still reads one symbol as missing where Intl.Segmenter is absent", () => {
    const segmenter = Intl.Segmenter;
    Object.defineProperty(Intl, "Segmenter", { value: undefined, configurable: true });
    try {
      // One grapheme each, spanning two or more code points.
      expect(usableDescription("😀")).toBeUndefined();
      expect(usableDescription("e\u0301")).toBeUndefined();
      // No precomposed form, so normalising alone leaves two code points.
      expect(usableDescription("q\u0301")).toBeUndefined();
      expect(usableDescription("👍🏽")).toBeUndefined();
      expect(usableDescription("🇵🇭")).toBeUndefined();
      expect(usableDescription("Hi")).toBe("Hi");
      expect(usableDescription("😀😀")).toBe("😀😀");
    } finally {
      Object.defineProperty(Intl, "Segmenter", { value: segmenter, configurable: true });
    }
  });

  it("keeps a description of two emoji", () => {
    expect(usableDescription("😀😀")).toBe("😀😀");
  });

  it("returns a real description unchanged", () => {
    expect(usableDescription("Hi")).toBe("Hi");
    expect(usableDescription("A short summary")).toBe("A short summary");
  });
});
