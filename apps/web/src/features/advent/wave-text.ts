export const ADVENT_TAG = "ecencyadvent";
export const ADVENT_URL = "https://ecency.com/advent";

/// The Wave a door's answer is shared as. A written answer is shared in full.
/// A quiz or poll Wave only says which door was opened: the choice stays
/// private, so nobody can copy a quiz answer from the feed. The advent tag
/// comes first, since a Wave's tags are its hashtags in order.
export function waveText(door: { day: number; kind: "open" | "quiz" | "poll" }, answer?: string): string {
  const head = `#${ADVENT_TAG} I opened door ${door.day} of the Ecency Advent Calendar 🎄`;
  if (door.kind !== "open") return `${head}\n\n${ADVENT_URL}`;
  return `${head}\n\n${(answer ?? "").trim()}\n\n${ADVENT_URL}`;
}
