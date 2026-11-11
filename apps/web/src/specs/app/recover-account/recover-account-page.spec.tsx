import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@/specs/test-utils";

const h = vi.hoisted(() => ({
  flag: true,
  notFound: vi.fn(() => "not-found" as unknown as never),
  download: vi.fn(),
  turnstileReset: vi.fn(),
  turnstileProps: [] as Record<string, unknown>[],
  oldKey: { tag: "old-owner-key" },
  newKeys: {
    owner: { tag: "new-owner" },
    active: { tag: "new-active" },
    posting: { tag: "new-posting" },
    memo: { tag: "new-memo" },
    publicKeys: {
      owner: "STM_NEW_OWNER",
      active: "STM_NEW_ACTIVE",
      posting: "STM_NEW_POSTING",
      memo: "STM_NEW_MEMO"
    }
  }
}));

vi.mock("i18next", () => ({
  __esModule: true,
  default: {
    t: vi.fn((key: string, opts?: Record<string, unknown>) =>
      opts && Object.keys(opts).length ? `${key}:${JSON.stringify(opts)}` : key
    ),
    language: "en-US"
  }
}));

vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (condition: (config: unknown) => unknown) =>
      condition({ visionFeatures: { accountRecovery: { enabled: h.flag } } }),
    useConfig: (condition: (config: unknown) => unknown) =>
      condition({ visionFeatures: { accountRecovery: { enabled: h.flag } } })
  }
}));
vi.mock("next/navigation", () => ({ notFound: () => h.notFound() }));
vi.mock("@/features/metadata", () => ({
  PagesMetadataGenerator: { getForPage: vi.fn(async () => ({})) }
}));
vi.mock("@/features/shared/turnstile", async () => {
  const ReactMod = await import("react");
  return {
    TURNSTILE_SITEKEY: "site-key",
    Turnstile: ReactMod.forwardRef(function FakeTurnstile(props: TurnstileProps, ref) {
      h.turnstileProps.push(props);
      ReactMod.useImperativeHandle(ref, () => ({ reset: h.turnstileReset }));
      return (
        <button type="button" onClick={() => props.onVerify("captcha-token")}>
          fake-captcha
        </button>
      );
    })
  };
});
vi.mock("@/features/wallet/hooks/use-download-keys", () => ({
  useDownloadKeys: () => h.download
}));
vi.mock("@/utils/master-password", () => ({
  generateMasterPassword: () => "P5NEWMASTERPASSWORD"
}));
vi.mock("@/features/account-recovery/recovery-keys", () => ({
  deriveRecoveryKeys: vi.fn(() => h.newKeys)
}));
vi.mock("@/features/account-recovery/recovery-key-match", () => ({
  matchOldOwnerKey: vi.fn()
}));
vi.mock("@/features/account-recovery/recovery-chain", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/features/account-recovery/recovery-chain")),
  loadRecoveryChainState: vi.fn(),
  loadRecentPostingAuthAdds: vi.fn(),
  loadCleanupItems: vi.fn(),
  submitRecoverAccount: vi.fn(),
  submitReplaceKeys: vi.fn(),
  submitCleanupItems: vi.fn(),
  verifyRecoveredKeys: vi.fn()
}));

import type {
  Authority,
  Operation,
  OwnerHistoryEntry,
  PostRecoveryCleanupItem,
  PrivateKey
} from "@ecency/sdk";
import type { Turnstile } from "@/features/shared/turnstile";
import type { RecoveryAccount, RecoveryChainState } from "@/features/account-recovery/recovery-chain";
import {
  recoveryComplete,
  recoveryProve,
  recoveryStart,
  recoveryStatus,
  recoveryVerifyCode,
  signRecoveryChallenge
} from "@ecency/sdk";
import { matchOldOwnerKey } from "@/features/account-recovery/recovery-key-match";
import {
  loadCleanupItems,
  loadRecentPostingAuthAdds,
  loadRecoveryChainState,
  submitCleanupItems,
  submitRecoverAccount,
  submitReplaceKeys,
  verifyRecoveredKeys
} from "@/features/account-recovery/recovery-chain";
import { parseChainTime } from "@/features/account-recovery/recovery-eligibility";
import RecoverAccountRoute from "@/app/recover-account/page";
import { RecoverAccountPage } from "@/app/recover-account/_page";

type TurnstileProps = React.ComponentPropsWithoutRef<typeof Turnstile>;

