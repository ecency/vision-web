import { describe, expect, it, vi } from "vitest";
import type { Operation } from "@/hive-tx";
import type { PlatformAdapter } from "../types";

// #2121: a key, Keychain or HiveAuth user who granted ecency.app posting
// authority has posting ops tried with the HiveSigner access token first. A
// rejected token must fall back to the user's own method, not to HiveSigner's
// hot-sign tab, which never settles the mutation.

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useMutation: (options: unknown) => options };
});

const hsBroadcast = vi.hoisted(() => vi.fn());
vi.mock("hivesigner", () => {
  class Client {
    broadcast = hsBroadcast;
  }
  return { default: { Client }, Client };
});

import { useBroadcastMutation } from "./use-broadcast-mutation";

const ops: Operation[] = [
  ["vote", { voter: "alice", author: "bob", permlink: "p", weight: 10000 }] as unknown as Operation
];

function run(loginType: "keychain" | "hivesigner" | null, token: string | null = "expired-token") {
  const never = new Promise<never>(() => {});
  const adapter = {
    getLoginType: vi.fn(async () => loginType),
    hasPostingAuthorization: vi.fn(async () => true),
    getPostingKey: vi.fn(async () => undefined),
    getAccessToken: vi.fn(async () => token),
    getUser: vi.fn(async () => undefined),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    broadcastWithKeychain: vi.fn(async () => ({ id: "kc" })),
    // Same shape as the web adapter's: the hot-sign tab never settles.
    broadcastWithHiveSigner: vi.fn(() => never),
    showAuthUpgradeUI: vi.fn(async () => "keychain" as const)
  } as unknown as PlatformAdapter & Record<string, ReturnType<typeof vi.fn>>;
  const options = useBroadcastMutation<void>(["vote"], "alice", () => ops, () => {}, { adapter }, "posting") as unknown as {
    mutationFn: (payload: void) => Promise<unknown>;
  };
  return { adapter, promise: options.mutationFn() };
}

const settle = (p: Promise<unknown>) =>
  Promise.race([
    p.then((v) => ({ state: "resolved", value: v }), (e) => ({ state: "rejected", value: e })),
    new Promise((r) => setTimeout(() => r({ state: "pending" }), 1000))
  ]) as Promise<{ state: string; value?: unknown }>;

describe("a rejected HiveSigner token on the token-first path", () => {
  it("falls back to Keychain instead of opening HiveSigner", async () => {
    hsBroadcast.mockReset();
    hsBroadcast.mockRejectedValue({ error: "invalid_grant", error_description: "The token has invalid role" });
    const { adapter, promise } = run("keychain");
    const result = await settle(promise);
    expect(result.state).toBe("resolved");
    expect(adapter.broadcastWithKeychain).toHaveBeenCalledTimes(1);
    expect(adapter.broadcastWithHiveSigner).not.toHaveBeenCalled();
  });

  it("falls back to Keychain when there is no token at all", async () => {
    hsBroadcast.mockReset();
    const { adapter, promise } = run("keychain", null);
    const result = await settle(promise);
    expect(result.state).toBe("resolved");
    expect(adapter.broadcastWithKeychain).toHaveBeenCalledTimes(1);
    expect(adapter.broadcastWithHiveSigner).not.toHaveBeenCalled();
  });

  it("still uses HiveSigner's own flow for a HiveSigner login", async () => {
    hsBroadcast.mockReset();
    hsBroadcast.mockRejectedValue({ error: "invalid_grant", error_description: "The token has invalid role" });
    const { adapter, promise } = run("hivesigner");
    await settle(promise);
    expect(adapter.broadcastWithHiveSigner).toHaveBeenCalledTimes(1);
  });

  it("offers the upgrade dialog when the login type is unknown", async () => {
    hsBroadcast.mockReset();
    hsBroadcast.mockRejectedValue({ error: "invalid_grant", error_description: "The token has invalid role" });
    const { adapter, promise } = run(null);
    const result = await settle(promise);
    expect(result.state).toBe("resolved");
    expect(adapter.showAuthUpgradeUI).toHaveBeenCalledTimes(1);
    expect(adapter.broadcastWithHiveSigner).not.toHaveBeenCalled();
  });
});
