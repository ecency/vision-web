import { vi } from "vitest";

vi.mock("@/features/shared", () => ({
  error: vi.fn()
}));
vi.mock("@/features/tiptap-editor/extensions", () => ({
  HIVE_POST_PURE_REGEX: /$a^/,
  TAG_MENTION_PURE_REGEX: /$a^/,
  USER_MENTION_PURE_REGEX: /$a^/,
  YOUTUBE_REGEX: /$a^/
}));

import { simpleMarkdownToHTML } from "@ecency/render-helper";

import { TEXT_COLOR_CLASS_PREFIX } from "@/app/publish/_constants/text-colors";
import { markdownToHtml } from "@/features/tiptap-editor/functions/markdown-to-html";
import { parseAllExtensionsToDoc } from "@/features/tiptap-editor/functions/parse-all-extensions-to-doc";

type RoundTripResult = {
  markdownAfterSave: string;
  reopenedHtml: string;
  markdownAfterPublishing: string;
  postEditHtml: string;
};

async function parseMarkdownToEditorHtml(markdown: string) {
  const html = simpleMarkdownToHTML(markdown);
  return parseAllExtensionsToDoc(html);
}

async function runEditorRoundTrip(initialHtml: string): Promise<RoundTripResult> {
  const markdownAfterSave = markdownToHtml(initialHtml);
  const reopenedHtml = await parseMarkdownToEditorHtml(markdownAfterSave);
  const markdownAfterPublishing = markdownToHtml(reopenedHtml);
  const postEditHtml = await parseMarkdownToEditorHtml(markdownAfterPublishing);

  return {
    markdownAfterSave,
    reopenedHtml,
    markdownAfterPublishing,
    postEditHtml
  };
}

describe("editor formatting persistence", () => {
  it("keeps class-based colors when saving, reopening, publishing, and editing", async () => {
    const colorSuffix = "f97316";
    const colorClass = `${TEXT_COLOR_CLASS_PREFIX}${colorSuffix}`;
    const initialHtml = `<p><span class="${colorClass}">Colored text</span></p>`;

    const { markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml } =
      await runEditorRoundTrip(initialHtml);

    [markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml].forEach((content) => {
      expect(content).toContain(colorClass);
    });
  });

  it("keeps bold text formatting across the editor lifecycle", async () => {
    const initialHtml = "<p><strong>Bold text</strong></p>";

    const { markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml } =
      await runEditorRoundTrip(initialHtml);

    expect(markdownAfterSave).toContain("**Bold text**");
    expect(reopenedHtml).toContain("<strong>Bold text</strong>");
    expect(markdownAfterPublishing).toContain("**Bold text**");
    expect(postEditHtml).toContain("<strong>Bold text</strong>");
  });

  it("keeps strikethrough formatting across the editor lifecycle", async () => {
    const initialHtml = "<p><del>Struck text</del></p>";

    const { markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml } =
      await runEditorRoundTrip(initialHtml);

    expect(markdownAfterSave).toContain("~~Struck text~~");
    expect(reopenedHtml).toContain("<del>Struck text</del>");
    expect(markdownAfterPublishing).toContain("~~Struck text~~");
    expect(postEditHtml).toContain("<del>Struck text</del>");
  });

  it("converts legacy <s> tags to <del> when reloading content", async () => {
    const initialHtml = "<p><s>Legacy struck</s></p>";

    const { reopenedHtml, postEditHtml } = await runEditorRoundTrip(initialHtml);

    expect(reopenedHtml).toContain("<del>Legacy struck</del>");
    expect(postEditHtml).toContain("<del>Legacy struck</del>");
  });

  it("keeps strikethrough formatting applied to headings", async () => {
    const initialHtml = "<h2><del>Struck heading</del></h2>";

    const { markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml } =
      await runEditorRoundTrip(initialHtml);

    expect(markdownAfterSave).toMatch(/~~Struck heading~~\n[-=]+/);
    expect(reopenedHtml).toContain("<h2");
    expect(reopenedHtml).toContain("<del>Struck heading</del>");
    expect(markdownAfterPublishing).toMatch(/~~Struck heading~~\n[-=]+/);
    expect(postEditHtml).toContain("<h2");
    expect(postEditHtml).toContain("<del>Struck heading</del>");
  });

  it("keeps mixed strikethrough text inside headings", async () => {
    const initialHtml = "<h3><del>Struck</del> and plain</h3>";

    const { markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml } =
      await runEditorRoundTrip(initialHtml);

    expect(markdownAfterSave).toMatch(/~~Struck~~ and plain/);
    expect(reopenedHtml).toContain("<h3");
    expect(reopenedHtml).toContain("<del>Struck</del>");
    expect(reopenedHtml).toContain("and plain");
    expect(markdownAfterPublishing).toMatch(/~~Struck~~ and plain/);
    expect(postEditHtml).toContain("<h3");
    expect(postEditHtml).toContain("<del>Struck</del>");
    expect(postEditHtml).toContain("and plain");
  });

  it("keeps paragraph alignment metadata for non-image content", async () => {
    const initialHtml = '<p style="text-align: right">Aligned text</p>';

    const { markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml } =
      await runEditorRoundTrip(initialHtml);

    // Turndown outputs data-align, parseAllExtensionsToDoc converts it to style.textAlign
    expect(markdownAfterSave).toContain('data-align="right"');
    expect(reopenedHtml).toContain("text-align");
    expect(markdownAfterPublishing).toContain('data-align="right"');
    expect(postEditHtml).toContain("text-align");
  });

  it("keeps centered image alignment wrappers across the editor lifecycle", async () => {
    const initialHtml =
      '<p style="text-align: center"><img src="https://example.com/image.png" alt="Example" /></p>';

    const { markdownAfterSave, reopenedHtml, markdownAfterPublishing, postEditHtml } =
      await runEditorRoundTrip(initialHtml);

    expect(markdownAfterSave).toContain("<center><img");
    expect(markdownAfterSave).toContain('src="https://example.com/image.png"');
    expect(markdownAfterSave).toContain('alt="Example"');
    expect(markdownAfterSave).toContain("</center>");
    expect(reopenedHtml).toContain('style="text-align: center;"');
    expect(reopenedHtml).toContain('src="https://example.com/image.png"');
    expect(markdownAfterPublishing).toContain("<center><img");
    expect(markdownAfterPublishing).toContain('src="https://example.com/image.png"');
    expect(markdownAfterPublishing).toContain('alt="Example"');
    expect(markdownAfterPublishing).toContain("</center>");
    expect(postEditHtml).toContain('style="text-align: center;"');
    expect(postEditHtml).toContain('src="https://example.com/image.png"');
  });
});
