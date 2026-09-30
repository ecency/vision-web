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

  it("before the season: the opening pest in full, the rest as silhouettes with their names, and how to get ready", () => {
    vi.mocked(drawPortrait).mockClear();
    render(
      <FieldGuideSheet
        calendar={{ season: 0, week: 0, resting: true, startsAt: start }}
        onClose={vi.fn()}
      />
    );
    const cards = pests();
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.classList.contains("is-hidden"))).toEqual([false, true, true, true]);
    // names and tricks are public; only the look waits for the week
    expect(cards[2].textContent).toContain("raidstead.bosses.twins.name");
    expect(cards[2].textContent).toContain("raidstead.bosses.twins.trick");
    expect(cards[2].textContent).toContain("raidstead.guide.pest-hidden");
    const drawn = vi.mocked(drawPortrait).mock.calls.map(([, kind, o]) => [kind, !!o?.silhouette]);
    expect(drawn).toEqual(
      expect.arrayContaining([
        ["beetle", false],
        ["slug", true],
        ["twins", true],
        ["queen", true],
        ["scout", false]
      ])
    );
    // a hidden pest is never drawn in full
    expect(
      drawn.filter(([kind, s]) => ["slug", "twins", "queen"].includes(kind as string) && !s)
    ).toEqual([]);
    expect(screen.getByText("raidstead.guide.ready-title")).toBeTruthy();
  });

  it("in week 3: three pests shown, the finale still hidden, no get-ready list", () => {
    render(
      <FieldGuideSheet
        calendar={{ season: 1, week: 3, resting: false, startsAt: start }}
        onClose={vi.fn()}
      />
    );
    expect(pests().map((c) => c.classList.contains("is-hidden"))).toEqual([
      false,
      false,
      false,
      true
    ]);
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
