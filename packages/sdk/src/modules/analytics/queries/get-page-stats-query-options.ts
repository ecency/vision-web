import { queryOptions } from "@tanstack/react-query";
import { CONFIG } from "@/modules/core";
import { PageStatsResponse } from "../types";

/**
 * Get page statistics from the private analytics API
 *
 * @param url - URL to get stats for
 * @param dimensions - Dimensions to query (default: [])
 * @param metrics - Metrics to query (default: ["visitors", "pageviews", "visit_duration"])
 * @param dateRange - Date range for the query: "day", "7d", "30d", "month", "6mo" or "12mo"
 *   (the default); /api/stats rejects anything else, "all" included
 */
export function getPageStatsQueryOptions(
  url: string,
  dimensions: string[] = [],
  metrics: string[] = ["visitors", "pageviews", "visit_duration"],
  dateRange?: string
) {
  // Sort arrays to ensure stable query keys regardless of input order
  const sortedDimensions = [...dimensions].sort();
  const sortedMetrics = [...metrics].sort();

  return queryOptions({
    queryKey: ["analytics", "page-stats", url, sortedDimensions, sortedMetrics, dateRange],
    queryFn: async ({ signal }) => {
      const response = await fetch(CONFIG.privateApiHost + "/api/stats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metrics,
          url: encodeURIComponent(url),
          dimensions,
          date_range: dateRange,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch page stats: ${response.status}`);
      }

      return response.json() as Promise<PageStatsResponse>;
    },
    enabled: !!url,
    // Analytics data should always be fresh - users expect current stats when changing range
    staleTime: 0,
  });
}
