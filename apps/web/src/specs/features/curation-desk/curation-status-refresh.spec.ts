import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@ecency/sdk", async () => ({ ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")) }));

import { QueryKeys } from "@ecency/sdk";
import { refreshCurationStatus } from "@/features/curation-desk/curation-status-refresh";

/**
 * The gateway memoizes status for up to 15 s, so a read right after a write can
 * still carry the old counts. One more read after that window settles them.
 */
describe("refreshCurationStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads status now and once more after the memo window, once for a run of writes", () => {
    vi.useFakeTimers();
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    refreshCurationStatus(client);
    refreshCurationStatus(client);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: QueryKeys.curation.status() });

    vi.advanceTimersByTime(15_000);
    expect(invalidate).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1_000);
    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: QueryKeys.curation.status() });

    vi.advanceTimersByTime(60_000);
    expect(invalidate).toHaveBeenCalledTimes(3);
  });
});
