import { callWithQuorum, RPCError } from "../../hive-tx";
import type { QuorumNodeOutcome } from "../../hive-tx";
import { isNodeCapabilityAssert } from "../../hive-tx/helpers/call";
import { Entry } from "@/modules/posts/types";
import { normalizeEntry } from "@/modules/posts/utils/normalize-entry";

/**
 * A node answered: a result (null included), or an `Assert Exception:` that is
 * the chain or hivemind answering the request (the post or author does not
 * exist, an author no account can have, a deleted post). Only an assert that
 * the node cannot serve the method is a node failure, as in callRPC.
 */
function isAnswer(outcome: QuorumNodeOutcome): boolean {
  if (!("error" in outcome) || outcome.error === undefined) return true;
  const { error } = outcome;
  return (
    error instanceof RPCError &&
    /^\s*Assert Exception:/.test(error.message) &&
    !isNodeCapabilityAssert(error.message)
  );
}

/**
 * When the primary node returns null for a get_post call,
 * verify by querying the other nodes. If any node
 * returns the post, it exists (the first node was lagging).
 *
 * Uses callWithQuorum(quorum=1), which shuffles every configured node, so it
 * can ask `primaryNode` (the node that answered null first) again. A lagging
 * node answers null again, so its answer does not count, unless no other node
 * was asked at all (a pool of one node).
 *
 * Resolves the post when a node has it, and `null` only when another node
 * answered (null, or an assert such as "does not exist"). When every other
 * node failed (transport error, rate limit, timeout) it throws the last node
 * error: a lookup that never got an answer is not "not found".
 *
 * Stays on v1 `bridge.get_post`: quorum picks random nodes, and every node
 * serves v1. The answer is normalized like any other read.
 */
export async function verifyPostOnAlternateNode(
  author: string,
  permlink: string,
  observer: string,
  primaryNode?: string
): Promise<Entry | null> {
  let answered = false;
  let primaryAnswered = false;
  let askedOtherNode = false;
  let lastNodeError: unknown;
  let response: unknown;
  try {
    response = await callWithQuorum(
      "bridge.get_post",
      { author, permlink, observer },
      1,
      undefined,
      (outcome) => {
        const isPrimary = primaryNode !== undefined && outcome.node === primaryNode;
        if (!isPrimary) askedOtherNode = true;
        if (isAnswer(outcome)) {
          if (isPrimary) primaryAnswered = true;
          else answered = true;
        } else if (!isPrimary || lastNodeError === undefined) {
          lastNodeError = outcome.error;
        }
      }
    );
    answered = true;
  } catch (error) {
    // callWithQuorum throws when no node had the post, whether the nodes
    // answered nothing or all failed. Only the second is a failed lookup.
    if (answered || (primaryAnswered && !askedOtherNode)) return null;
    if (lastNodeError instanceof Error) {
      if (lastNodeError.cause === undefined) lastNodeError.cause = error;
      throw lastNodeError;
    }
    throw error;
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
