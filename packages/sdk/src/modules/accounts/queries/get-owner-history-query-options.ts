import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { callRPC } from "@/modules/core/hive-tx";
import type { Authority } from "../../../hive-tx";

/** One row of `condenser_api.get_owner_history`. Times are UTC without a zone suffix. */
export interface OwnerHistoryEntry {
  id: number;
  account: string;
  previous_owner_authority: Authority;
  last_valid_time: string;
}

/** recover_account is operation 25, so this is its bit in operation_filter_low. */
const RECOVER_ACCOUNT_FILTER_LOW = 2 ** 25;

/**
 * Earlier owner authorities of an account and the time each stopped being valid.
 */
export function getOwnerHistoryQueryOptions(username: string | undefined) {
  return queryOptions({
    enabled: !!username,
    queryKey: QueryKeys.accounts.ownerHistory(username!),
    queryFn: async () => {
      // prefetchQuery and fetchQuery ignore `enabled`.
      if (!username) {
        throw new Error("[SDK][getOwnerHistory] username is required");
      }
      return callRPC("condenser_api.get_owner_history", [username]) as Promise<OwnerHistoryEntry[]>;
    },
  });
}

/**
 * Timestamp of the account's most recent `recover_account` operation, or null when
 * the account was never recovered.
 */
export function getLastAccountRecoveryQueryOptions(username: string | undefined) {
  return queryOptions({
    enabled: !!username,
    queryKey: QueryKeys.accounts.lastRecovery(username!),
    queryFn: async (): Promise<string | null> => {
      if (!username) {
        throw new Error("[SDK][getLastAccountRecovery] username is required");
      }
      // A failed lookup must reject, never read as "never recovered": that would
      // switch the lineage rule off. The validator makes callRPC fail over to the
      // next node on a malformed answer.
      const rows = (await callRPC(
        "condenser_api.get_account_history",
        [username, -1, 1000, RECOVER_ACCOUNT_FILTER_LOW, 0],
        undefined,
        undefined,
        undefined,
        (result) => Array.isArray(result)
      )) as [number, { timestamp: string; op: [string, unknown] }][] | null;

      if (!Array.isArray(rows)) {
        throw new Error("[SDK][getLastAccountRecovery] Unexpected account history response");
      }

      let latest: string | null = null;
      for (const [, entry] of rows) {
        if (entry?.op?.[0] !== "recover_account") continue;
        if (latest === null || entry.timestamp > latest) {
          latest = entry.timestamp;
        }
      }
      return latest;
    },
  });
}
