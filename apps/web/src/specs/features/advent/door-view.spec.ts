import { describe, expect, it } from "vitest";
import { doorView } from "@/features/advent/door-view";
import type { MeDoor, PublicDoor } from "@/features/advent/types";

const door = (status: PublicDoor["status"], day = 6): PublicDoor => ({
  day,
  unlockAt: "2026-12-06T00:00:00.000Z",
  closeAt: "2026-12-06T23:59:59.999Z",
  kind: "open",
  reward: { kind: "points", amounts: [2500, 1500, 1000] },
  status
});
const me = (m: Partial<MeDoor>): MeDoor => ({ opened: true, answered: false, late: false, ...m });

describe("advent door look", () => {
  it("keeps a locked door wrapped for everyone", () => {
    expect(doorView(door("locked"), undefined, true).look).toBe("locked");
    expect(doorView(door("locked"), undefined, false).look).toBe("locked");
  });

  it("shows the open door as today's until it is answered, then waits for the draw", () => {
    expect(doorView(door("open"), undefined, true).look).toBe("today");
    expect(doorView(door("open"), me({}), true).look).toBe("today");
    expect(doorView(door("open"), undefined, false).look).toBe("today");
    expect(doorView(door("open"), me({ answered: true }), true).look).toBe("waiting");
    expect(doorView(door("closed"), me({ answered: true }), true).look).toBe("waiting");
  });

  it("frosts a door the reader missed, and shows results to a signed-out reader", () => {
    expect(doorView(door("closed"), undefined, true).look).toBe("missed");
    expect(doorView(door("drawn"), me({}), true).look).toBe("missed");
    expect(doorView(door("closed"), undefined, false).look).toBe("closed");
    expect(doorView(door("drawn"), undefined, false).look).toBe("results");
  });

  it("unwraps an answered drawn door and carries the participation Points", () => {
    const v = doorView(door("drawn"), me({ answered: true, participation: { amount: 25, status: "paid" } }), true);
    expect(v.look).toBe("answered");
    expect(v.participation).toEqual({ amount: 25, status: "paid" });
  });

  it("turns a won door gold with its place and prize", () => {
    const prize = { place: 2, kind: "points" as const, amount: 1500, status: "paid" as const };
    const v = doorView(door("drawn"), me({ answered: true, prize }), true);
    expect(v.look).toBe("won");
    expect(v.prize).toEqual(prize);
  });

  it("marks a late answer as answered and late, never waiting for a draw it is not in", () => {
    const v = doorView(door("closed"), me({ answered: true, late: true }), true);
    expect(v.look).toBe("answered");
    expect(v.late).toBe(true);
  });
});
