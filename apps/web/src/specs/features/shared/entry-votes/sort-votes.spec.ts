import { describe, expect, it } from "vitest";
import { sortVotes } from "@/features/shared/entry-votes/sort-votes";

// Review 9c: rows read through database_api (a node without bridge.list_votes)
// carry no reputation. Sorting by reputation must still be deterministic: the
// rows without one go last, in voter order.
const v = (voter: string, reputation?: number) =>
  ({ voter, reputation, percent: 1, rshares: 1, time: "", weight: 1 }) as any;

describe("sortVotes by reputation", () => {
  it("puts rows without a reputation last, ordered by voter, whatever the input order", () => {
    const rows = [v("zed"), v("amy", 50), v("bob"), v("cat", 70), v("abe")];
    const expected = ["cat", "amy", "abe", "bob", "zed"];
    expect(sortVotes(rows, "reputation").map((r) => r.voter)).toEqual(expected);
    expect(sortVotes([...rows].reverse(), "reputation").map((r) => r.voter)).toEqual(expected);
  });

  it("still sorts ordinary keys descending", () => {
    const rows = [v("a", 1), v("b", 3), v("c", 2)];
    expect(sortVotes(rows, "reputation").map((r) => r.voter)).toEqual(["b", "c", "a"]);
  });
});
