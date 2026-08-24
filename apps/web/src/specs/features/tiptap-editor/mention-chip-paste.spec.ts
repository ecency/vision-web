import { vi } from "vitest";

vi.mock("@/features/tiptap-editor/extensions", () => ({
  HIVE_POST_PURE_REGEX: /$a^/,
  LOOM_REGEX: /$a^/,
  YOUTUBE_REGEX: /$a^/,
  TAG_MENTION_PURE_REGEX: /#\w+/gi,
  USER_MENTION_PURE_REGEX:
    /@(?=[a-zA-Z][a-zA-Z0-9.-]{1,15}\b)[a-zA-Z][a-zA-Z0-9-]{2,}(?:\.[a-zA-Z][a-zA-Z0-9-]{2,})*\b/gi
}));

import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";

const paste = (markdown: string) => parseAllExtensionsToDoc(simpleMarkdownToHTML(markdown));

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
