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
  loadCleanupItems: vi.fn(),
  submitRecoverAccount: vi.fn(),
  submitReplaceKeys: vi.fn(),
  submitCleanup: vi.fn(),
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
  loadRecoveryChainState,
  submitCleanup,
  submitRecoverAccount,
  submitReplaceKeys,
  verifyRecoveredKeys
} from "@/features/account-recovery/recovery-chain";
import RecoverAccountRoute from "@/app/recover-account/page";
import { RecoverAccountPage } from "@/app/recover-account/_page";

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
const account = {
  name: "alice",
  owner: { weight_threshold: 1, account_auths: [], key_auths: [["STM_HACKER", 1]] },
  active: { weight_threshold: 1, account_auths: [], key_auths: [["STM_HACKER_A", 1]] },
  posting: {
    weight_threshold: 1,
    account_auths: [["ecency.app", 1]],
    key_auths: [["STM_HACKER_P", 1]]
  },
  memo_key: "STM_HACKER_M",
  json_metadata: "{}",
  last_owner_update: "2026-11-01T00:00:00",
  recovery_account: "ecency"
};
const chainState = {
  account,
  ownerHistory: [historyEntry],
  lastRecoveryTime: null,
  hasPendingRecoveryChange: false
};
const cleanupItem = {
  id: "power-down",
  kind: "power-down",
  op: ["withdraw_vesting", { account: "alice", vesting_shares: "0.000000 VESTS" }]
};

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
  vi.mocked(loadRecoveryChainState).mockResolvedValue(chainState as any);
  vi.mocked(loadCleanupItems).mockResolvedValue([cleanupItem] as any);
  vi.mocked(submitRecoverAccount).mockResolvedValue({ id: "tx1" } as any);
  vi.mocked(submitReplaceKeys).mockResolvedValue({ id: "tx2" } as any);
  vi.mocked(submitCleanup).mockResolvedValue({ id: "tx3" } as any);
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
    fireEvent.click(await screen.findByRole("button", { name: "recover-account.finish.submit" }));

    await waitFor(() => expect(submitReplaceKeys).toHaveBeenCalled());
    expect(submitRecoverAccount).toHaveBeenCalledWith({
      username: "alice",
      oldKey: h.oldKey,
      newOwnerKey: h.newKeys.owner,
      newOwnerPublicKey: "STM_NEW_OWNER",
      recentOwnerAuthority
    });
    expect(vi.mocked(submitReplaceKeys).mock.calls[0][0]).toMatchObject({
      newKeys: h.newKeys,
      changeRecoveryAccount: false
    });

    // Optional clean-up: pre-checked checklist.
    const checkbox = await screen.findByLabelText(/recover-account\.cleanup\.items\.power-down/);
    expect(checkbox).toBeChecked();
    click("recover-account.cleanup.apply");
    await waitFor(() =>
      expect(submitCleanup).toHaveBeenCalledWith("alice", [cleanupItem.op], h.newKeys.active)
    );

    expect(await screen.findByText("recover-account.success.title")).toBeInTheDocument();
    expect(recoveryComplete).toHaveBeenCalledWith("r1");
    expect(verifyRecoveredKeys).toHaveBeenCalledWith("alice", h.newKeys.publicKeys);

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

  it("asks the user to wait when the owner key changed in the last hour", async () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString().slice(0, 19);
    vi.mocked(loadRecoveryChainState)
      .mockResolvedValueOnce(chainState as any)
      .mockResolvedValue({ ...chainState, account: { ...account, last_owner_update: recent } } as any);
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    await passCode();
    expect(await screen.findByText(/recover-account\.finish\.wait/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "recover-account.finish.submit" })).toBeNull();
    expect(submitRecoverAccount).not.toHaveBeenCalled();
  });

  it("shows a retry for the key update when it fails after the recovery landed", async () => {
    vi.mocked(submitReplaceKeys).mockRejectedValueOnce(new Error("boom"));
    renderWithQueryClient(<RecoverAccountPage />);
    await passStart();
    await passPassword();
    await passOldKey();
    await passCode();
    fireEvent.click(await screen.findByRole("button", { name: "recover-account.finish.submit" }));
    expect(await screen.findByText("recover-account.finish.keys-failed")).toBeInTheDocument();
    click("recover-account.finish.retry");
    await waitFor(() => expect(submitReplaceKeys).toHaveBeenCalledTimes(2));
    expect(submitRecoverAccount).toHaveBeenCalledTimes(1);
  });
});
