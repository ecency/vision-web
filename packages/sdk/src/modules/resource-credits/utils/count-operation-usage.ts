import { utf8ByteLength, varintByteLength } from "@/modules/core/utf8";
import type { RcResourceName, RcSizeInfo } from "../types/resource-params";
import type { RcResourceUsage } from "./price-rc-usage";

/**
 * Ports of the per-operation arms of `count_resources`
 * (hive/libraries/chain/rc/resource_count.cpp).
 *
 * Every operation charges three things: the serialized transaction size as
 * history_bytes, a per-operation state footprint, and execution time. Only the
 * middle two differ per operation, which is why they live together here.
 */

/** Fixed header: ref_block_num(2) + ref_block_prefix(4) + expiration(4) + extensions varint(1). */
export const TRANSACTION_HEADER_BYTES = 11;
export const SIGNATURE_BYTES = 65;

export const stringFieldBytes = (value: string): number => {
  const length = utf8ByteLength(value);
  return varintByteLength(length) + length;
};

const emptyUsage = (): RcResourceUsage => ({
  resource_history_bytes: 0,
  resource_new_accounts: 0,
  resource_market_bytes: 0,
  resource_state_bytes: 0,
  resource_execution_time: 0
});

export interface VoteLike {
  voter: string;
  author: string;
  permlink: string;
}

/** Serialized size of a transaction carrying a single vote. */
export function estimateVoteTransactionBytes(op: VoteLike, signatures = 1): number {
  const operationBytes =
    1 + // operation variant id
    stringFieldBytes(op.voter) +
    stringFieldBytes(op.author) +
    stringFieldBytes(op.permlink) +
    2; // weight, int16

  return (
    TRANSACTION_HEADER_BYTES +
    varintByteLength(1) +
    operationBytes +
    varintByteLength(signatures) +
    SIGNATURE_BYTES * signatures
  );
}

/**
 * A vote's footprint is fixed: `vote_size` state bytes and `vote_time`
 * execution time, regardless of the post being voted on.
 */
export function countVoteResourceUsage(
  { transactionBytes, signatures = 1 }: { transactionBytes: number; signatures?: number },
  sizeInfo: RcSizeInfo
): RcResourceUsage {
  const state = sizeInfo.resource_state_bytes;
  const exec = sizeInfo.resource_execution_time;

  return {
    ...emptyUsage(),
    resource_history_bytes: transactionBytes,
    resource_state_bytes: state.vote_size + state.transaction_base_size,
    resource_execution_time:
      exec.vote_time + exec.transaction_time + exec.verify_authority_time * signatures
  };
}

/** Resource names, re-exported so callers do not reach into the types module. */
export type { RcResourceName };
