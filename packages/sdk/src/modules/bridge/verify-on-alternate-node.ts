import { callWithQuorum } from "../../hive-tx";
import { Entry } from "@/modules/posts/types";
import { normalizeEntry } from "@/modules/posts/utils/normalize-entry";

/**
 * When the primary node returns null for a get_post call,
 * verify by querying multiple random nodes. If any node
 * returns the post, it exists (the first node was lagging).
 *
 * Uses callWithQuorum(quorum=1) which shuffles and queries
 * nodes in batches. Since it shuffles, it's unlikely to hit
 * the same node that just returned null first.
 *
 * Stays on v1 `bridge.get_post`: quorum picks random nodes, and every node
 * serves v1. The answer is normalized like any other read.
 */
export async function verifyPostOnAlternateNode(
  author: string,
  permlink: string,
  observer: string
): Promise<Entry | null> {
  try {
    const response = await callWithQuorum("bridge.get_post", {
      author,
      permlink,
      observer,
    }, 1);

    if (
      response &&
      typeof response === "object" &&
      (response as Entry).author === author &&
      (response as Entry).permlink === permlink
    ) {
      return normalizeEntry(response as Entry, observer);
    }
  } catch {
    // All nodes failed or returned null
  }

  return null;
}
