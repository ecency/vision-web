/**
 * How many more operations of a given kind an account can still afford.
 *
 * This answers "how many can I still do", so it rounds DOWN. Rounding up
 * reported 1 to a user holding less than a single operation's worth of RC, and
 * 2 to a user who could afford exactly one. That is how the credits tooltip
 * came to promise posts that the chain then rejected for insufficient RC.
 *
 * Note that the cost passed in is the network-wide average for the operation.
 * A full post is a comment_operation like any reply, but it carries a much
 * larger payload, so it costs meaningfully more RC than that average. Treat the
 * result as an optimistic ceiling rather than a guarantee.
 */
export function rcAffordableOperations(currentMana: number, avgCost: number): number {
  if (!Number.isFinite(currentMana) || !Number.isFinite(avgCost)) {
    return 0;
  }
  if (avgCost <= 0 || currentMana <= 0) {
    return 0;
  }

  return Math.floor(currentMana / avgCost);
}
