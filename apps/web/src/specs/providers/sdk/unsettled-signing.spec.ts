import { afterEach, describe, expect, it, vi } from "vitest";

// #2198: a signing handed to another tab or app never settles here; the
// adapter says so, so the HP dialog can release the row.
vi.mock("hivesigner", () => ({ default: { sendOperations: vi.fn() } }));
vi.mock("@/utils/hive-extensions", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasAnyHiveExtension: () => false
}));
vi.mock("@/utils/user-token", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLoginType: () => "keychain-mobile"
}));

import { createWebBroadcastAdapter } from "@/providers/sdk/web-broadcast-adapter";
import { onUnsettledSigning } from "@/providers/sdk/unsettled-signing";

const OPS = [["delegate_vesting_shares", { delegator: "alice", delegatee: "bob", vesting_shares: "0.000000 VESTS" }]] as never;

let off: (() => void) | undefined;
afterEach(() => off?.());

describe("unsettled signing hand-offs", () => {
  it("are announced by HiveSigner hot-signing", () => {
    const heard = vi.fn();
    off = onUnsettledSigning(heard);

    void createWebBroadcastAdapter().broadcastWithHiveSigner!("alice", OPS, "active");

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("are announced by a Keychain Mobile deep link", () => {
    const heard = vi.fn();
    off = onUnsettledSigning(heard);

    void createWebBroadcastAdapter().broadcastWithKeychain!("alice", OPS, "active");

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("stop reaching a listener that unsubscribed", () => {
    const heard = vi.fn();
    onUnsettledSigning(heard)();

    void createWebBroadcastAdapter().broadcastWithHiveSigner!("alice", OPS, "active");

    expect(heard).not.toHaveBeenCalled();
  });
});
