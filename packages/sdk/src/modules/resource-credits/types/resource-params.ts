/** Shape returned by `rc_api.get_resource_params`. Numbers arrive as strings. */
export interface RcPriceCurveParams {
  coeff_a: string | number;
  coeff_b: string | number;
  shift: string | number;
}

export interface RcResourceDynamicsParams {
  resource_unit: string | number;
  budget_per_time_unit: string | number;
  pool_eq: string | number;
  max_pool_size: string | number;
}

export interface RcResourceParamEntry {
  resource_dynamics_params: RcResourceDynamicsParams;
  price_curve_params: RcPriceCurveParams;
}

/**
 * Per-operation and per-transaction sizing constants. Only the members this
 * module needs are declared; the node returns many more.
 */
export interface RcSizeInfo {
  resource_state_bytes: {
    comment_base_size: number;
    comment_permlink_char_size: number;
    transaction_base_size: number;
    [key: string]: number;
  };
  resource_execution_time: {
    comment_time: number;
    transaction_time: number;
    verify_authority_time: number;
    [key: string]: number;
  };
  [key: string]: Record<string, number>;
}

export interface RcResourceParams {
  resource_params: Record<string, RcResourceParamEntry>;
  size_info: RcSizeInfo;
}

/**
 * Resource order is consensus-defined (`HIVE_RC_NUM_RESOURCE_TYPES`) and the
 * `pool`, `share` and `budget` arrays in rc_stats are indexed by it.
 */
export const RC_RESOURCE_NAMES = [
  "resource_history_bytes",
  "resource_new_accounts",
  "resource_market_bytes",
  "resource_state_bytes",
  "resource_execution_time"
] as const;

export type RcResourceName = (typeof RC_RESOURCE_NAMES)[number];

export interface RcCostBreakdown {
  resource: RcResourceName;
  usage: number;
  cost: number;
}
