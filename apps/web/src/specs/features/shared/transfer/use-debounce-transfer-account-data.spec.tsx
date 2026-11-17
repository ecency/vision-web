import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// #2120: an existing delegation of 1,000 HP or more went through a display
// formatter ("5,000.000") and parsed to NaN, so the dialog showed 0.000 as the
// previous delegation. #2123: the hook pushed "0.001" into the amount on every
// mount, over the caller's amount and over what the user typed before Back.

const h = vi.hoisted(() => ({ delegations: [] as any[] }));

vi.mock("@ecency/sdk", () => ({
  getBadActorsQueryOptions: () => ({ queryKey: ["bad"] }),
  getDynamicPropsQueryOptions: () => ({ queryKey: ["dyn"] }),
  getVestingDelegationsQueryOptions: () => ({ queryKey: ["vd"] }),
  getAccountFullQueryOptions: () => ({ queryKey: ["acc"] })
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: any) =>
    o.queryKey[0] === "dyn"
      ? { data: { hivePerMVests: 500 } }
      : { data: undefined, error: null, isLoading: false },
  useInfiniteQuery: () => ({ data: { pages: [h.delegations] }, error: null, isLoading: false })
}));
vi.mock("@/features/shared", () => ({ error: vi.fn() }));
vi.mock("@/api/format-error", () => ({ formatError: vi.fn(() => [""]) }));
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: { username: "alice" }, account: null })
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<any>("@/utils/formatted-number")),
  ...(await vi.importActual<any>("@/utils/parse-asset")),
  ...(await vi.importActual<any>("@/utils/vesting"))
}));

import { useDebounceTransferAccountData } from "@/features/shared/transfer/use-debounce-transfer-account-data";
import { TransferSharedStateContext } from "@/features/shared/transfer/transfer-shared-state";

function run(mode: string, amount: string) {
  const setAmount = vi.fn();
  const wrapper = ({ children }: any) => (
    <TransferSharedStateContext.Provider value={{ to: "ecency", mode, amount, setAmount, setTo: vi.fn() } as any}>
      {children}
    </TransferSharedStateContext.Provider>
  );
  const { result } = renderHook(() => useDebounceTransferAccountData(), { wrapper });
  return { setAmount, result };
}

describe("useDebounceTransferAccountData", () => {
  it("reads a 500 HP delegation", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "1000000.000000 VESTS" }];
    const { result, setAmount } = run("delegate", "0.000");
    expect(result.current.delegatedAmount).toBe(500);
    expect(setAmount).toHaveBeenCalledWith("500");
  });

  it("reads a delegation of 1,000 HP or more as a number, not NaN (#2120)", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "10000000.000000 VESTS" }];
    const { result, setAmount } = run("delegate", "0.000");
    expect(result.current.delegatedAmount).toBe(5000);
    expect(setAmount).toHaveBeenCalledWith("5000");
  });

  it("does not replace an amount the user typed with the existing delegation (#2123)", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "10000000.000000 VESTS" }];
    const { setAmount } = run("delegate", "120.000");
    expect(setAmount).not.toHaveBeenCalled();
  });

  it("fills the existing delegation over the dialog's default amount", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "10000000.000000 VESTS" }];
    const { setAmount } = run("delegate", "0.001");
    expect(setAmount).toHaveBeenCalledWith("5000");
  });

  it("keeps the amount it was given when there is no delegation (#2123)", () => {
    h.delegations = [];
    const { setAmount } = run("transfer", "100.000");
    expect(setAmount).not.toHaveBeenCalledWith("0.001");
  });

  it("keeps a typed amount in delegate mode without an existing delegation (#2123)", () => {
    h.delegations = [];
    const { setAmount } = run("delegate", "50.000");
    expect(setAmount).not.toHaveBeenCalled();
  });
});
