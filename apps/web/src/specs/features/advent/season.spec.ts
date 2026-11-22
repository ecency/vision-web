import { describe, expect, it } from "vitest";
import { adventPhase, todayDoor, ADVENT_SEASON } from "@/features/advent/season";

const at = (iso: string) => Date.parse(iso);

describe("advent season dates", () => {
  it("is the 2026 season", () => {
    expect(ADVENT_SEASON).toBe(2026);
  });

  it("stays hidden until 25 Nov 00:00 UTC", () => {
    expect(adventPhase(at("2026-11-01T00:00:00Z"))).toBe("hidden");
    expect(adventPhase(at("2026-11-24T23:59:59.999Z"))).toBe("hidden");
  });

  it("is a teaser from 25 Nov until the first door", () => {
    expect(adventPhase(at("2026-11-25T00:00:00Z"))).toBe("teaser");
    expect(adventPhase(at("2026-11-30T23:59:59.999Z"))).toBe("teaser");
  });

  it("is the season from 1 Dec to the end of December", () => {
    expect(adventPhase(at("2026-12-01T00:00:00Z"))).toBe("season");
    expect(adventPhase(at("2026-12-25T12:00:00Z"))).toBe("season");
    expect(adventPhase(at("2026-12-31T23:59:59.999Z"))).toBe("season");
  });

  it("hides itself from 1 Jan 00:00 UTC", () => {
    expect(adventPhase(at("2027-01-01T00:00:00Z"))).toBe("hidden");
    expect(adventPhase(at("2027-06-01T00:00:00Z"))).toBe("hidden");
  });

  it("names today's door by the UTC day, 1 to 24 only", () => {
    expect(todayDoor(at("2026-11-30T23:59:59Z"))).toBeNull();
    expect(todayDoor(at("2026-12-01T00:00:00Z"))).toBe(1);
    // still 6 Dec in UTC, whatever the reader's clock says
    expect(todayDoor(at("2026-12-06T23:30:00Z"))).toBe(6);
    expect(todayDoor(at("2026-12-24T23:59:59Z"))).toBe(24);
    expect(todayDoor(at("2026-12-25T00:00:00Z"))).toBeNull();
    expect(todayDoor(at("2025-12-06T10:00:00Z"))).toBeNull();
  });
});
