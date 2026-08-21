import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// iOS and macOS fetch these two root paths without reading the page's link tags,
// so they must exist as static files under public/. Before #1620 both were 404.
// Apple recommends 180x180 and composites transparency onto black, so the file
// also has to be opaque.

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../..");
const ROOT_ICONS = ["apple-touch-icon.png", "apple-touch-icon-precomposed.png"];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// PNG colour types carrying an alpha channel: 4 = grey+alpha, 6 = RGB+alpha.
const ALPHA_COLOR_TYPES = [4, 6];

function readIhdr(png: Buffer) {
  // Signature (8) + IHDR length (4) + "IHDR" (4), then width, height, depth, colour type.
  expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png.readUInt8(25)
  };
}

describe("apple touch icon", () => {
  it.each(ROOT_ICONS)("serves /%s as an opaque 180x180 PNG", (name) => {
    const png = readFileSync(resolve(webRoot, "public", name));
    const { width, height, colorType } = readIhdr(png);
    expect(width).toBe(180);
    expect(height).toBe(180);
    expect(ALPHA_COLOR_TYPES).not.toContain(colorType);
  });

  it("keeps both root paths byte-identical", () => {
    const [a, b] = ROOT_ICONS.map((name) => readFileSync(resolve(webRoot, "public", name)));
    expect(a.equals(b)).toBe(true);
  });

  it("points the metadata apple icon at the root file with its real size", () => {
    const layout = readFileSync(resolve(webRoot, "src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(
      /apple:\s*\[\s*\{\s*url:\s*"\/apple-touch-icon\.png",\s*sizes:\s*"180x180",\s*type:\s*"image\/png"\s*\}\s*\]/
    );
  });
});