const HEAD = Date.parse("2026-11-10T12:00:00Z");
const oldKey = h.oldKey as unknown as PrivateKey;
const recentOwnerAuthority: Authority = {
  weight_threshold: 1,
  account_auths: [],
  key_auths: [["STM_OLD", 1]]
};
const historyEntry: OwnerHistoryEntry = {
  id: 1,
  account: "alice",
  previous_owner_authority: recentOwnerAuthority,
  last_valid_time: "2026-11-09T00:00:00"
};
const auth = (keys: string[], accounts: string[] = []): Authority => ({
  weight_threshold: 1,
  account_auths: accounts.map((a) => [a, 1] as [string, number]),
  key_auths: keys.map((k) => [k, 1] as [string, number])
});
const account: RecoveryAccount = {
  name: "alice",
  owner: auth(["STM_PREV_OWNER"]),
  active: auth(["STM_PREV_ACTIVE"]),
  posting: auth(["STM_PREV_POSTING"], ["ecency.app", "late.app"]),
  memo_key: "STM_PREV_MEMO",
  json_metadata: "{}",
  last_owner_update: "2026-11-10T10:00:00",
  previous_owner_update: "2026-11-01T00:00:00",
  last_account_recovery: "1970-01-01T00:00:00",
  recovery_account: "ecency",
  vesting_withdraw_rate: "0.000000 VESTS"
};
const chainState: RecoveryChainState = {
  account,
  ownerHistory: [historyEntry],
  lastRecoveryTime: null,
  headTime: HEAD
};
/** Account right after tx1: owner is the new key, the previous change was long ago. */
const afterTx1: RecoveryChainState = {
  ...chainState,
  account: {
    ...account,
    owner: auth(["STM_NEW_OWNER"]),
    previous_owner_update: account.last_owner_update,
    last_owner_update: "2026-11-10T12:00:00"
  },
  headTime: HEAD + 60 * 1000
};
const allReplaced: RecoveryChainState = {
  ...afterTx1,
  account: {
    ...afterTx1.account,
    active: auth(["STM_NEW_ACTIVE"]),
    posting: auth(["STM_NEW_POSTING"], ["ecency.app"]),
    memo_key: "STM_NEW_MEMO"
  }
};
const cleanupItem: PostRecoveryCleanupItem = {
  id: "power-down",
  kind: "power-down",
  op: ["withdraw_vesting", { account: "alice", vesting_shares: "0.000000 VESTS" }] as Operation
};
const confirmation = (id: string) => ({ id, block_num: 1, trx_num: 0, expired: false });

/** Chain reads follow what has been broadcast so far, unless a test overrides them. */
const chain = vi.hoisted(() => ({ next: null as null | (() => unknown), keysLanded: false }));

function setDefaults() {
  vi.mocked(recoveryStart).mockResolvedValue({
    status: 200,
    data: { request_id: "r1", nonce: "n1" }
  });
  vi.mocked(recoveryProve).mockResolvedValue({
    status: 200,
    data: { emails: ["a****e@example.com"] }
  });
  vi.mocked(recoveryVerifyCode).mockResolvedValue({
    status: 200,
    data: { status: "approved" }
  });
  vi.mocked(recoveryStatus).mockResolvedValue({
    status: 200,
    data: { status: "requested", tx_id: "tx0" }
  });
  vi.mocked(recoveryComplete).mockResolvedValue({
    status: 200,
    data: { status: "completed" }
  });
  vi.mocked(signRecoveryChallenge).mockReturnValue("ab".repeat(65));
  vi.mocked(matchOldOwnerKey).mockReturnValue({
    status: "match",
    key: oldKey,
    publicKey: "STM_OLD",
    entry: historyEntry
  });
  chain.next = null;
  chain.keysLanded = false;
  vi.mocked(loadRecoveryChainState).mockImplementation(async () => {
    if (chain.next) return chain.next() as RecoveryChainState;
    if (chain.keysLanded) return allReplaced;
    return vi.mocked(submitRecoverAccount).mock.calls.length ? afterTx1 : chainState;
  });
  vi.mocked(loadRecentPostingAuthAdds).mockResolvedValue(new Map([["late.app", "2026-11-09T02:00:00"]]));
  vi.mocked(loadCleanupItems).mockResolvedValue([cleanupItem]);
  vi.mocked(submitRecoverAccount).mockResolvedValue(confirmation("tx1"));
  vi.mocked(submitReplaceKeys).mockImplementation(async () => {
    chain.keysLanded = true;
    return confirmation("tx2");
  });
  vi.mocked(submitCleanupItems).mockResolvedValue([{ id: "power-down", ok: true }]);
  vi.mocked(verifyRecoveredKeys).mockResolvedValue(true);
}

function click(text: string) {
  fireEvent.click(screen.getByText(text));
}

