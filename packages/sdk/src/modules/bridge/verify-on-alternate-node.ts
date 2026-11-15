import { callWithQuorum, RPCError } from "../../hive-tx";
import type { QuorumNodeOutcome } from "../../hive-tx";
import { Entry } from "@/modules/posts/types";
import { normalizeEntry } from "@/modules/posts/utils/normalize-entry";

/** A node's assert that the post (or its author) does not exist: an answer, not a failure. */
const NOT_FOUND_ASSERT = /Assert Exception:.*\bdoes not exist\b/i;

function isAnswer(outcome: QuorumNodeOutcome): boolean {
  if (!("error" in outcome) || outcome.error === undefined) return true;
  const { error } = outcome;
  return error instanceof RPCError && NOT_FOUND_ASSERT.test(error.message);
}

/**
 * When the primary node returns null for a get_post call,
 * verify by querying multiple random nodes. If any node
 * returns the post, it exists (the first node was lagging).
 *
 * Uses callWithQuorum(quorum=1) which shuffles and queries
 * nodes in batches. Since it shuffles, it's unlikely to hit
 * the same node that just returned null first.
 *
 * Resolves the post when a node has it, and `null` only when at least one
 * node answered (null, or a not-found assert). When every node failed
 * (transport error, rate limit, timeout) it throws: a lookup that never got
 * an answer is not "not found".
 *
 * Stays on v1 `bridge.get_post`: quorum picks random nodes, and every node
 * serves v1. The answer is normalized like any other read.
 */
export async function verifyPostOnAlternateNode(
  author: string,
  permlink: string,
  observer: string
): Promise<Entry | null> {
  let answered = false;
  let response: unknown;
  try {
    response = await callWithQuorum(
      "bridge.get_post",
      { author, permlink, observer },
      1,
      undefined,
      (outcome) => {
        if (isAnswer(outcome)) answered = true;
      }
    );
    answered = true;
  } catch (error) {
    // callWithQuorum throws when no node had the post, whether the nodes
    // answered nothing or all failed. Only the second is a failed lookup.
    if (!answered) throw error;
    return null;
  }

  if (
    response &&
    typeof response === "object" &&
    (response as Entry).author === author &&
    (response as Entry).permlink === permlink
  ) {
    return normalizeEntry(response as Entry, observer);
  }

  return null;
}
