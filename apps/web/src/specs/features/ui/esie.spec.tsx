import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Esie, ESIE_PLACEMENTS, esieSrc } from "@ui/esie";
import { ESIE_MOODS, type EsieMood } from "@ui/esie/esie-moods.generated";

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

  it("gives a mood shown again its own URL, so its animation starts over", () => {
    const first = render(<Esie mood="surprised" />);
    expect(first.container.querySelector("img")).toHaveAttribute("src", esieSrc("surprised"));
    first.unmount();

    const again = render(<Esie mood="surprised" />);
    const src = again.container.querySelector("img")!.getAttribute("src")!;
    expect(src.startsWith(`${esieSrc("surprised")}&i=`)).toBe(true);
  });

  it("only uses moods that exist", () => {
    for (const { mood } of Object.values(ESIE_PLACEMENTS)) {
      expect(moods).toContain(mood);
    }
  });

  describe.each(moods)("generated %s.svg", (mood) => {
    const { src, ratio } = ESIE_MOODS[mood];
    const svg = readFileSync(join(publicDir, src.split("?")[0]), "utf8");

    it("matches the ratio the component sizes it by", () => {
      const [, , w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
      expect(w / h).toBeCloseTo(ratio, 3);
    });

    it("is the build output its URL hash names (rerun scripts/esie/build.mjs)", () => {
      const hash = createHash("sha256").update(svg.replace(/\n$/, "")).digest("hex").slice(0, 8);
      expect(src).toBe(`/assets/esie/${mood}.svg?v=${hash}`);
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
