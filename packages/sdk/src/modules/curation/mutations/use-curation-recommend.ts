import { useBroadcastMutation, invalidateAfterBroadcast } from "@/modules/core/mutations";
import type { BroadcastMode } from "@/modules/core/mutations";
import { QueryKeys } from "@/modules/core";
import type { AuthContextV2 } from "@/modules/core/types";
import {
  buildCurationRecommendOp,
  buildCurationUnrecommendOp,
} from "@/modules/operations/builders";
import type { CurationReason } from "../types";

export interface CurationRecommendPayload {
  author: string;
  permlink: string;
  /** Defaults to "quality" on recommend; ignored on withdraw. */
  reason?: CurationReason;
  /** Broadcast the `unrecommend` op instead. */
  withdraw?: boolean;
}

/**
 * The broadcast result is not uniform across auth paths: the key path returns
 * `{tx_id, status}`, the HiveSigner token and Keychain extension paths return
 * `{id, block_num, ...}`; the redirect flows never resolve at all. This
 * gives the one shape the desk needs (a 40 hex char id) or null.
 */
export function normalizeBroadcastTrxId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as { tx_id?: unknown; id?: unknown };
  const id = typeof r.tx_id === "string" ? r.tx_id : typeof r.id === "string" ? r.id : null;
  return id && /^[0-9a-f]{40}$/.test(id) ? id : null;
}

/**
 * Recommend a post to the curators (or withdraw a recommendation) with one
 * `custom_json` under posting authority. The desk indexes the op from the
 * chain; nothing is written to a desk route here. Platform wrappers send the
 * optional meta ping after success.
 */
export function useCurationRecommend(
  username: string | undefined,
  auth?: AuthContextV2,
  broadcastMode?: BroadcastMode
) {
  return useBroadcastMutation<CurationRecommendPayload>(
    ["curation", "recommend"],
    username,
    (payload) => [
      payload.withdraw
        ? buildCurationUnrecommendOp(username!, payload.author, payload.permlink)
        : buildCurationRecommendOp(username!, payload.author, payload.permlink, payload.reason),
    ],
    async (_result, variables) => {
      await invalidateAfterBroadcast(auth?.adapter, broadcastMode, [
        QueryKeys.curation.post(variables.author, variables.permlink),
        [...QueryKeys.curation._recommendationsPrefix],
      ]);
    },
    auth,
    "posting",
    { broadcastMode }
  );
}
