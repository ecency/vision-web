import { InfiniteData, infiniteQueryOptions } from "@tanstack/react-query";
import { utils } from "../../../hive-tx";
import { QueryKeys } from "@/modules/core";
import { Transaction, OperationGroup } from "../types/transaction";
import { callREST } from "@/modules/core/hive-tx";
import { parseAsset, NaiMap } from "@/modules/core/utils";

const ops = utils.operations;

export const ACCOUNT_OPERATION_GROUPS: Record<OperationGroup, number[]> = {
  transfers: [
    ops.transfer,
    ops.transfer_to_savings,
    ops.transfer_from_savings,
    ops.cancel_transfer_from_savings,
    // The virtual op emitted when a savings withdrawal completes. It used to be a
    // second copy of fill_recurrent_transfer, so a completed savings withdrawal was
    // never returned by the transfers group nor by ALL_ACCOUNT_OPERATIONS.
    ops.fill_transfer_from_savings,
    ops.recurrent_transfer,
    ops.fill_recurrent_transfer,
    ops.escrow_transfer,
  ],
  "market-orders": [
    ops.fill_convert_request,
    ops.fill_order,
    ops.fill_collateralized_convert_request,
    ops.limit_order_create2,
    ops.limit_order_create,
    ops.limit_order_cancel,
  ],
  interests: [ops.interest],
  "stake-operations": [
    ops.return_vesting_delegation,
    ops.withdraw_vesting,
    ops.transfer_to_vesting,
    ops.set_withdraw_vesting_route,
    ops.update_proposal_votes,
    ops.fill_vesting_withdraw,
    ops.account_witness_proxy,
    ops.delegate_vesting_shares,
  ],
  rewards: [
    ops.author_reward,
    ops.curation_reward,
    ops.producer_reward,
    ops.claim_reward_balance,
    ops.comment_benefactor_reward,
    ops.liquidity_reward,
    ops.proposal_pay,
  ],
};

/**
 * Every operation any group asks for, de-duplicated. Groups overlap (an op can be
 * meaningful to more than one), and the raw concatenation used to repeat ids in the
 * `operation-types` query string sent to hafah.
 */
export const ALL_ACCOUNT_OPERATIONS = Array.from(
  new Set(Object.values(ACCOUNT_OPERATION_GROUPS).flat())
);

interface TxPageRaw {
  entries: Transaction[];
  currentPage: number;
}

/**
 * Cursor for transaction pagination.
 * null = first request (returns newest page, API omits page param).
 * number = specific page to fetch (decrementing for older data).
 */
type TxCursor = number | null;

interface HafahOperation {
  op: {
    type: string;
    value: Record<string, unknown>;
  };
  block: number;
  trx_id: string;
  op_pos: number;
  op_type_id: number;
  timestamp: string;
  virtual_op: boolean;
  operation_id: string;
  trx_in_block: number;
}

interface HafahResponse {
  total_operations: number;
  total_pages: number;
  operations_result: HafahOperation[];
}

/**
 * Derive a safe, unique, and chronologically ordered `num` from REST fields.
 *
 * Layout: block * 10_000_000 + trx_in_block * 100 + op_pos
 *   - trx_in_block: up to 99_999 (Hive max block size ~65K txs)
 *   - op_pos: up to 99 (operations within a single transaction)
 *   - Max value: 105_000_000 * 10_000_000 = 1.05e15, within MAX_SAFE_INTEGER (9.007e15)
 */
function deriveNum(entry: HafahOperation): number {
  return entry.block * 10_000_000 + entry.trx_in_block * 100 + entry.op_pos;
}

/**
 * Strip the `_operation` suffix from the REST API type name
 * to match the Transaction type discriminants (e.g. "transfer").
 */
function normalizeOpType(restType: string): string {
  return restType.replace(/_operation$/, "");
}

/**
 * Check if a value is a NAI asset object (e.g. { nai: "@@000000021", amount: "1000", precision: 3 }).
 */
