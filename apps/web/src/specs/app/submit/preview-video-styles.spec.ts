import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, Logger } from "sass";
import { describe, it, expect } from "vitest";

/**
 * The classic editor preview renders markdown with PostBodyLazyRenderer, not
 * EcencyRenderer, so ecency-renderer.scss never loads there on a fresh page and
 * a video link rendered as an empty zero-height anchor. The preview imports the
 * video rules alone: its other markdown styling comes from the global
 * _markdown.scss and must not be overridden. jsdom applies no stylesheet, so
 * the compiled CSS is asserted instead.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../..");

function compiledSelectors(file: string): string[] {
  const { css } = compile(resolve(src, file), { logger: Logger.silent });
  return Array.from(css.matchAll(/([^{}]+)\{/g))
    .map((m) => m[1].trim())
    .filter((sel) => !sel.startsWith("@"))
    .flatMap((sel) => sel.split(/,(?![^(]*\))/).map((s) => s.trim()));
}

describe("classic editor preview video styles", () => {
  it("is imported by the preview renderer", () => {
    const renderer = readFileSync(
      resolve(src, "app/submit/_components/post-body-lazy-renderer.tsx"),
      "utf8"
    );
    expect(renderer).toContain('import "@/features/post-renderer/video-embeds.scss";');
  });

  it("sizes 3Speak and the other video placeholders", () => {
    const selectors = compiledSelectors("features/post-renderer/video-embeds.scss");
    expect(selectors).toContain(".markdown-view .markdown-video-link-speak");
    expect(selectors).toContain(".markdown-view .markdown-video-link-youtube");
  });

  it("styles nothing but video embeds inside .markdown-view", () => {
    const selectors = compiledSelectors("features/post-renderer/video-embeds.scss");
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel.startsWith(".markdown-view ")).toBe(true);
      expect(sel).toMatch(/markdown-video-link|portrait-embed|speak-iframe/);
    }
  });

  it("keeps the same video rules in the post renderer stylesheet", () => {
    const renderer = compiledSelectors("features/post-renderer/ecency-renderer.scss");
    for (const sel of compiledSelectors("features/post-renderer/video-embeds.scss")) {
      expect(renderer).toContain(sel);
    }
  });
});
