import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Esie, ESIE_PLACEMENTS, esieSrc } from "@ui/esie";
import { ESIE_MOODS, type EsieMood } from "@ui/esie/esie-moods.generated";
// @ts-expect-error plain ESM build script without types
import { buildEsie } from "../../../../../../scripts/esie/build.mjs";

const publicDir = join(__dirname, "../../../../public");
const moods = Object.keys(ESIE_MOODS) as EsieMood[];

describe("Esie", () => {
  it("renders a placement with its native mood and height", () => {
    const { container } = render(<Esie placement="success" />);
    const img = container.querySelector("img")!;

    expect(img).toHaveAttribute("data-esie-mood", "happy");
    expect(img).toHaveAttribute("height", "96");
    expect(img).toHaveAttribute("width", String(Math.round(96 * ESIE_MOODS.happy.ratio)));
    expect(img.getAttribute("src")).toBe(esieSrc("happy"));
  });

  it("lets mood and height override the placement", () => {
    const { container } = render(<Esie placement="empty" mood="sad" height={200} />);
    const img = container.querySelector("img")!;

    expect(img).toHaveAttribute("data-esie-mood", "sad");
    expect(img).toHaveAttribute("height", "200");
  });

  it("is decorative and lazy by default", () => {
    const { container } = render(<Esie />);
    const img = container.querySelector("img")!;

    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("data-esie-mood", "rest");
  });

  it("is announced when labelled, and eager at high priority with priority", () => {
    const { getByRole } = render(<Esie mood="sad" label="Esie sad" priority />);
    const img = getByRole("img", { name: "Esie sad" });

    expect(img).not.toHaveAttribute("aria-hidden");
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
    expect(img).not.toHaveAttribute("decoding");
  });

  it("serves every mount the same URL, so the signup preload matches the hero", () => {
    const first = render(<Esie mood="wave" />);
    first.unmount();
    const again = render(<Esie mood="wave" />);

    expect(again.container.querySelector("img")).toHaveAttribute("src", esieSrc("wave"));
  });

  it("matches a fresh build of the master and motion (rerun scripts/esie/build.mjs)", () => {
    const { files, ts } = buildEsie() as { files: Record<string, string>; ts: string };
    const committed = readdirSync(join(publicDir, "assets/esie")).filter((f) => f.endsWith(".svg"));

    expect(committed.sort()).toEqual(Object.keys(files).sort());
    for (const [name, content] of Object.entries(files)) {
      expect(readFileSync(join(publicDir, "assets/esie", name), "utf8")).toBe(content);
    }
    expect(readFileSync(join(__dirname, "../../../features/ui/esie/esie-moods.generated.ts"), "utf8")).toBe(ts);
  });

  it("only uses moods that exist", () => {
    for (const { mood } of Object.values(ESIE_PLACEMENTS)) {
      expect(moods).toContain(mood);
    }
  });

  describe.each(moods)("generated %s.svg", (mood) => {
    const { src, ratio } = ESIE_MOODS[mood];
    const svg = readFileSync(join(publicDir, src), "utf8");

    it("matches the ratio the component sizes it by", () => {
      const [, , w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
      expect(w / h).toBeCloseTo(ratio, 3);
    });

    it("names its version in the file name, which the PWA caches match", () => {
      expect(src).toMatch(new RegExp(`^/assets/esie/${mood}\\.[0-9a-f]{8}\\.svg$`));
    });

    it("shows exactly one mouth: an override beats the rule hiding the others", () => {
      const overrides = svg.match(/#mouth #mouth_[a-z]+\{opacity:1!important\}/g) ?? [];
      expect(svg).not.toMatch(/[}>]#mouth_[a-z]+\{opacity:1!important\}/);
      expect(overrides.length).toBeLessThanOrEqual(1);
    });

    it("holds still under reduced motion", () => {
      expect(svg).toContain("@media (prefers-reduced-motion:reduce){*{animation:none!important}}");
    });

    it("settles: no loop runs forever except the blink", () => {
      const infinite = svg.match(/[^;{}]*infinite[^;{}]*/g) ?? [];
      expect(infinite).toEqual(["animation:blink 4s infinite"]);
    });
  });
});
