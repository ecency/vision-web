import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, Logger } from "sass";
import { describe, it, expect } from "vitest";

/**
 * The weakness badge and the attack buttons both get their colour from an
 * inline --c set by the game component. jsdom applies no stylesheet, so the
 * compiled CSS is asserted instead: each must paint its background from --c.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../..");

// Every declaration the compiled sheet applies to one exact selector.
function declarationsFor(selector: string): string[] {
  const { css } = compile(resolve(src, "app/raidstead/raidstead.scss"), { logger: Logger.silent });
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((m) => m[1].split(",").some((s) => s.trim() === selector))
    .flatMap((m) => m[2].split(";").map((d) => d.trim()))
    .filter(Boolean);
}

// Any background-* declaration counts: an image or gradient would cover the colour.
const background = (selector: string) =>
  declarationsFor(selector).filter((d) => /^background(-\w+)?\s*:/.test(d));

describe("raidstead type colours", () => {
  it("paints an attack button from --c", () => {
    const [rule, ...rest] = background(".raidstead .rs-atk");
    expect(rest).toEqual([]);
    expect(rule).toMatch(/^background:\s*var\(--c\b/);
  });

  it("paints a known weakness badge from --c", () => {
    const [rule, ...rest] = background(".raidstead .rs-weak.known");
    expect(rest).toEqual([]);
    expect(rule).toMatch(/^background:\s*var\(--c\b/);
  });
});