async function passStart(username = "alice") {
  fireEvent.change(screen.getByPlaceholderText("recover-account.start.username-placeholder"), {
    target: { value: username }
  });
  click("fake-captcha");
  await waitFor(() => expect(screen.getByRole("button", { name: "recover-account.start.submit" })).not.toBeDisabled());
  click("recover-account.start.submit");
}

async function passPassword() {
  await screen.findByText("P5NEWMASTERPASSWORD");
  click("recover-account.password.download");
  fireEvent.click(screen.getByLabelText("recover-account.password.saved-confirm"));
  click("recover-account.password.continue");
}

async function passOldKey(input = "my old password") {
  const field = await screen.findByPlaceholderText("recover-account.old-key.placeholder");
  await waitFor(() => expect(loadRecoveryChainState).toHaveBeenCalled());
  fireEvent.change(field, { target: { value: input } });
  await waitFor(() => expect(screen.getByRole("button", { name: "recover-account.old-key.submit" })).not.toBeDisabled());
  click("recover-account.old-key.submit");
}

async function passCode(code = "123456") {
  const field = await screen.findByPlaceholderText("recover-account.code.placeholder");
  fireEvent.change(field, { target: { value: code } });
  click("recover-account.code.submit");
}

async function reachFinish() {
  const view = renderWithQueryClient(<RecoverAccountPage />);
  await passStart();
  await passPassword();
  await passOldKey();
  await passCode();
  return view;
}

const replaceButton = () => screen.findByRole("button", { name: "recover-account.finish.submit" });

