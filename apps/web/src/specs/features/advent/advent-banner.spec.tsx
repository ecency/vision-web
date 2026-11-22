import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AdventBanner, markAnsweredToday } from "@/features/advent/advent-banner";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("Advent feed banner", () => {
  it("does not show before 25 November or from 1 January", () => {
    vi.setSystemTime(Date.UTC(2026, 10, 24, 23));
    const { container, unmount } = render(<AdventBanner />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    vi.setSystemTime(Date.UTC(2027, 0, 1, 0, 5));
    expect(render(<AdventBanner />).container).toBeEmptyDOMElement();
  });

  it("invites to the teaser and to today's door", () => {
    vi.setSystemTime(Date.UTC(2026, 10, 25, 8));
    const { unmount } = render(<AdventBanner />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/advent");
    unmount();
    vi.setSystemTime(Date.UTC(2026, 11, 6, 8));
    render(<AdventBanner />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/advent");
  });

  it("stays closed for the rest of the day once dismissed, and comes back the next day", () => {
    vi.setSystemTime(Date.UTC(2026, 11, 6, 8));
    const first = render(<AdventBanner />);
    fireEvent.click(screen.getByRole("button", { name: "g.close" }));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();
    vi.setSystemTime(Date.UTC(2026, 11, 6, 23));
    expect(render(<AdventBanner />).container).toBeEmptyDOMElement();
    vi.setSystemTime(Date.UTC(2026, 11, 7, 0, 1));
    const next = render(<AdventBanner />);
    expect(next.container).not.toBeEmptyDOMElement();
  });

  it("hides once today's door is answered", () => {
    vi.setSystemTime(Date.UTC(2026, 11, 6, 8));
    const r = render(<AdventBanner />);
    act(() => markAnsweredToday());
    r.unmount();
    expect(render(<AdventBanner />).container).toBeEmptyDOMElement();
  });

  it("invites to the results from 25 to 31 December", () => {
    vi.setSystemTime(Date.UTC(2026, 11, 27, 8));
    render(<AdventBanner />);
    expect(screen.getByText("advent.banner-results-cta")).toBeInTheDocument();
  });
});
