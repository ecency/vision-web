import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// #2120: an existing delegation of 1,000 HP or more went through a display
// formatter ("5,000.000") and parsed to NaN, so the dialog showed 0.000 as the
// previous delegation. #2123: the hook pushed "0.001" into the amount on every
// mount, over the caller's amount and over what the user typed before Back.

const h = vi.hoisted(() => ({ delegations: [] as any[], delegationsLoaded: true }));

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
  useInfiniteQuery: () =>
    h.delegationsLoaded
      ? { data: { pages: [h.delegations] }, error: null, isLoading: false, isSuccess: true }
      : { data: undefined, error: null, isLoading: true, isSuccess: false }
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

  it("lets the user clear the field or type a 0 after the fill: no second fill", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "10000000.000000 VESTS" }];
    const setAmount = vi.fn();
    const state = { amount: "0.001" };
    const wrapper = ({ children }: any) => (
      <TransferSharedStateContext.Provider
        value={{ to: "ecency", mode: "delegate", amount: state.amount, setAmount, setTo: vi.fn() } as any}
      >
        {children}
      </TransferSharedStateContext.Provider>
    );
    const { rerender } = renderHook(() => useDebounceTransferAccountData(), { wrapper });
    expect(setAmount).toHaveBeenCalledTimes(1);
    for (const typed of ["5000", "", "0", "0.5"]) {
      state.amount = typed;
      rerender();
    }
    expect(setAmount).toHaveBeenCalledTimes(1);
  });

  it("does not carry one recipient's filled delegation to another", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "10000000.000000 VESTS" }];
    const setAmount = vi.fn((v: string) => (state.amount = v));
    const state = { amount: "0.001", to: "ecency" };
    const wrapper = ({ children }: any) => (
      <TransferSharedStateContext.Provider
        value={{ to: state.to, mode: "delegate", amount: state.amount, setAmount, setTo: vi.fn() } as any}
      >
        {children}
      </TransferSharedStateContext.Provider>
    );
    const { rerender } = renderHook(() => useDebounceTransferAccountData(), { wrapper });
    expect(state.amount).toBe("5000");
    h.delegations = [{ delegator: "alice", delegatee: "bob", vesting_shares: "400000.000000 VESTS" }];
    state.to = "bob";
    rerender();
    expect(state.amount).toBe("200");
    h.delegations = [];
    state.to = "carol";
    rerender();
    expect(state.amount).toBe("0.001");
  });

  it("remembers its own fill across Next and Back (step 1 unmounts)", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "10000000.000000 VESTS" }];
    const state: any = { amount: "0.001", to: "ecency", autoFilledAmount: null };
    const setAmount = vi.fn((v: string) => (state.amount = v));
    const setAutoFilledAmount = vi.fn((v: string | null) => (state.autoFilledAmount = v));
    const wrapper = ({ children }: any) => (
      <TransferSharedStateContext.Provider
        value={{ ...state, mode: "delegate", setAmount, setAutoFilledAmount, setTo: vi.fn() } as any}
      >
        {children}
      </TransferSharedStateContext.Provider>
    );
    renderHook(() => useDebounceTransferAccountData(), { wrapper }).unmount();
    expect(state.amount).toBe("5000");
    // Next writes the amount with 3 decimals; it is still the filled value.
    state.amount = "5000.000";
    // Back, then another recipient with a delegation of its own.
    h.delegations = [{ delegator: "alice", delegatee: "bob", vesting_shares: "400000.000000 VESTS" }];
    state.to = "bob";
    renderHook(() => useDebounceTransferAccountData(), { wrapper });
    expect(state.amount).toBe("200");
  });

  it("keeps a 0.001 the user typed: an edit, not the dialog's default", () => {
    h.delegations = [{ delegator: "alice", delegatee: "ecency", vesting_shares: "10000000.000000 VESTS" }];
    const setAmount = vi.fn();
    const wrapper = ({ children }: any) => (
      <TransferSharedStateContext.Provider
        value={{ to: "ecency", mode: "delegate", amount: "0.001", amountEdited: true, autoFilledAmount: null, setAutoFilledAmount: vi.fn(), setAmount, setTo: vi.fn() } as any}
      >
        {children}
      </TransferSharedStateContext.Provider>
    );
    renderHook(() => useDebounceTransferAccountData(), { wrapper });
    expect(setAmount).not.toHaveBeenCalled();
  });

  it("keeps a typed amount equal to the earlier fill when the next recipient has no delegation", () => {
    h.delegations = [];
    const setAmount = vi.fn();
    const wrapper = ({ children }: any) => (
      <TransferSharedStateContext.Provider
        value={{ to: "bob", mode: "delegate", amount: "5000", amountEdited: true, autoFilledAmount: "5000", setAutoFilledAmount: vi.fn(), setAmount, setTo: vi.fn() } as any}
      >
        {children}
      </TransferSharedStateContext.Provider>
    );
    renderHook(() => useDebounceTransferAccountData(), { wrapper });
    expect(setAmount).not.toHaveBeenCalled();
  });

  it("keeps a filled delegation while the delegation list has not loaded", () => {
    h.delegations = [];
    h.delegationsLoaded = false;
    const setAmount = vi.fn();
    const wrapper = ({ children }: any) => (
      <TransferSharedStateContext.Provider
        value={{ to: "ecency", mode: "delegate", amount: "5000.000", autoFilledAmount: "5000", setAutoFilledAmount: vi.fn(), setAmount, setTo: vi.fn() } as any}
      >
        {children}
      </TransferSharedStateContext.Provider>
    );
    renderHook(() => useDebounceTransferAccountData(), { wrapper });
    expect(setAmount).not.toHaveBeenCalled();
    h.delegationsLoaded = true;
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
