import { beforeEach, describe, expect, it } from "vitest";
import { createWebBroadcastAdapter } from "@/providers/sdk/web-broadcast-adapter";
import {
  clearTempActiveKey,
  requestAuthUpgrade,
  resolveAuthUpgrade
} from "@/features/shared/auth-upgrade/auth-upgrade-events";
import * as ls from "@/utils/local-storage";
import { encodeObj } from "@/utils/encoder";

// Shaped like a WIF (base58, 51 chars).
const POSTING_KEY = "5J" + "postingke".repeat(5) + "abcd";

function userRecord(username: string, loginType: string) {
  ls.set(`user_${username}`, encodeObj({ username, loginType }));
}

/**
 * The sign options dialog opens for posting ops too, for example when an
 * extension login's extension is off. The SDK then retries with method "key",
 * which reads adapter.getPostingKey. For an extension or HiveSigner login that
 * returned null, so a valid key typed into the dialog failed with "No posting
 * key available". The key is handed to that one retry, never stored.
 */
describe("posting key entered in the sign options dialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearTempActiveKey();
    ls.set("active_user", "alice");
    userRecord("alice", "keychain");
  });

  it("reaches the retry for an extension login", async () => {
    const adapter = createWebBroadcastAdapter();
    const pending = requestAuthUpgrade("posting", "custom_json");
    resolveAuthUpgrade("key", POSTING_KEY, "alice");
    await expect(pending).resolves.toBe("key");

    expect(await adapter.getPostingKey("alice")).toBe(POSTING_KEY);
  });

  it("is handed over once, not kept", async () => {
    const adapter = createWebBroadcastAdapter();
    const pending = requestAuthUpgrade("posting", "custom_json");
    resolveAuthUpgrade("key", POSTING_KEY, "alice");
    await pending;

    await adapter.getPostingKey("alice");
    expect(await adapter.getPostingKey("alice")).toBeNull();
  });

  it("is never handed to another account", async () => {
    userRecord("bob", "keychain");
    const adapter = createWebBroadcastAdapter();
    const pending = requestAuthUpgrade("posting", "custom_json");
    resolveAuthUpgrade("key", POSTING_KEY, "alice");
    await pending;

    expect(await adapter.getPostingKey("bob")).toBeNull();
  });

  it("is not handed over from an active-authority dialog", async () => {
    const adapter = createWebBroadcastAdapter();
    const pending = requestAuthUpgrade("active", "transfer");
    resolveAuthUpgrade("key", POSTING_KEY, "alice");
    await pending;

    expect(await adapter.getPostingKey("alice")).toBeNull();
  });

  it("is dropped when a new dialog opens before it was used", async () => {
    const adapter = createWebBroadcastAdapter();
    const first = requestAuthUpgrade("posting", "custom_json");
    resolveAuthUpgrade("key", POSTING_KEY, "alice");
    await first;

    const second = requestAuthUpgrade("posting", "custom_json");
    expect(await adapter.getPostingKey("alice")).toBeNull();
    resolveAuthUpgrade(false);
    await second;
  });
});
