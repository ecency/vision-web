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

function compiledRules(file: string): { selectors: string[]; body: string }[] {
  const { css } = compile(resolve(src, file), { logger: Logger.silent });
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((m) => !m[1].trim().startsWith("@"))
    .map((m) => ({
      selectors: m[1].split(/,(?![^(]*\))/).map((s) => s.trim()),
      body: m[2]
    }));
}

function compiledSelectors(file: string): string[] {
  return compiledRules(file).flatMap((rule) => rule.selectors);
}

// Every declaration the compiled sheet applies to one exact selector.
function declarationsFor(file: string, selector: string): string {
  return compiledRules(file)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join(";");
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

  // The original failure was an anchor with no height, so assert the
  // declarations that give the placeholder its box and its play button.
  it("gives the 3Speak placeholder a visible 16:9 box and a play button", () => {
    const file = "features/post-renderer/video-embeds.scss";
    const box = declarationsFor(file, ".markdown-view .markdown-video-link-speak");
    expect(box).toMatch(/display:\s*block/);
    expect(box).toMatch(/width:\s*100%/);
    expect(box).toMatch(/padding-bottom:\s*56\.25%/);
    expect(box).toMatch(/background-color:\s*#000/);

    const play = declarationsFor(
      file,
      ".markdown-view .markdown-video-link-speak .markdown-video-play"
    );
    expect(play).toMatch(/position:\s*absolute/);
    expect(play).toMatch(/background:\s*url\(play-icon\.svg\)/);
  });

  // A 3Speak audio embed is a short player bar, not a 16:9 video. Both forms
  // render-helper emits: the link (.markdown-audio-link-speak > iframe) and a
  // pasted iframe (iframe.speak-audio-iframe, no wrapper).
  it("sizes 3Speak audio embeds as a player bar, per player mode", () => {
    const file = "features/post-renderer/video-embeds.scss";
    for (const base of [
      ".markdown-view .markdown-audio-link-speak iframe",
      ".markdown-view iframe.speak-audio-iframe"
    ]) {
      const bar = declarationsFor(file, base);
      expect(bar).toMatch(/height:\s*120px/);
      expect(bar).toMatch(/aspect-ratio:\s*auto/);
      expect(bar).toMatch(/width:\s*100%/);
      expect(declarationsFor(file, `${base}[src*="mode=minimal"]`)).toMatch(/height:\s*80px/);
      expect(declarationsFor(file, `${base}[src*="mode=full"]`)).toMatch(/height:\s*180px/);
    }
  });

  it("styles nothing but video and audio embeds inside .markdown-view", () => {
    const selectors = compiledSelectors("features/post-renderer/video-embeds.scss");
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel.startsWith(".markdown-view ")).toBe(true);
      expect(sel).toMatch(
        /markdown-video-link|portrait-embed|speak-iframe|markdown-audio-link-speak|speak-audio-iframe/
      );
    }
  });

  it("keeps the same video rules in the post renderer stylesheet", () => {
    const renderer = compiledSelectors("features/post-renderer/ecency-renderer.scss");
    for (const sel of compiledSelectors("features/post-renderer/video-embeds.scss")) {
      expect(renderer).toContain(sel);
    }
  });
});
