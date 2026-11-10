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
    Turnstile: ReactMod.forwardRef(function FakeTurnstile(props: any, ref) {
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
import RecoverAccountRoute from "@/app/recover-account/page";
import { RecoverAccountPage } from "@/app/recover-account/_page";

const HEAD = Date.parse("2026-11-10T12:00:00Z");
const recentOwnerAuthority = {
  weight_threshold: 1,
  account_auths: [],
  key_auths: [["STM_OLD", 1]]
};
const historyEntry = {
  id: 1,
  account: "alice",
  previous_owner_authority: recentOwnerAuthority,
  last_valid_time: "2026-11-09T00:00:00"
};
const auth = (keys: string[], accounts: string[] = []) => ({
  weight_threshold: 1,
  account_auths: accounts.map((a) => [a, 1]),
  key_auths: keys.map((k) => [k, 1])
});
const account = {
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
const chainState = {
  account,
  ownerHistory: [historyEntry],
  lastRecoveryTime: null,
  headTime: HEAD
};
/** Account right after tx1: owner is the new key, the previous change was long ago. */
const afterTx1 = {
  ...chainState,
  account: {
    ...account,
    owner: auth(["STM_NEW_OWNER"]),
    previous_owner_update: account.last_owner_update,
    last_owner_update: "2026-11-10T12:00:00"
  },
  headTime: HEAD + 60 * 1000
};
const allReplaced = {
  ...afterTx1,
  account: {
    ...afterTx1.account,
    active: auth(["STM_NEW_ACTIVE"]),
    posting: auth(["STM_NEW_POSTING"], ["ecency.app"]),
    memo_key: "STM_NEW_MEMO"
  }
};
const cleanupItem = {
  id: "power-down",
  kind: "power-down",
  op: ["withdraw_vesting", { account: "alice", vesting_shares: "0.000000 VESTS" }]
};

/** Chain reads follow what has been broadcast so far, unless a test overrides them. */
const chain = vi.hoisted(() => ({ next: null as null | (() => unknown), keysLanded: false }));

function setDefaults() {
  vi.mocked(recoveryStart).mockResolvedValue({
    status: 200,
    data: { request_id: "r1", nonce: "n1" }
  } as any);
  vi.mocked(recoveryProve).mockResolvedValue({
    status: 200,
    data: { emails: ["a****e@example.com"] }
  } as any);
  vi.mocked(recoveryVerifyCode).mockResolvedValue({
    status: 200,
    data: { status: "approved" }
  } as any);
  vi.mocked(recoveryStatus).mockResolvedValue({
    status: 200,
    data: { status: "requested", tx_id: "tx0" }
  } as any);
  vi.mocked(recoveryComplete).mockResolvedValue({
    status: 200,
    data: { status: "completed" }
  } as any);
  vi.mocked(signRecoveryChallenge).mockReturnValue("ab".repeat(65));
  vi.mocked(matchOldOwnerKey).mockReturnValue({
    status: "match",
    key: h.oldKey,
    publicKey: "STM_OLD",
    entry: historyEntry
  } as any);
  chain.next = null;
  chain.keysLanded = false;
  vi.mocked(loadRecoveryChainState).mockImplementation(async () => {
    if (chain.next) return chain.next() as any;
    if (chain.keysLanded) return allReplaced as any;
    return (vi.mocked(submitRecoverAccount).mock.calls.length ? afterTx1 : chainState) as any;
  });
  vi.mocked(loadRecentPostingAuthAdds).mockResolvedValue(new Set(["late.app"]));
  vi.mocked(loadCleanupItems).mockResolvedValue([cleanupItem] as any);
  vi.mocked(submitRecoverAccount).mockResolvedValue({ id: "tx1" } as any);
  vi.mocked(submitReplaceKeys).mockImplementation(async () => {
    chain.keysLanded = true;
    return { id: "tx2" } as any;
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
  renderWithQueryClient(<RecoverAccountPage />);
  await passStart();
  await passPassword();
  await passOldKey();
  await passCode();
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
      keepAccountAuths: { owner: [], active: [], posting: ["ecency.app"] }
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
    } as any);
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
    } as any);
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    expect(await screen.findByText("recover-account.errors.unavailable")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("recover-account.start.username-placeholder")).toBeInTheDocument();
  });

  it.each(["not_ecency_recovery", "no_email", "no_recent_owner_change"])(
    "sends %s to the manual help screen",
    async (code) => {
      vi.mocked(recoveryStart).mockResolvedValueOnce({ status: 422, data: { error: code } } as any);
      renderWithQueryClient(<RecoverAccountPage />);
      await passStart();
      expect(await screen.findByText("recover-account.manual.title")).toBeInTheDocument();
      expect(screen.getByText(`recover-account.errors.${code}`)).toBeInTheDocument();
    }
  );

  it("says so locally when the old key does not match and sends nothing", async () => {
    vi.mocked(matchOldOwnerKey).mockReturnValue({ status: "no-match" } as any);
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
    } as any);
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
    } as any);
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
    } as any);
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
    } as any);
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
      key: h.oldKey,
      publicKey: "STM_OLD",
      entry: { ...historyEntry, last_valid_time: "2026-10-11T12:05:00" }
    } as any);
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
    const second = { id: "open-order:7", kind: "open-order", op: ["limit_order_cancel", {}] };
    vi.mocked(loadCleanupItems).mockResolvedValueOnce([cleanupItem, second] as any);
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
    } as any);
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
    vi.mocked(matchOldOwnerKey).mockReturnValue({ status: "not-sufficient" } as any);
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
    } as any);
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    expect(await screen.findByText("recover-account.errors.in_progress")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("recover-account.start.username-placeholder")).toBeInTheDocument();
  });
});
