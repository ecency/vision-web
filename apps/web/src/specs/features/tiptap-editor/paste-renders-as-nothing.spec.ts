import { vi } from "vitest";

// Only the hive-post pass needs stubbing here: it is the one that reads
// `el.innerText`, which jsdom does not implement, and it calls `.trim()` on it
// unguarded, so a hive-post-shaped href throws in a spec instead of exercising
// anything. Same re-mock pattern CLAUDE.md documents for `@/utils`.
vi.mock("@/features/tiptap-editor/extensions", async () => ({
  ...(await vi.importActual("@/features/tiptap-editor/extensions")),
  HIVE_POST_PURE_REGEX: /$a^/
}));

import { Editor, getSchema } from "@tiptap/core";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";
import { resolveInsertContent } from "@/features/tiptap-editor/functions/resolve-insert-content";
import { PUBLISH_EDITOR_EXTENSIONS } from "./publish-editor-extensions";

const schema = getSchema(PUBLISH_EDITOR_EXTENSIONS);

/** Pastes exactly as the clipboard text strategy does. */
function paste(pastedText: string): { html: string; text: string } {
  const editor = new Editor({ extensions: PUBLISH_EDITOR_EXTENSIONS, content: "<p>draft</p>" });
  try {
    const parsed = parseAllExtensionsToDoc(simpleMarkdownToHTML(pastedText));
    const content = resolveInsertContent(editor.schema, parsed, pastedText);
    if (content) {
      editor.chain().insertContent(content).run();
    }
    return { html: editor.getHTML(), text: editor.getText() };
  } finally {
    editor.destroy();
  }
}

// Regression: when the parsed result is empty, tiptap's insertContentAt never
// falsifies its isOnlyTextContent flag (the forEach runs zero times) and falls
// through to tr.insertText with the HTML STRING, so the markup lands in the
// document as visible text. Confirmed identical in jsdom and real Chromium, so
// this is tiptap behaviour rather than a DOM quirk.
describe("pasting content the editor cannot render", () => {
  // Both before and after the fix the result is literal text, so "is it escaped"
  // cannot tell them apart. What distinguishes them is WHOSE text it is: the
  // editor used to receive our sanitised, attribute-normalised HTML, which the
  // author never typed and which had already lost part of what they pasted.
  it.each([
    ["an iframe embed", "<iframe src=https://a.test/x></iframe>"],
    ["a video element", "<video src=x controls></video>"]
  ])("keeps the text the user actually copied for %s", (_l: string, pastedText: string) => {
    expect(paste(pastedText).text).toContain(pastedText);
  });

  it.each([
    // the sanitiser quotes the attribute, so this form is ours and not the author's
    ["a requoted iframe src", "<iframe src=https://a.test/x></iframe>", 'src="https://a.test/x"'],
    // and it drops src from <video> while inventing controls="", losing the URL
    ["an invented video attribute", "<video src=x controls></video>", 'controls=""']
  ])("never inserts our converted HTML: %s", (_l: string, pastedText: string, ours: string) => {
    expect(paste(pastedText).text).not.toContain(ours);
  });

  it("keeps the rest of the document intact", () => {
    expect(paste("<video src=x controls></video>").text).toContain("draft");
  });
});

describe("resolveInsertContent", () => {
  it("passes ordinary HTML straight through", () => {
    expect(resolveInsertContent(schema, "<p>ok</p>", "ok")).toBe("<p>ok</p>");
  });

  it("returns the fallback text when nothing renders", () => {
    expect(resolveInsertContent(schema, '<iframe src="x"></iframe>', "raw text")).toEqual({
      type: "text",
      text: "raw text"
    });
  });

  it("returns null when nothing renders and there is no fallback", () => {
    expect(resolveInsertContent(schema, '<iframe src="x"></iframe>')).toBeNull();
  });

  // The same insertText branch double-escapes text-only content, so `A &amp; B`
  // used to reach the document as those literal characters.
  it("decodes entities when the content is text alone", () => {
    expect(resolveInsertContent(schema, "A &amp; B", "A & B")).toEqual({
      type: "text",
      text: "A & B"
    });
  });

  it("inserts decoded text rather than the HTML that encoded it", () => {
    const editor = new Editor({ extensions: PUBLISH_EDITOR_EXTENSIONS, content: "<p></p>" });
    try {
      const content = resolveInsertContent(editor.schema, "1 &lt; 2", "1 < 2");
      editor.chain().insertContent(content!).run();

      expect(editor.getHTML()).toBe("<p>1 &lt; 2</p>");
    } finally {
      editor.destroy();
    }
  });
});
