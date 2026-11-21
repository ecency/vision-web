import type { MeDoor, PublicDoor } from "./types";

/// How a door looks on the calendar:
/// - locked: still wrapped, shows its prize type;
/// - today: the open door, waiting for this reader's answer;
/// - waiting: answered, the draw has not happened yet;
/// - answered: unwrapped (drawn, or answered late and so in no draw);
/// - won: gold, with the place and prize;
/// - missed: frosted, the signed-in reader did not answer in time;
/// - closed / results: a past door for a signed-out reader, before and after its draw.
export type DoorLook = "locked" | "today" | "waiting" | "answered" | "won" | "missed" | "closed" | "results";

export interface DoorView {
  look: DoorLook;
  late?: boolean;
  prize?: MeDoor["prize"];
  participation?: MeDoor["participation"];
}

export function doorView(door: PublicDoor, me: MeDoor | undefined, signedIn: boolean): DoorView {
  if (door.status === "locked") return { look: "locked" };
  const answered = !!me?.answered;
  if (answered && me!.late) return { look: "answered", late: true };
  if (door.status === "open") return { look: answered ? "waiting" : "today" };
  if (door.status === "closed") return { look: answered ? "waiting" : signedIn ? "missed" : "closed" };
  if (me?.prize && me.prize.status !== "cancelled") return { look: "won", prize: me.prize };
  if (answered) return { look: "answered", ...(me!.participation ? { participation: me!.participation } : {}) };
  return { look: signedIn ? "missed" : "results" };
}
