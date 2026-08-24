import { vi } from "vitest";

// Only the hive-post pass needs stubbing here: it is the one that reads
// `el.innerText`, which jsdom does not implement, and it calls `.trim()` on it
// unguarded, so a hive-post-shaped href throws in a spec instead of exercising
// anything. Everything else, including the YouTube and Loom passes, runs for
// real. Same re-mock pattern CLAUDE.md documents for `@/utils`.
vi.mock("@/features/tiptap-editor/extensions", async () => ({
  ...(await vi.importActual("@/features/tiptap-editor/extensions")),
  HIVE_POST_PURE_REGEX: /$a^/
}));

import { Editor } from "@tiptap/core";
import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";
import { PUBLISH_EDITOR_EXTENSIONS } from "./publish-editor-extensions";

const paste = (markdown: string) => parseAllExtensionsToDoc(simpleMarkdownToHTML(markdown));

/** What the editor actually ends up showing, which is what the reader sees. */
function render(markdown: string): string {
  const editor = new Editor({ extensions: PUBLISH_EDITOR_EXTENSIONS, content: "<p></p>" });
  try {
    editor.chain().insertContent(paste(markdown)).run();
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

describe("turning mentions and tags into chips on paste", () => {
  // Regression: the rewrite used to run over innerHTML, which carries attribute
  // values. Hive image URLs contain /@author/, so a mention beside a hosted image
  // tore the <img> tag apart and leaked its tail into the document as text.
  // Nothing threw, so the author just lost the image.
  it.each([
    ["a peakd image", "https://files.peakd.com/file/peakd-hive/@bob/p.png"],
    ["an ecency image", "https://images.ecency.com/DQm/@carol/x.png"]
  ])("leaves the src of %s alone", (_label: string, src: string) => {
    const doc = paste(`@alice ![pic](${src})`);

    expect(doc).toContain(`src="${src}"`);
    expect(doc).toContain('<span data-type="mention" data-id="alice"></span>');
  });

  it("does not rewrite an author handle inside a link href", () => {
    const doc = parseAllExtensionsToDoc(
      '<p>@alice <a href="https://ecency.com/@bob/post">post</a></p>'
    );

    expect(doc).toContain('href="https://ecency.com/@bob/post"');
  });

  it("chips a mention that shares a paragraph with a link", () => {
    const doc = parseAllExtensionsToDoc('<p>@alice <a href="https://example.com">link</a></p>');

    expect(doc).toContain('<span data-type="mention" data-id="alice"></span>');
    expect(doc).toContain('<a href="https://example.com">link</a>');
  });

  it.each([
    ["a mention", "hello @alice", '<span data-type="mention" data-id="alice"></span>'],
    ["a tag", "hello #hive", '<span data-type="tag" data-id="hive"></span>']
  ])("chips %s in plain text", (_label: string, markdown: string, chip: string) => {
    expect(paste(markdown)).toContain(chip);
  });

  it("chips every mention in one paragraph, not just the first", () => {
    const doc = paste("@alice and @bob and @carol");

    expect((doc.match(/data-type="mention"/g) || []).length).toBe(3);
  });

  it("keeps the text around a mention", () => {
    const doc = paste("ping @alice about it");

    expect(doc).toContain("ping ");
    expect(doc).toContain(" about it");
  });

  it("leaves the text of a link that is itself a mention alone", () => {
    const html = '<p><a href="https://ecency.com/@alice">@alice</a></p>';

    expect(parseAllExtensionsToDoc(html)).toBe(html);
  });

  it.each([
    ["code", "`@aws-sdk`"],
    ["a fenced block", "```\n@alice\n```"]
  ])("leaves a mention inside %s as literal text", (_label: string, markdown: string) => {
    expect(paste(markdown)).not.toContain('data-type="mention"');
  });

  it("does not treat markup characters in the text as html", () => {
    const doc = parseAllExtensionsToDoc("<p>1 &lt; 2 &amp; @alice</p>");

    expect(doc).toContain("1 &lt; 2 &amp; ");
    expect(doc).toContain('data-id="alice"');
  });
});

// The assertions above read the intermediate HTML. These pin what the editor
// itself ends up with, because that is the thing the corruption destroyed and an
// intermediate-only assertion has already let this class of bug through once.
describe("what the editor ends up showing", () => {
  it("still has the image after chipping a mention beside it", () => {
    const html = render("@alice ![pic](https://files.peakd.com/file/peakd-hive/@bob/p.png)");

    expect(html).toContain('src="https://files.peakd.com/file/peakd-hive/@bob/p.png"');
    expect(html).not.toContain("&lt;");
  });

  it("renders the mention as a node rather than literal markup", () => {
    const html = render("hello @alice");

    expect(html).toContain('data-type="mention"');
    expect(html).not.toContain("&lt;span");
  });

  it("keeps the surrounding words", () => {
    expect(render("ping @alice about it")).toContain("about it");
  });
});
