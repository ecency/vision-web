import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Operation } from "@/hive-tx";
import type { PlatformAdapter } from "../types";

// useBroadcastMutation only wraps react-query's useMutation; hand the options
// straight back so the spec can call mutationFn without React.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useMutation: (options: unknown) => options };
});

import { useBroadcastMutation } from "./use-broadcast-mutation";
import { broadcastJson } from "./broadcast-json";
import { parseChainError, shouldTriggerAuthFallback, ErrorType } from "../errors/chain-errors";

// The web app's broadcastWithExtension rejects with this when the account
// logged in with an extension that is disabled or not injected into the tab.
const EXTENSION_MISSING =
  "No Hive browser extension found. Please install Hive Keeper, Keychain, or Peak Vault.";

const ops: Operation[] = [
  [
    "custom_json",
    {
      required_auths: ["alice"],
      required_posting_auths: [],
      id: "ecency_promote",
      json: "{}",
    },
  ] as unknown as Operation,
];

const CONFIRMATION = { id: "tx-hs", block_num: 1, trx_num: 0, expired: false };

type SelectedMethod = Awaited<ReturnType<NonNullable<PlatformAdapter["showAuthUpgradeUI"]>>>;

function makeAdapter(selected: SelectedMethod, keychainError: Error = new Error(EXTENSION_MISSING)) {
  return {
    getLoginType: vi.fn(async () => "keychain"),
    hasPostingAuthorization: vi.fn(async () => false),
    getPostingKey: vi.fn(async () => null),
    getAccessToken: vi.fn(async () => undefined),
    getUser: vi.fn(async () => undefined),
    showError: vi.fn(),
    showSuccess: vi.fn(),
    broadcastWithKeychain: vi.fn(async () => {
      throw keychainError;
    }),
    broadcastWithHiveSigner: vi.fn(async () => CONFIRMATION),
    showAuthUpgradeUI: vi.fn(async () => selected),
  } satisfies PlatformAdapter;
}

function mutationFnFor(adapter: PlatformAdapter, authority: "active" | "posting" | "owner") {
  const options = useBroadcastMutation<void>(
    ["promote"],
    "alice",
    () => ops,
    () => {},
    { adapter },
    authority
  ) as unknown as { mutationFn: (payload: void) => Promise<unknown> };
  return options.mutationFn;
}

describe("extension unavailable for an extension-login account", () => {
  it("classifies the missing-extension error as an auth fallback case", () => {
    const parsed = parseChainError(new Error(EXTENSION_MISSING));
    expect(parsed.type).toBe(ErrorType.MISSING_AUTHORITY);
    expect(shouldTriggerAuthFallback(new Error(EXTENSION_MISSING))).toBe(true);
  });

  describe("broadcast", () => {
    beforeEach(() => vi.clearAllMocks());

    it("opens the sign options dialog and broadcasts with the chosen method", async () => {
      const adapter = makeAdapter("hivesigner");
      await expect(mutationFnFor(adapter, "active")()).resolves.toEqual(CONFIRMATION);
      expect(adapter.broadcastWithKeychain).toHaveBeenCalledTimes(1);
      expect(adapter.showAuthUpgradeUI).toHaveBeenCalledWith("active", "custom_json");
      expect(adapter.broadcastWithHiveSigner).toHaveBeenCalledWith("alice", ops, "active");
    });

    it("still rejects when the user closes the dialog", async () => {
      const adapter = makeAdapter(false);
      await expect(mutationFnFor(adapter, "active")()).rejects.toThrow(/declined alternate auth/);
      expect(adapter.broadcastWithHiveSigner).not.toHaveBeenCalled();
    });

    it("does not open the dialog for owner authority", async () => {
      const adapter = makeAdapter("hivesigner");
      await expect(mutationFnFor(adapter, "owner")()).rejects.toThrow(EXTENSION_MISSING);
      expect(adapter.showAuthUpgradeUI).not.toHaveBeenCalled();
    });
  });

  // Follow and unfollow go through broadcastJson, which reaches the extension
  // through its own adapter branch rather than useBroadcastMutation.
  describe("broadcastJson (follow, unfollow)", () => {
    beforeEach(() => vi.clearAllMocks());

    const follow = (adapter: PlatformAdapter) =>
      broadcastJson("alice", "follow", ["follow", { follower: "alice", following: "bob", what: ["blog"] }], {
        adapter,
        loginType: "keychain",
      });

    it("opens the sign options dialog and broadcasts with the chosen method", async () => {
      const adapter = makeAdapter("hivesigner");
      await expect(follow(adapter)).resolves.toEqual(CONFIRMATION);
      expect(adapter.showAuthUpgradeUI).toHaveBeenCalledWith("posting", "custom_json");
      expect(adapter.broadcastWithHiveSigner).toHaveBeenCalledWith(
        "alice",
        [["custom_json", expect.objectContaining({ id: "follow", required_posting_auths: ["alice"] })]],
        "posting"
      );
    });

    it("still rejects when the user closes the dialog", async () => {
      const adapter = makeAdapter(false);
      await expect(follow(adapter)).rejects.toThrow(/declined alternate auth/);
      expect(adapter.broadcastWithHiveSigner).not.toHaveBeenCalled();
    });

    it("does not open the dialog for an error that is not about auth", async () => {
      const adapter = makeAdapter("hivesigner", new Error("Request was canceled by the user."));
      await expect(follow(adapter)).rejects.toThrow("Request was canceled by the user.");
      expect(adapter.showAuthUpgradeUI).not.toHaveBeenCalled();
    });
  });
});