function isNaiAsset(v: unknown): v is { nai: string; amount: string; precision: number } {
  return typeof v === "object" && v !== null && "nai" in v && "amount" in v && "precision" in v;
}

/**
 * Convert a NAI asset object to a human-readable string like "1.000 HIVE".
 * Returns the value unchanged if it's not a NAI object.
 */
function naiToString(v: unknown): unknown {
  if (!isNaiAsset(v)) return v;
  const parsed = parseAsset(v);
  const symbol = NaiMap[v.nai as keyof typeof NaiMap] ?? "UNKNOWN";
  return `${parsed.amount.toFixed(v.precision)} ${symbol}`;
}

/**
 * Convert all NAI asset objects in an operation's value to human-readable strings
 * so downstream renderers that expect "1.000 HIVE" don't crash with object values.
 */
function normalizeOpValue(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = naiToString(v);
  }
  return result;
}

/**
 * Get account transaction history with pagination and filtering.
 * Uses the hafah-api REST endpoint for server-side op-type filtering
 * and real pagination metadata.
 *
 * @param username - Account name to get transactions for
 * @param limit - Number of transactions per page
 * @param group - Filter by operation group (transfers, market-orders, etc.)
 */
export function getTransactionsInfiniteQueryOptions(
  username?: string,
  limit = 20,
  group: OperationGroup | "" = ""
) {
  const operationTypes = group
    ? ACCOUNT_OPERATION_GROUPS[group]
    : ALL_ACCOUNT_OPERATIONS;

  return infiniteQueryOptions<
    TxPageRaw,
    Error,
    InfiniteData<TxPageRaw, TxCursor>,
    (string | number)[],
    TxCursor
  >({
    queryKey: QueryKeys.accounts.transactions(username ?? "", group, limit),
    initialPageParam: null as TxCursor,

    queryFn: async ({ pageParam, signal }: { pageParam: TxCursor; signal?: AbortSignal }) => {
      if (!username) {
        return { entries: [], currentPage: 0 };
      }

      const fetchPage = async (page: TxCursor) => {
        const params: Record<string, string | number> = {
          "account-name": username,
          "operation-types": operationTypes.join(","),
          "page-size": limit,
        };

        // First call: omit page to get newest data
        // Subsequent calls: pass specific page number (decrementing)
        if (page !== null) {
          params.page = page;
        }

        return (await callREST(
          "hafah",
          "/accounts/{account-name}/operations",
          params,
          undefined,
          undefined,
          signal
        )) as HafahResponse;
      };

      const toEntries = (response: HafahResponse) =>
        response.operations_result.map((entry) => {
          const type = normalizeOpType(entry.op.type);
          const value = normalizeOpValue(entry.op.value);
          return {
            ...value,
            num: deriveNum(entry),
            type,
            timestamp: entry.timestamp,
            trx_id: entry.trx_id,
          } as Transaction;
        });

      const response = await fetchPage(pageParam);
      let entries = toEntries(response);
      let currentPage = pageParam ?? response.total_pages;

      // hafah pages oldest-first, so the newest page (what an omitted `page`
      // returns) is the remainder bucket: total_operations mod page-size rows,
      // anywhere from 1 to page-size. Requesting page=total_pages explicitly
      // returns the same short bucket, so the only way to a full-size first
      // screen is chaining the next older page in.
      if (pageParam === null && entries.length < limit && response.total_pages > 1) {
        try {
          const chained = await fetchPage(response.total_pages - 1);
          entries = [...entries, ...toEntries(chained)];
          currentPage = response.total_pages - 1;
        } catch (e) {
          // Caller cancellation is not a node failure: rethrow so the query
          // settles as cancelled instead of resolving with a partial page.
          if (signal?.aborted) {
            throw e;
          }
          // Keep the short remainder page; the cursor stays at total_pages so
          // the page that failed here is fetchNextPage's next target, not lost.
        }
      }

      return { entries, currentPage };
    },

    getNextPageParam: (lastPage) => {
      const nextPage = lastPage.currentPage - 1;
      return nextPage >= 1 ? nextPage : undefined;
    },
  });
}
