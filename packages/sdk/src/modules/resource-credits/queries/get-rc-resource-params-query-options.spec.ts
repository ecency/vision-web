import { describe, expect, it } from "vitest";
import { getRcResourceParamsQueryOptions } from "./get-rc-resource-params-query-options";
import { QueryKeys } from "@/modules/core";

describe("getRcResourceParamsQueryOptions", () => {
  const options = getRcResourceParamsQueryOptions();

  it("uses the shared query key rather than a literal", () => {
    expect(options.queryKey).toEqual(QueryKeys.resourceCredits.resourceParams());
  });

  /**
   * Regression: gcTime and staleTime were both Infinity. Infinite gcTime is
   * correct, it is the one value that schedules no timer and so cannot hold a
   * request's cache open on the server. Infinite staleTime is not: a
   * long-lived session would keep pricing RC with pre-hardfork coefficients
   * indefinitely, and a wrong estimate here tells someone a post is affordable
   * when the chain will reject it.
   */
  it("schedules no gc timer, so it cannot pin a server request's cache", () => {
    expect(options.gcTime).toBe(Infinity);
  });

  it("keeps a bounded staleTime so hardfork changes are picked up", () => {
    expect(Number.isFinite(options.staleTime)).toBe(true);
    expect(options.staleTime).toBeGreaterThan(0);
  });

  it("does not refetch so often that it is chatty", () => {
    // Params change at a hardfork, so a day is the intent, not minutes.
    expect(options.staleTime).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });
});