describe("recover-account page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.flag = true;
    h.turnstileProps = [];
    setDefaults();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers notFound while the feature flag is off", () => {
    h.flag = false;
    RecoverAccountRoute();
    expect(h.notFound).toHaveBeenCalled();
  });

  it("renders the page while the flag is on", () => {
    const result = RecoverAccountRoute();
    expect(h.notFound).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });

  it("renders Turnstile with the recover action", () => {
    renderWithQueryClient(<RecoverAccountPage />);
    expect(h.turnstileProps.at(-1)?.action).toBe("recover");
  });

  it("walks the whole flow and never sends a password or private key", async () => {
    renderWithQueryClient(<RecoverAccountPage />);

    await passStart("Alice ");
    await waitFor(() => expect(recoveryStart).toHaveBeenCalledWith("alice", "captcha-token"));

    await passPassword();
    expect(h.download).toHaveBeenCalled();

    await passOldKey("my old password");
    await waitFor(() => expect(recoveryProve).toHaveBeenCalled());
    expect(matchOldOwnerKey).toHaveBeenCalledWith(
      "alice",
      "my old password",
      chainState.ownerHistory,
      expect.objectContaining({ lastRecoveryTime: null })
    );
    expect(signRecoveryChallenge).toHaveBeenCalledWith(h.oldKey, "alice", "STM_NEW_OWNER", "n1");
    expect(recoveryProve).toHaveBeenCalledWith({
      requestId: "r1",
      username: "alice",
      newOwnerPub: "STM_NEW_OWNER",
      provenKeyPub: "STM_OLD",
      signature: "ab".repeat(65)
    });

    expect(await screen.findByText("a****e@example.com")).toBeInTheDocument();
    await passCode("123456");
    await waitFor(() => expect(recoveryVerifyCode).toHaveBeenCalledWith("r1", "123456"));

    await waitFor(() => expect(recoveryStatus).toHaveBeenCalledWith("r1"));

    // tx1 goes out as soon as the request is on chain, without waiting for a click.
    await waitFor(() =>
      expect(submitRecoverAccount).toHaveBeenCalledWith({
        username: "alice",
        oldKey: h.oldKey,
        newOwnerKey: h.newKeys.owner,
        newOwnerPublicKey: "STM_NEW_OWNER",
        recentOwnerAuthority
      })
    );

    // Account authorities: the one set after the takeover starts unticked and is flagged.
    const kept = await screen.findByLabelText(/auths-role.*ecency\.app/);
    const late = screen.getByLabelText(/auths-role.*late\.app/);
    expect(kept).toBeChecked();
    expect(late).not.toBeChecked();
    expect(screen.getByText("recover-account.finish.auths-flagged")).toBeInTheDocument();
    expect(loadRecentPostingAuthAdds).toHaveBeenCalledWith("alice", historyEntry.last_valid_time);

    fireEvent.click(await replaceButton());
    await waitFor(() => expect(submitReplaceKeys).toHaveBeenCalled());
    expect(submitReplaceKeys).toHaveBeenCalledWith({
      username: "alice",
      newKeys: h.newKeys,
      keepAccountAuths: { active: [], posting: ["ecency.app"] }
    });

    // complete goes out once the keys are verified, before the optional clean-up.
    await waitFor(() => expect(recoveryComplete).toHaveBeenCalledWith("r1"));
    expect(verifyRecoveredKeys).toHaveBeenCalledWith("alice", h.newKeys.publicKeys);
    expect(vi.mocked(verifyRecoveredKeys).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(recoveryComplete).mock.invocationCallOrder[0]
    );

    const checkbox = await screen.findByLabelText(/recover-account\.cleanup\.items\.power-down/);
    expect(checkbox).toBeChecked();
    expect(submitCleanupItems).not.toHaveBeenCalled();
    click("recover-account.cleanup.apply");
    await waitFor(() =>
      expect(submitCleanupItems).toHaveBeenCalledWith("alice", [cleanupItem], h.newKeys.active)
    );

    expect(await screen.findByText("recover-account.success.title")).toBeInTheDocument();

    const sent = JSON.stringify([
      vi.mocked(recoveryStart).mock.calls,
      vi.mocked(recoveryProve).mock.calls,
      vi.mocked(recoveryVerifyCode).mock.calls,
      vi.mocked(recoveryStatus).mock.calls,
      vi.mocked(recoveryComplete).mock.calls
    ]);
    expect(sent).not.toContain("my old password");
    expect(sent).not.toContain("P5NEWMASTERPASSWORD");
  });

  it("does not let the user continue before the key file is saved and confirmed", async () => {
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await screen.findByText("P5NEWMASTERPASSWORD");
    expect(screen.getByRole("button", { name: "recover-account.password.continue" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("recover-account.password.saved-confirm"));
    expect(screen.getByRole("button", { name: "recover-account.password.continue" })).toBeDisabled();
    click("recover-account.password.download");
    expect(screen.getByRole("button", { name: "recover-account.password.continue" })).not.toBeDisabled();
  });

  it("shows rate_limited, stays on the first step and resets the captcha", async () => {
    vi.mocked(recoveryStart).mockResolvedValueOnce({
      status: 429,
      data: { error: "rate_limited" }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    expect(await screen.findByText("recover-account.errors.rate_limited")).toBeInTheDocument();
    expect(h.turnstileReset).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "recover-account.start.submit" })).toBeDisabled();
  });

  it("offers a retry when the service is unavailable", async () => {
    vi.mocked(recoveryStart).mockResolvedValueOnce({
      status: 503,
      data: { error: "unavailable" }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    expect(await screen.findByText("recover-account.errors.unavailable")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("recover-account.start.username-placeholder")).toBeInTheDocument();
  });

  it.each(["not_ecency_recovery", "no_email", "no_recent_owner_change"])(
    "sends %s to the manual help screen",
    async (code) => {
      vi.mocked(recoveryStart).mockResolvedValueOnce({ status: 422, data: { error: code } });
      renderWithQueryClient(<RecoverAccountPage />);
      await passStart();
      expect(await screen.findByText("recover-account.manual.title")).toBeInTheDocument();
      expect(screen.getByText(`recover-account.errors.${code}`)).toBeInTheDocument();
    }
  );

  it("says so locally when the old key does not match and sends nothing", async () => {
    vi.mocked(matchOldOwnerKey).mockReturnValue({ status: "no-match" });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey("nope");
    expect(await screen.findByText("recover-account.old-key.no-match")).toBeInTheDocument();
    expect(recoveryProve).not.toHaveBeenCalled();
  });

  it("shows invalid_request from prove", async () => {
    vi.mocked(recoveryProve).mockResolvedValueOnce({
      status: 400,
      data: { error: "invalid_request" }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    expect(await screen.findByText("recover-account.errors.invalid_request")).toBeInTheDocument();
  });

  it("sends no_email at prove to the manual help screen", async () => {
    vi.mocked(recoveryProve).mockResolvedValueOnce({
      status: 422,
      data: { error: "no_email" }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    expect(await screen.findByText("recover-account.manual.title")).toBeInTheDocument();
  });

  it("shows invalid_code with the attempts left", async () => {
    vi.mocked(recoveryVerifyCode).mockResolvedValueOnce({
      status: 400,
      data: { error: "invalid_code", attempts_left: 3 }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    await passCode("000000");
    expect(await screen.findByText("recover-account.errors.invalid_code")).toBeInTheDocument();
    expect(screen.getByText('recover-account.code.attempts-left:{"count":3}')).toBeInTheDocument();
    expect(screen.getByPlaceholderText("recover-account.code.placeholder")).toBeInTheDocument();
  });

  it("locks the code step after too_many_attempts", async () => {
    vi.mocked(recoveryVerifyCode).mockResolvedValueOnce({
      status: 429,
      data: { error: "too_many_attempts" }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    await passCode("000000");
    expect(await screen.findByText("recover-account.errors.too_many_attempts")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("recover-account.code.placeholder")).toBeNull();
  });

  it("waits before tx1 while the last recovery is less than an hour old", async () => {
    chain.next = () => ({
      ...chainState,
      account: { ...account, last_account_recovery: "2026-11-10T11:30:00" }
    });
    await reachFinish();
    expect(await screen.findByText(/recover-account\.finish\.recovery-wait/)).toBeInTheDocument();
    expect(submitRecoverAccount).not.toHaveBeenCalled();
  });

  it("does not wait for recent owner changes before tx1", async () => {
    chain.next = () =>
      vi.mocked(submitRecoverAccount).mock.calls.length
        ? afterTx1
        : { ...chainState, account: { ...account, last_owner_update: "2026-11-10T11:59:00" } };
    await reachFinish();
    await waitFor(() => expect(submitRecoverAccount).toHaveBeenCalled());
  });

  it("stops before tx1 when the proven key is about to leave the 30 day window", async () => {
    vi.mocked(matchOldOwnerKey).mockReturnValue({
      status: "match",
      key: oldKey,
      publicKey: "STM_OLD",
      entry: { ...historyEntry, last_valid_time: "2026-10-11T12:05:00" }
    });
    await reachFinish();
    expect(await screen.findByText("recover-account.manual.title")).toBeInTheDocument();
    expect(screen.getByText("recover-account.errors.key_not_recent")).toBeInTheDocument();
    expect(submitRecoverAccount).not.toHaveBeenCalled();
  });

  it("holds tx2 until the owner change limit lifts, then sends it by itself", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const locked = {
      ...afterTx1,
      account: { ...afterTx1.account, previous_owner_update: "2026-11-10T11:10:00" }
    };
    chain.next = () => (vi.mocked(submitRecoverAccount).mock.calls.length ? locked : chainState);
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText(/recover-account\.finish\.keys-wait/)).toBeInTheDocument();
    expect(submitReplaceKeys).not.toHaveBeenCalled();

    chain.next = () => afterTx1;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
    });
    await waitFor(() => expect(submitReplaceKeys).toHaveBeenCalledTimes(1));
  });

  it("re-reads the chain before retrying tx1 and skips it when it already landed", async () => {
    vi.mocked(submitRecoverAccount).mockRejectedValueOnce(new Error("timeout"));
    let landed = false;
    chain.next = () => (landed ? afterTx1 : chainState);
    await reachFinish();
    expect(await screen.findByText("recover-account.finish.recover-failed")).toBeInTheDocument();
    landed = true;
    click("recover-account.finish.retry");
    expect(await replaceButton()).toBeInTheDocument();
    expect(submitRecoverAccount).toHaveBeenCalledTimes(1);
  });

  it("re-reads the chain before retrying tx2 and finishes when the keys already changed", async () => {
    vi.mocked(submitReplaceKeys).mockRejectedValueOnce(new Error("timeout"));
    let landed = false;
    chain.next = () =>
      landed ? allReplaced : vi.mocked(submitRecoverAccount).mock.calls.length ? afterTx1 : chainState;
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.finish.keys-failed")).toBeInTheDocument();
    landed = true;
    click("recover-account.finish.retry");
    await waitFor(() => expect(recoveryComplete).toHaveBeenCalledWith("r1"));
    expect(submitReplaceKeys).toHaveBeenCalledTimes(1);
  });

  it("sends tx2 again on retry when it did not land", async () => {
    vi.mocked(submitReplaceKeys).mockRejectedValueOnce(new Error("boom"));
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.finish.keys-failed")).toBeInTheDocument();
    click("recover-account.finish.retry");
    await waitFor(() => expect(submitReplaceKeys).toHaveBeenCalledTimes(2));
    expect(submitRecoverAccount).toHaveBeenCalledTimes(1);
  });

  it("unticks every posting authority when the account history cannot be read", async () => {
    vi.mocked(loadRecentPostingAuthAdds).mockRejectedValueOnce(new Error("timeout"));
    await reachFinish();
    expect(await screen.findByLabelText(/auths-role.*ecency\.app/)).not.toBeChecked();
    expect(screen.getByLabelText(/auths-role.*late\.app/)).not.toBeChecked();
  });

  it("shows clean-up failures per item and keeps the ones that worked", async () => {
    const second: PostRecoveryCleanupItem = {
      id: "open-order:7",
      kind: "open-order",
      op: ["limit_order_cancel", { owner: "alice", orderid: 7 }] as Operation
    };
    vi.mocked(loadCleanupItems).mockResolvedValueOnce([cleanupItem, second]);
    vi.mocked(submitCleanupItems).mockResolvedValueOnce([
      { id: "power-down", ok: true },
      { id: "open-order:7", ok: false, error: "nope" }
    ]);
    await reachFinish();
    fireEvent.click(await replaceButton());
    click(await screen.findByText("recover-account.cleanup.apply").then((el) => el.textContent!));
    expect(await screen.findByText("recover-account.cleanup.item-failed")).toBeInTheDocument();
    expect(screen.queryByText("recover-account.success.title")).toBeNull();
    click("recover-account.cleanup.apply");
    await waitFor(() => expect(submitCleanupItems).toHaveBeenCalledTimes(2));
    expect(vi.mocked(submitCleanupItems).mock.calls[1][1]).toEqual([second]);
  });

  it("locks the code step when no attempts are left", async () => {
    vi.mocked(recoveryVerifyCode).mockResolvedValueOnce({
      status: 400,
      data: { error: "invalid_code", attempts_left: 0 }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    await passCode("000000");
    expect(await screen.findByText("recover-account.errors.invalid_code")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("recover-account.code.placeholder")).toBeNull();
    expect(screen.getByText("recover-account.start-over")).toBeInTheDocument();
  });

  it("sends a key that cannot sign alone to manual help", async () => {
    vi.mocked(matchOldOwnerKey).mockReturnValue({ status: "not-sufficient" });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    expect(await screen.findByText("recover-account.manual.title")).toBeInTheDocument();
    expect(screen.getByText("recover-account.errors.key_not_sufficient")).toBeInTheDocument();
    expect(recoveryProve).not.toHaveBeenCalled();
  });

  it("explains in_progress when a recovery is already running", async () => {
    vi.mocked(recoveryStart).mockResolvedValueOnce({
      status: 409,
      data: { error: "in_progress" }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    expect(await screen.findByText("recover-account.errors.in_progress")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("recover-account.start.username-placeholder")).toBeInTheDocument();
  });

  it("never offers owner account authorities and leaves active ones unticked", async () => {
    const withAccess = {
      ...chainState,
      account: {
        ...account,
        owner: auth(["STM_PREV_OWNER"], ["owner.friend"]),
        active: auth(["STM_PREV_ACTIVE"], ["active.app"])
      }
    };
    chain.next = () =>
      vi.mocked(submitRecoverAccount).mock.calls.length
        ? { ...withAccess, account: { ...withAccess.account, owner: auth(["STM_NEW_OWNER"]) }, headTime: HEAD + 60000 }
        : withAccess;
    await reachFinish();
    expect(await screen.findByLabelText(/auths-role.*active\.app/)).not.toBeChecked();
    expect(screen.queryByLabelText(/owner\.friend/)).toBeNull();
    expect(screen.getByLabelText(/auths-role.*ecency\.app/)).toBeChecked();
    chain.next = null;
    fireEvent.click(await replaceButton());
    await waitFor(() =>
      expect(submitReplaceKeys).toHaveBeenCalledWith({
        username: "alice",
        newKeys: h.newKeys,
        keepAccountAuths: { active: [], posting: ["ecency.app"] }
      })
    );
  });

  it("does not offer account authorities for a role whose threshold is above the key weight limit", async () => {
    const withAccess = {
      ...chainState,
      account: {
        ...account,
        active: { ...auth(["STM_PREV_ACTIVE"], ["active.app"]), weight_threshold: 70000 }
      }
    };
    chain.next = () =>
      vi.mocked(submitRecoverAccount).mock.calls.length
        ? { ...withAccess, account: { ...withAccess.account, owner: auth(["STM_NEW_OWNER"]) }, headTime: HEAD + 60000 }
        : withAccess;
    await reachFinish();
    expect(await screen.findByLabelText(/auths-role.*ecency\.app/)).toBeChecked();
    expect(screen.queryByLabelText(/active\.app/)).toBeNull();
  });

  it("stays on the finish step when the new keys cannot be verified, and retries", async () => {
    vi.mocked(verifyRecoveredKeys).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("x"));
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.finish.verify-failed")).toBeInTheDocument();
    expect(recoveryComplete).not.toHaveBeenCalled();
    expect(screen.queryByText("recover-account.cleanup.title")).toBeNull();

    click("recover-account.finish.retry");
    await waitFor(() => expect(verifyRecoveredKeys).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("recover-account.finish.verify-failed")).toBeInTheDocument();
    expect(recoveryComplete).not.toHaveBeenCalled();

    click("recover-account.finish.retry");
    expect(await screen.findByText("recover-account.cleanup.title")).toBeInTheDocument();
    expect(recoveryComplete).toHaveBeenCalledWith("r1");
    // tx2 already landed: the retries only re-read the chain.
    expect(submitReplaceKeys).toHaveBeenCalledTimes(1);
  });

  it("moves on to clean-up without waiting for the completion record", async () => {
    vi.mocked(recoveryComplete).mockReturnValue(new Promise(() => {}));
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.cleanup.title")).toBeInTheDocument();
    expect(recoveryComplete).toHaveBeenCalledWith("r1");
  });

  it("ignores a failed completion record", async () => {
    vi.mocked(recoveryComplete).mockRejectedValue(new Error("offline"));
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.cleanup.title")).toBeInTheDocument();
  });

  it("shows the success screen without the clean-up step when nothing is found", async () => {
    vi.mocked(loadCleanupItems).mockResolvedValueOnce([]);
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.success.title")).toBeInTheDocument();
    expect(screen.getByText("recover-account.success.verified")).toBeInTheDocument();
  });

  it("offers retry and skip when the clean-up items cannot be read", async () => {
    vi.mocked(loadCleanupItems).mockRejectedValueOnce(new Error("timeout"));
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.cleanup.load-failed")).toBeInTheDocument();
    expect(screen.queryByText("recover-account.success.title")).toBeNull();

    click("recover-account.retry");
    expect(await screen.findByLabelText(/recover-account\.cleanup\.items\.power-down/)).toBeChecked();
    expect(loadCleanupItems).toHaveBeenCalledTimes(2);
  });

  it("lets the user skip clean-up after a failed read", async () => {
    vi.mocked(loadCleanupItems).mockRejectedValueOnce(new Error("timeout"));
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.cleanup.load-failed")).toBeInTheDocument();
    click("recover-account.cleanup.skip");
    expect(await screen.findByText("recover-account.success.title")).toBeInTheDocument();
    expect(submitCleanupItems).not.toHaveBeenCalled();
  });

  it("stops waiting on an error from the status call and offers to start over", async () => {
    vi.mocked(recoveryStatus).mockResolvedValue({ status: 409, data: { error: "bad_state" } });
    await reachFinish();
    expect(await screen.findByText("recover-account.errors.bad_state")).toBeInTheDocument();
    const calls = vi.mocked(recoveryStatus).mock.calls.length;
    click("recover-account.start-over");
    expect(await screen.findByPlaceholderText("recover-account.start.username-placeholder")).toBeInTheDocument();
    expect(vi.mocked(recoveryStatus).mock.calls.length).toBe(calls);
  });

  it("sends a manual help error from the status call to the manual help screen", async () => {
    vi.mocked(recoveryStatus).mockResolvedValue({ status: 422, data: { error: "key_not_recent" } });
    await reachFinish();
    expect(await screen.findByText("recover-account.manual.title")).toBeInTheDocument();
    expect(screen.getByText("recover-account.errors.key_not_recent")).toBeInTheDocument();
  });

  it("shows a retry after repeated failures to read the status, then resumes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(recoveryStatus).mockResolvedValue({ status: 503, data: { error: "unavailable" } });
    await reachFinish();
    await waitFor(() => expect(recoveryStatus).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });
    expect(await screen.findByText("recover-account.errors.unavailable")).toBeInTheDocument();
    const calls = vi.mocked(recoveryStatus).mock.calls.length;
    expect(calls).toBe(6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });
    expect(vi.mocked(recoveryStatus).mock.calls.length).toBe(calls);

    vi.mocked(recoveryStatus).mockResolvedValue({ status: 200, data: { status: "requested" } });
    click("recover-account.retry");
    await waitFor(() => expect(submitRecoverAccount).toHaveBeenCalled());
  });

  it("keeps waiting through a few failed status reads", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(recoveryStatus)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ status: 502, data: {} })
      .mockResolvedValueOnce({ status: 200, data: { status: "approved" } });
    await reachFinish();
    await waitFor(() => expect(recoveryStatus).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20 * 1000);
    });
    await waitFor(() => expect(submitRecoverAccount).toHaveBeenCalled());
    expect(screen.queryByText("recover-account.errors.unavailable")).toBeNull();
  });

  it("says when a recovery in progress can be started again", async () => {
    const retryAfter = "2026-11-10T13:00:00Z";
    vi.mocked(recoveryStart).mockResolvedValueOnce({
      status: 409,
      data: { error: "in_progress", retry_after: retryAfter }
    });
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    const time = new Date(retryAfter).toLocaleString();
    expect(
      await screen.findByText(`recover-account.errors.in_progress_until:${JSON.stringify({ time })}`)
    ).toBeInTheDocument();
  });

  it("explains a posting authority added shortly before the takeover", async () => {
    const added = "2026-11-08T23:50:00";
    vi.mocked(loadRecentPostingAuthAdds).mockResolvedValue(new Map([["late.app", added]]));
    await reachFinish();
    expect(await screen.findByLabelText(/auths-role.*late\.app/)).not.toBeChecked();
    const date = new Date(parseChainTime(added)).toLocaleString();
    expect(
      screen.getByText(`recover-account.finish.auths-flagged-before:${JSON.stringify({ date })}`)
    ).toBeInTheDocument();
    expect(screen.queryByText("recover-account.finish.auths-flagged")).toBeNull();
  });

  it("continues when tx1 reported an error but the chain shows it landed", async () => {
    vi.mocked(submitRecoverAccount).mockRejectedValueOnce(new Error("timeout"));
    await reachFinish();
    expect(await replaceButton()).toBeInTheDocument();
    expect(screen.queryByText("recover-account.finish.recover-failed")).toBeNull();
    expect(submitRecoverAccount).toHaveBeenCalledTimes(1);
  });

  it("continues to verification when tx2 reported an error but the keys changed", async () => {
    vi.mocked(submitReplaceKeys).mockImplementationOnce(async () => {
      chain.keysLanded = true;
      throw new Error("timeout");
    });
    await reachFinish();
    fireEvent.click(await replaceButton());
    expect(await screen.findByText("recover-account.cleanup.title")).toBeInTheDocument();
    expect(screen.queryByText("recover-account.finish.keys-failed")).toBeNull();
    expect(submitReplaceKeys).toHaveBeenCalledTimes(1);
    expect(verifyRecoveredKeys).toHaveBeenCalled();
  });

  describe("completion record retries", () => {
    const reachCleanup = async () => {
      const view = await reachFinish();
      fireEvent.click(await replaceButton());
      await screen.findByText("recover-account.cleanup.title");
      return view;
    };
    const wait = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    it("retries after network errors, 5xx and not_recovered, then stops on success", async () => {
      vi.mocked(recoveryComplete)
        .mockResolvedValueOnce({ status: 503, data: { error: "unavailable" } })
        .mockResolvedValueOnce({ status: 409, data: { error: "not_recovered" } })
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue({ status: 200, data: { status: "completed" } });
      await reachCleanup();
      await wait(5 * 60 * 1000);
      expect(recoveryComplete).toHaveBeenCalledTimes(4);
      expect(screen.getByText("recover-account.cleanup.title")).toBeInTheDocument();
    });

    it("gives up after five attempts within about two minutes", async () => {
      vi.mocked(recoveryComplete).mockResolvedValue({ status: 502, data: {} });
      await reachCleanup();
      await wait(2 * 60 * 1000);
      expect(recoveryComplete).toHaveBeenCalledTimes(5);
      await wait(10 * 60 * 1000);
      expect(recoveryComplete).toHaveBeenCalledTimes(5);
    });

    it("does not retry other error codes", async () => {
      vi.mocked(recoveryComplete).mockResolvedValue({ status: 409, data: { error: "bad_state" } });
      await reachCleanup();
      await wait(5 * 60 * 1000);
      expect(recoveryComplete).toHaveBeenCalledTimes(1);
    });

    it("does not retry an answer that arrives after the page is left", async () => {
      let answer: (value: { status: number; data: { error?: string } }) => void = () => {};
      vi.mocked(recoveryComplete).mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        })
      );
      const view = await reachCleanup();
      await waitFor(() => expect(recoveryComplete).toHaveBeenCalledTimes(1));
      view.unmount();
      answer({ status: 503, data: { error: "unavailable" } });
      await wait(5 * 60 * 1000);
      expect(recoveryComplete).toHaveBeenCalledTimes(1);
    });

    it("stops retrying when the page is left", async () => {
      vi.mocked(recoveryComplete).mockResolvedValue({ status: 503, data: { error: "unavailable" } });
      const view = await reachCleanup();
      await waitFor(() => expect(recoveryComplete).toHaveBeenCalledTimes(1));
      view.unmount();
      await wait(5 * 60 * 1000);
      expect(recoveryComplete).toHaveBeenCalledTimes(1);
    });
  });
});
