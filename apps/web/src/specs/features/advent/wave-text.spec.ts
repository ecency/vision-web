import { describe, expect, it, vi } from "vitest";
import { waveText } from "@/features/advent/wave-text";

// the real English copy, so the text can be read
vi.mock("i18next", () => ({
  default: { t: (k: string, o?: { day?: number }) => (k === "advent.wave-head" ? `I opened door ${o?.day} of the Ecency Advent Calendar` : k) }
}));

describe("advent Wave text", () => {
  it("shares a written answer with the tag and a link back", () => {
    const t = waveText({ day: 6, kind: "open" }, "  I learned to curate.  ");
    expect(t).toContain("\n\nI learned to curate.\n\n");
    expect(t).toContain("#ecencyadvent");
    expect(t).toContain("https://ecency.com/advent");
    expect(t).toContain("door 6");
  });

  it("never carries the choice of a quiz or poll door", () => {
    const choices = ["Waves", "Decks", "Scheduled posts"];
    for (const kind of ["quiz", "poll"] as const) {
      const t = waveText({ day: 9, kind }, "Decks");
      for (const c of choices) expect(t).not.toContain(c);
      expect(t).toContain("door 9");
      expect(t).toContain("#ecencyadvent");
    }
  });

  it("puts the advent tag before the reader's own hashtags, once", () => {
    const t = waveText({ day: 1, kind: "open" }, "Loving #hive and #photography");
    // a Wave's tags are its hashtags in order: the first one files it under the advent
    expect(t.match(/#[a-zA-Z0-9]+/g)?.[0]).toBe("#ecencyadvent");
    expect(t.match(/#ecencyadvent/g)).toHaveLength(1);
  });
});
