import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FieldGuideSheet } from "@/app/raidstead/_components/field-guide";

vi.mock("@ecency/raidstead", async (orig) => ({
  ...(await orig<typeof import("@ecency/raidstead")>()),
  drawPortrait: vi.fn()
}));

import { drawPortrait } from "@ecency/raidstead";

const start = new Date(Date.UTC(2026, 9, 10)).toISOString();
const pests = () =>
  within(screen.getByRole("dialog"))
    .getAllByRole("listitem")
    .filter((li) => li.closest(".rs-pests"));

describe("FieldGuideSheet", () => {
  // jsdom lays nothing out: give canvases a size so the portraits draw
  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 52
    });
  });
  afterAll(() => {
    delete (HTMLCanvasElement.prototype as { clientWidth?: number }).clientWidth;
  });

  it("before the season: every pest in full with its name, and how to get ready", () => {
    vi.mocked(drawPortrait).mockClear();
    render(
      <FieldGuideSheet
        calendar={{ season: 0, week: 0, resting: true, startsAt: start }}
        onClose={vi.fn()}
      />
    );
    const cards = pests();
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.classList.contains("is-hidden"))).toEqual([
      false,
      false,
      false,
      false
    ]);
    expect(cards[2].textContent).toContain("raidstead.bosses.twins.name");
    expect(cards[2].textContent).toContain("raidstead.bosses.twins.trick");
    // the week and its arrival date stay
    expect(cards[2].textContent).toContain("raidstead.guide.pest-week");
    const pestCalls = vi
      .mocked(drawPortrait)
      .mock.calls.filter(([, kind]) => ["beetle", "slug", "twins", "queen"].includes(kind));
    expect(pestCalls.map(([, kind]) => kind).sort()).toEqual(["beetle", "queen", "slug", "twins"]);
    // drawn in full: no silhouette option at all
    expect(pestCalls.every(([, , o]) => !o || !("silhouette" in o))).toBe(true);
    expect(screen.getByText("raidstead.guide.ready-title")).toBeTruthy();
  });

  it("on season 2 day 1: all four pests in full, no get-ready list", () => {
    vi.mocked(drawPortrait).mockClear();
    render(
      <FieldGuideSheet
        calendar={{ season: 2, week: 1, resting: false, startsAt: start }}
        onClose={vi.fn()}
      />
    );
    expect(pests().map((c) => c.classList.contains("is-hidden"))).toEqual([
      false,
      false,
      false,
      false
    ]);
    const pestCalls = vi
      .mocked(drawPortrait)
      .mock.calls.filter(([, kind]) => ["beetle", "slug", "twins", "queen"].includes(kind));
    expect(pestCalls.map(([, kind]) => kind).sort()).toEqual(["beetle", "queen", "slug", "twins"]);
    expect(pestCalls.every(([, , o]) => !o || !("silhouette" in o))).toBe(true);
    expect(screen.queryByText("raidstead.guide.pest-hidden")).toBeNull();
    expect(screen.queryByText("raidstead.guide.pests-note")).toBeNull();
    expect(screen.queryByText("raidstead.guide.ready-title")).toBeNull();
  });

  it("closes from its button", () => {
    const onClose = vi.fn();
    render(
      <FieldGuideSheet
        calendar={{ season: 1, week: 1, resting: false, startsAt: start }}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "raidstead.guide.close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
