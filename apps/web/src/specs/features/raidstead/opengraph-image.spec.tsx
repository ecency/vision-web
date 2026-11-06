// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/i18n", () => ({ initI18next: vi.fn(() => Promise.resolve()) }));
vi.mock("@ecency/raidstead", async (orig) => {
  const actual = await orig<typeof import("@ecency/raidstead")>();
  return { ...actual, portraitSvg: vi.fn(actual.portraitSvg) };
});

import { portraitSvg } from "@ecency/raidstead";
import RaidsteadImage, { contentType, size } from "@/app/raidstead/opengraph-image";

describe("/raidstead preview image", () => {
  it("renders a PNG of all four pests and the townsfolk", async () => {
    const res = await RaidsteadImage();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(contentType);
    const png = new Uint8Array(await res.arrayBuffer());
    // PNG signature, then the IHDR width and height
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    const view = new DataView(png.buffer, png.byteOffset);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([size.width, size.height]);

    const drawn = vi.mocked(portraitSvg).mock.calls.map(([kind]) => kind);
    // pest pictures are public: the preview shows the whole season's lineup
    expect(drawn.sort()).toEqual([
      "beetle",
      "herald",
      "queen",
      "scout",
      "scribe",
      "slug",
      "smith",
      "twins"
    ]);
  }, 30_000);
});
