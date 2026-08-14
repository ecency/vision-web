import {
  RC_RESOURCE_NAMES,
  type RcCostBreakdown,
  type RcResourceName,
  type RcResourceParams
} from "../types/resource-params";
import type { RcStats } from "../types/stats";
import { computeResourceCost } from "./estimate-comment-rc-cost";

export type RcResourceUsage = Record<RcResourceName, number>;

export interface RcPricedUsage {
  cost: number;
  breakdown: RcCostBreakdown[];
}

/**
 * Turns per-resource usage into an RC cost.
 *
 * This is the single pricing path. Every RC figure the app shows, the publish
 * warning, the comment warning, the vote warning and the credits tooltip, goes
 * through here, so they cannot disagree with each other or with the chain.
 */
export function priceRcUsage(
  usage: RcResourceUsage,
  rcParams: RcResourceParams,
  rcStats: Pick<RcStats, "pool" | "regen" | "share">
): RcPricedUsage {
  const regen = Number(rcStats.regen);
  let cost = 0;
  const breakdown: RcCostBreakdown[] = [];

  RC_RESOURCE_NAMES.forEach((name, index) => {
    const entry = rcParams.resource_params[name];
    const pool = Number(rcStats.pool[index] ?? 0);
    const share = Number(rcStats.share[index] ?? 0);
    if (!entry || share <= 0) {
      return;
    }

    const scaled = usage[name] * Number(entry.resource_dynamics_params.resource_unit ?? 1);
    // rc_stats publishes `share` as weight/divisor scaled to 10,000. Kept in
    // BigInt: regen is ~2.4e12 and the product leaves the safe-integer range.
    const regenShare = Number((BigInt(regen) * BigInt(share)) / 10000n);
    const resourceCost = computeResourceCost(entry.price_curve_params, pool, scaled, regenShare);

    cost += resourceCost;
    breakdown.push({ resource: name, usage: scaled, cost: resourceCost });
  });

  return { cost, breakdown };
}
