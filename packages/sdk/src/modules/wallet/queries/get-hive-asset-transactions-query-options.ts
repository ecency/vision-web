import { callRPC } from "../../../hive-tx";
import { utils } from "../../../hive-tx";
import { infiniteQueryOptions } from "@tanstack/react-query";
import { HIVE_ACCOUNT_OPERATION_GROUPS } from "../consts";
import type {
  AuthorReward,
  ClaimRewardBalance,
  HiveOperationFilter,
  HiveOperationFilterKey,
  HiveOperationFilterValue,
  HiveOperationGroup,
  HiveOperationName,
} from "../types";
import type { HiveTransaction } from "../types";
import { parseAsset } from "@/modules/core/utils";

const operationOrders = utils.operations;

function isHiveOperationName(value: string): value is HiveOperationName {
  return Object.prototype.hasOwnProperty.call(operationOrders, value);
}

export function resolveHiveOperationFilters(filters: HiveOperationFilter): {
  filterKey: HiveOperationFilterKey;
  filterArgs: any[];
} {
  const rawValues: HiveOperationFilterValue[] = Array.isArray(filters)
    ? filters
    : [filters];

  const hasAll = rawValues.includes("" as HiveOperationGroup);

  const uniqueValues = Array.from(
    new Set(
      rawValues.filter(
        (value): value is HiveOperationFilterValue =>
          value !== undefined &&
          value !== null &&
          value !== ("" as HiveOperationGroup)
      )
    )
  );

  const filterKey: HiveOperationFilterKey =
    hasAll || uniqueValues.length === 0
      ? "all"
      : uniqueValues
          .map((value) => value.toString())
          .sort()
          .join("|");

  const operationIds = new Set<number>();

  if (!hasAll) {
    uniqueValues.forEach((value) => {
      if (value in HIVE_ACCOUNT_OPERATION_GROUPS) {
        HIVE_ACCOUNT_OPERATION_GROUPS[value as HiveOperationGroup].forEach(
          (id) => operationIds.add(id)
        );
        return;
      }

      if (isHiveOperationName(value)) {
        operationIds.add(operationOrders[value]);
      }
    });
  }

  const filterArgs = makeBitMaskFilter(Array.from(operationIds));

  return {
    filterKey,
    filterArgs,
  };
}

/**
 * The operation names the caller asked for explicitly, ignoring group aliases.
 *
 * Used by the per-asset `select` filters so an operation a caller deliberately
 * requested is never silently dropped just because the asset filter has no opinion
 * about it. Passing no filter at all keeps the historical behaviour: the asset's own
 * allow-list decides, and nothing extra leaks in.
 */
export function collectRequestedOperations(
  filters: HiveOperationFilter
): Set<string> {
  const rawValues = Array.isArray(filters) ? filters : [filters];
  return new Set(
    rawValues.filter(
      (value): value is HiveOperationFilterValue =>
        value !== undefined && value !== null && value !== ("" as HiveOperationGroup)
    )
  );
}

/**
 * Cursor for `condenser_api.get_account_history`.
 *
 * A page comes back in ASCENDING `num` order, so the OLDEST entry is at index 0 and
 * walking backwards means `page[0].num - 1`. Reading the LAST entry instead takes the
 * NEWEST row, which advances the window by a single operation per page (a page of 1000
 * overlaps its predecessor by 999) and, once `num` reaches 0, yields -1 — the "newest"
 * sentinel `initialPageParam` uses — so the walk restarts at the head of the history and
 * never terminates.
 */
export function getNextAccountHistoryPageParam(
  lastPage: HiveTransaction[] | undefined
): number | undefined {
  if (!lastPage?.length) {
    return undefined;
  }

  const oldest = Number(lastPage[0]?.num ?? 0);
  return Number.isFinite(oldest) && oldest > 0 ? oldest - 1 : undefined;
}

function makeBitMaskFilter(allowedOperations: number[]) {
  let low = 0n;
  let high = 0n;

  allowedOperations.forEach((operation) => {
    if (operation < 64) {
      low |= 1n << BigInt(operation);
    } else {
      high |= 1n << BigInt(operation - 64);
    }
  });

  return [
    low !== 0n ? low.toString() : null,
    high !== 0n ? high.toString() : null,
  ];
}

export function getHiveAssetTransactionsQueryOptions(
  username: string | undefined,
  limit = 20,
  filters: HiveOperationFilter = []
) {
  const { filterArgs, filterKey } = resolveHiveOperationFilters(filters);
  const requestedOperations = collectRequestedOperations(filters);

  return infiniteQueryOptions<HiveTransaction[]>({
    queryKey: ["assets", "hive", "transactions", username, limit, filterKey],
    initialPageParam: -1,
    getNextPageParam: getNextAccountHistoryPageParam,

    queryFn: async ({ pageParam }) => {
      const response = await callRPC(
        "condenser_api.get_account_history",
        [username, pageParam, limit, ...filterArgs]
      );

      return response.map(
        (x: any) =>
          ({
            num: x[0],
            type: x[1].op[0],
            timestamp: x[1].timestamp,
            trx_id: x[1].trx_id,
            ...x[1].op[1],
          }) satisfies HiveTransaction
      );
    },
    select: ({ pages, pageParams }) => ({
      pageParams,
      pages: pages.map((page) =>
        page.filter((item) => {
          switch (item.type) {
            case "author_reward":
            case "comment_benefactor_reward":
              const hivePayout = parseAsset(
                (item as AuthorReward).hive_payout
              );
              return hivePayout.amount > 0;
            case "transfer":
            case "transfer_to_savings":
            case "transfer_to_vesting":
            case "recurrent_transfer":
              return parseAsset(item.amount).symbol === "HIVE";

            case "transfer_from_savings" as HiveOperationName:
              return parseAsset((item as any).amount).symbol === "HIVE";

            case "fill_recurrent_transfer":
              const asset = parseAsset(item.amount);
              return ["HIVE"].includes(asset.symbol);

            case "claim_reward_balance":
              const rewardHive = parseAsset(
                (item as ClaimRewardBalance).reward_hive
              );
              return rewardHive.amount > 0;

            case "curation_reward":
            case "cancel_transfer_from_savings":
            case "fill_order":
            case "limit_order_create":
            case "limit_order_cancel":
            case "fill_convert_request":
            case "fill_collateralized_convert_request":
              return true;

            case "limit_order_create2" as HiveOperationName:
              return true;
            default:
              // Keep an operation the caller asked for by name. Without this the
              // filter UI advertises every operation while this switch silently
              // discards the ones it has no opinion about, so picking e.g.
              // `fill_transfer_from_savings` returns an empty list. Requests that
              // pass no filter still fall through to `false`, so the unfiltered
              // HIVE view is unchanged.
              return requestedOperations.has(item.type);
          }
        })
      ),
    }),
  });
}
