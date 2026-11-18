import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  broadcastWithExtension,
  getDetectedExtensions,
  getPreferredExtensionId,
  resolveKeychainInstance,
  setPreferredExtensionId,
  signBufferWithExtension
} from "../../utils/hive-extensions";

/**
 * Regression coverage for the Keychain liveness ping added to signBufferViaKeychain.
 * A Manifest V3 service worker that has gone idle/crashed never calls the sign
 * callback back; the ping must surface a fast, actionable error instead of the
 * old 60s opaque spinner, and must wake the worker (handshake) before signing.
 */
describe("signBufferWithExtension (Keychain liveness ping)", () => {
  beforeEach(() => {
    const w = window as any;
    delete w.hive_keychain;
    delete w.hive;
    delete w.hive_extension;
    delete w.peakvault;
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    const w = window as any;
    delete w.hive_keychain;
  });

  it("handshakes to wake the worker before requesting a signature", async () => {
    const order: string[] = [];
    (window as any).hive_keychain = {
      requestHandshake: (cb: () => void) => {
        order.push("handshake");
        cb();
      },
      requestSignBuffer: (_a: string, _m: string, _t: string, cb: (r: any) => void) => {
        order.push("sign");
        cb({ success: true, result: "signature" });
      }
    };

    const resp = await signBufferWithExtension("alice", "message", "Posting");

    expect(order).toEqual(["handshake", "sign"]);
    expect(resp).toMatchObject({ success: true, result: "signature" });
  });

  it("rejects fast with an actionable message when the worker never responds", async () => {
    vi.useFakeTimers();
    const requestSignBuffer = vi.fn();
    (window as any).hive_keychain = {
      // Dead/asleep worker: the handshake callback is never invoked.
      requestHandshake: vi.fn(),
      requestSignBuffer
    };

    const promise = signBufferWithExtension("alice", "message", "Posting");
    const assertion = expect(promise).rejects.toThrow(/not responding/i);

    await vi.advanceTimersByTimeAsync(6000);
    await assertion;

    // Crucially, we never reach the 60s sign request on a dead worker.
    expect(requestSignBuffer).not.toHaveBeenCalled();
  });

  it("surfaces a user cancellation from the sign request", async () => {
    (window as any).hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestSignBuffer: (_a: string, _m: string, _t: string, cb: (r: any) => void) =>
        cb({ success: false, error: "user_cancel" })
    };

    // i18next is mocked to echo the key, so this asserts the translated string is
    // used. Exact equality, not a substring: "<key> — user_cancel" would satisfy
    // toThrow() while leaking exactly the code this fix removes.
    const error = await signBufferWithExtension("alice", "message", "Posting").catch(
      (e: Error) => e
    );
    expect(error.message).toBe("external-transfer.cancelled");
  });
});

/**
 * The same liveness ping guards broadcastViaKeychain, so votes/posts/transfers do
 * not hang for 60s on an idle/crashed worker either.
 */
describe("broadcastWithExtension (Keychain liveness ping)", () => {
  beforeEach(() => {
    const w = window as any;
    delete w.hive_keychain;
    delete w.hive;
    delete w.hive_extension;
    delete w.peakvault;
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as any).hive_keychain;
  });

  it("rejects an owner-authority broadcast before reaching any extension", async () => {
    // Keychain/Keeper validate `method` against [Posting, Active]; the old
    // behaviour forwarded "Owner" and surfaced their Joi ValidationError.
    const requestBroadcast = vi.fn();
    (window as any).hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast
    };

    await expect(
      broadcastWithExtension("alice", [["account_update", {}]], "owner")
    ).rejects.toThrow(/owner/i);
    expect(requestBroadcast).not.toHaveBeenCalled();
  });

  it("handshakes before broadcasting", async () => {
    const order: string[] = [];
    (window as any).hive_keychain = {
      requestHandshake: (cb: () => void) => {
        order.push("handshake");
        cb();
      },
      requestBroadcast: (_a: string, _o: any[], _t: string, cb: (r: any) => void) => {
        order.push("broadcast");
        cb({ success: true, result: { id: "tx" } });
      }
    };

    await broadcastWithExtension("alice", [["vote", {}]], "posting");
    expect(order).toEqual(["handshake", "broadcast"]);
  });

  it("rejects fast when the worker never responds, without reaching broadcast", async () => {
    vi.useFakeTimers();
    const requestBroadcast = vi.fn();
    (window as any).hive_keychain = {
      requestHandshake: vi.fn(),
      requestBroadcast
    };

    const promise = broadcastWithExtension("alice", [["vote", {}]], "posting");
    const assertion = expect(promise).rejects.toThrow(/not responding/i);

    await vi.advanceTimersByTimeAsync(6000);
    await assertion;

    expect(requestBroadcast).not.toHaveBeenCalled();
  });

  // The reported case: cancelling a power up in the extension surfaced
  // "Request was canceled by the user. -- user_cancel" in the operation error box.
  it("surfaces a cancelled broadcast as the translated message, without the raw code", async () => {
    (window as any).hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast: (_a: string, _o: any[], _t: string, cb: (r: any) => void) =>
        cb({
          success: false,
          error: "user_cancel",
          message: "Request was canceled by the user."
        })
    };

    const error = await broadcastWithExtension(
      "alice",
      [["transfer_to_vesting", {}]],
      "active"
    ).catch((e: Error) => e);
    expect(error.message).toBe("external-transfer.cancelled");
  });
});

/**
 * Keeper owns window.hive and is the only extension that has adopted the unified
 * protocol. We must sign through that live window.hive object (flagged
 * isKeeper) rather than the providers registry entry: routing Keeper signing
 * through the registry handed back a non-live instance whose callback never
 * fired, so login spun for 60s and never opened the extension. window.hive_extension
 * is a content-script-world marker that never reaches the page, so it cannot be
 * used to detect or resolve Keeper.
 */
describe("Hive Keeper resolution (window.hive primary)", () => {
  beforeEach(() => {
    const w = window as any;
    delete w.hive_keychain;
    delete w.hive;
    delete w.hive_extension;
    delete w.peakvault;
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    const w = window as any;
    delete w.hive_keychain;
    delete w.hive;
    delete w.peakvault;
  });

  it("signs through the live window.hive, not a stale providers-registry entry", async () => {
    const order: string[] = [];
    const requestSignBuffer = vi.fn(
      (_a: string, _m: string, _t: string, cb: (r: any) => void) => {
        order.push("sign");
        cb({ success: true, result: "signature" });
      }
    );
    const liveKeeper: any = {
      isKeeper: true,
      requestHandshake: (cb: () => void) => {
        order.push("handshake");
        cb();
      },
      requestSignBuffer
    };
    // A stale/non-live provider object that never calls its callback back -
    // resolving Keeper through this is exactly what caused the 60s hang.
    const staleProvider = { requestHandshake: (cb: () => void) => cb(), requestSignBuffer: vi.fn() };
    liveKeeper.providers = [
      { name: "Hive Keeper", rdns: "com.ecency.keeper", provider: staleProvider }
    ];
    (window as any).hive = liveKeeper;

    const resp = await signBufferWithExtension("alice", "message", "Posting", null, "hive-keeper");

    expect(order).toEqual(["handshake", "sign"]);
    expect(resp).toMatchObject({ success: true, result: "signature" });
    expect(requestSignBuffer).toHaveBeenCalledTimes(1);
    expect(staleProvider.requestSignBuffer).not.toHaveBeenCalled();
  });

  it("detects Keeper via window.hive.isKeeper (not window.hive_extension)", () => {
    (window as any).hive = { isKeeper: true, requestHandshake: vi.fn(), requestSignBuffer: vi.fn() };

    const ids = getDetectedExtensions().map((e) => e.id);
    expect(ids).toContain("hive-keeper");
  });

  it("does not surface Keeper's window.hive_keychain self-alias as a phantom Keychain", () => {
    // Keeper-only browser: it aliases itself onto window.hive_keychain for
    // backward compat, but that is the same isKeeper object - not a real Keychain.
    const keeper: any = { isKeeper: true, requestHandshake: vi.fn(), requestSignBuffer: vi.fn() };
    (window as any).hive = keeper;
    (window as any).hive_keychain = keeper;

    const ids = getDetectedExtensions().map((e) => e.id);
    expect(ids).toContain("hive-keeper");
    expect(ids).not.toContain("keychain");
  });

  it("still detects a genuine Keychain (no isKeeper flag) alongside Keeper", () => {
    (window as any).hive = { isKeeper: true, requestHandshake: vi.fn(), requestSignBuffer: vi.fn() };
    (window as any).hive_keychain = { requestHandshake: vi.fn(), requestSignBuffer: vi.fn() };

    const ids = getDetectedExtensions().map((e) => e.id);
    expect(ids).toContain("hive-keeper");
    expect(ids).toContain("keychain");
  });

  it("clears a stale 'keychain' preference in a Keeper-only browser and signs via window.hive", async () => {
    const order: string[] = [];
    const keeper: any = {
      isKeeper: true,
      requestHandshake: (cb: () => void) => {
        order.push("handshake");
        cb();
      },
      requestSignBuffer: (_a: string, _m: string, _t: string, cb: (r: any) => void) => {
        order.push("sign");
        cb({ success: true, result: "signature" });
      }
    };
    (window as any).hive = keeper;
    // Keeper's backward-compat self-alias - NOT a real Keychain.
    (window as any).hive_keychain = keeper;
    // Stale per-user preference from before the user switched to a Keeper-only setup.
    setPreferredExtensionId("alice", "keychain");

    const resp = await signBufferWithExtension("alice", "message", "Posting");

    // Signed through the live window.hive path (handshake then sign)...
    expect(order).toEqual(["handshake", "sign"]);
    expect(resp).toMatchObject({ success: true, result: "signature" });
    // ...and alice's stale "keychain" preference self-healed because the alias
    // no longer resolves to a usable Keychain instance.
    expect(getPreferredExtensionId("alice")).toBeNull();
  });
});

describe("per-username extension preference", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).hive;
    delete (window as any).hive_keychain;
    delete (window as any).peakvault;
  });

  it("remembers a different extension per account", () => {
    setPreferredExtensionId("alice", "keychain");
    setPreferredExtensionId("bob", "hive-keeper");

    expect(getPreferredExtensionId("alice")).toBe("keychain");
    expect(getPreferredExtensionId("bob")).toBe("hive-keeper");
  });

  it("does not leak one account's choice to another", () => {
    setPreferredExtensionId("alice", "keychain");
    expect(getPreferredExtensionId("bob")).toBeNull();
  });

  it("falls back to the legacy global preference for accounts without a per-user choice", () => {
    localStorage.setItem("ecency_preferred_hive_extension", "hive-keeper");
    expect(getPreferredExtensionId("newcomer")).toBe("hive-keeper");
    // A per-user choice overrides the legacy global.
    setPreferredExtensionId("newcomer", "keychain");
    expect(getPreferredExtensionId("newcomer")).toBe("keychain");
  });

  it("ignores a corrupted or unknown preference value", () => {
    // Hand-edited / corrupted per-user map entry.
    localStorage.setItem(
      "ecency_preferred_hive_extension_by_user",
      JSON.stringify({ alice: "evil-injected" })
    );
    expect(getPreferredExtensionId("alice")).toBeNull();

    // Corrupted legacy global value is likewise ignored.
    localStorage.setItem("ecency_preferred_hive_extension", "evil-injected");
    expect(getPreferredExtensionId("bob")).toBeNull();
  });

  it("resolveKeychainInstance honors the account's choice over Keeper-first auto-detect", () => {
    const keeper: any = { isKeeper: true };
    const keychain: any = { isKeeper: false };
    (window as any).hive = keeper;
    (window as any).hive_keychain = keychain;

    // alice chose Keychain: must resolve the real Keychain, never the Keeper.
    setPreferredExtensionId("alice", "keychain");
    expect(resolveKeychainInstance("alice")).toBe(keychain);

    // bob chose Keeper: resolves the live window.hive.
    setPreferredExtensionId("bob", "hive-keeper");
    expect(resolveKeychainInstance("bob")).toBe(keeper);

    // No choice → Keeper-first auto-detect (unchanged legacy behavior).
    expect(resolveKeychainInstance("carol")).toBe(keeper);
  });
});

// Typed stand-ins for the extension globals in the cases below.
type TxAnswer = { success: boolean; result?: unknown; message?: string; error?: unknown };
type AnswerCb = (r: TxAnswer) => void;
const extWindow = () => window as unknown as Record<string, unknown>;

/**
 * A slow approval is not a failure: the extension answered the ping, so the
 * broadcast waits for the wallet's own answer (as on self-hosted, #2125). A
 * failure shown at 30s while the popup is still open, then a broadcast when
 * the user approves, invites a second send.
 */
describe("broadcastWithExtension (slow approval)", () => {
  beforeEach(() => {
    const w = extWindow();
    delete w.hive_keychain;
    delete w.hive;
    delete w.hive_extension;
    delete w.peakvault;
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete extWindow().hive_keychain;
    localStorage.clear();
  });

  it("resolves when the user approves after a minute", async () => {
    vi.useFakeTimers();
    let answer: AnswerCb | undefined;
    extWindow().hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast: (_a: string, _o: unknown[], _t: string, cb: AnswerCb) => {
        answer = cb;
      }
    };

    let settled: unknown = "pending";
    const promise = broadcastWithExtension("alice", [["transfer", {}]], "active").then(
      (r) => (settled = r),
      (e) => (settled = e)
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).toBe("pending");

    answer!({ success: true, result: { id: "tx" } });
    await promise;
    expect(settled).toEqual({ id: "tx" });
  });
});

/**
 * The fallback node signs a NEW transaction, which the chain cannot dedupe
 * against the first. It is only safe when the first one surely never reached
 * a node; after a timeout or a gateway error it may have been accepted.
 */
describe("broadcastWithExtension (fallback node)", () => {
  beforeEach(() => {
    const w = extWindow();
    delete w.hive_keychain;
    delete w.hive;
    delete w.hive_extension;
    delete w.peakvault;
    localStorage.clear();
  });

  afterEach(() => {
    delete extWindow().hive_keychain;
    localStorage.clear();
  });

  const keychainAnswering = (first: TxAnswer) => {
    const nodes: Array<string | null> = [];
    extWindow().hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast: (_a: string, _o: unknown[], _t: string, cb: AnswerCb, node: string | null) => {
        nodes.push(node);
        cb(nodes.length === 1 ? first : { success: true, result: { id: "retry" } });
      }
    };
    return nodes;
  };

  it.each([
    [{ success: false, message: "timeout of 30000ms exceeded" }],
    [{ success: false, message: "Request failed with status code 504" }],
    [{ success: false, message: "Request failed with status code 502" }],
    [{ success: false, error: "socket hang up" }],
    [{ success: false, message: "Request failed with status code 503" }]
  ])("does not retry after %o, where the first may have gone through", async (first) => {
    const nodes = keychainAnswering(first);
    await expect(broadcastWithExtension("alice", [["transfer", {}]], "active")).rejects.toThrow();
    expect(nodes).toHaveLength(1);
  });

  it.each([
    [{ success: false, error: { message: "connect ECONNREFUSED 1.2.3.4:443" } }],
    [{ success: false, message: "getaddrinfo ENOTFOUND api.example.com" }],
    [{ success: false, message: "All origin servers are unavailable" }]
  ])("retries once after %o, where nothing was sent", async (first) => {
    const nodes = keychainAnswering(first);
    await expect(broadcastWithExtension("alice", [["transfer", {}]], "active")).resolves.toEqual({ id: "retry" });
    expect(nodes).toHaveLength(2);
  });
});

describe("broadcastWithExtension (no answer at all)", () => {
  beforeEach(() => {
    const w = extWindow();
    delete w.hive_keychain;
    delete w.hive;
    delete w.hive_extension;
    delete w.peakvault;
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete extWindow().hive_keychain;
  });

  // The request is with the wallet: it may still be approved and sent, so
  // the app never reports a failure on a timer. A long wait shows a notice
  // that does not end the request.
  it("never fails after handing the request to Keychain, and resolves on a late approval", async () => {
    vi.useFakeTimers();
    const notices: string[] = [];
    const onFeedback = (e: Event) => notices.push((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener("ecency-feedback", onFeedback);
    let answer: AnswerCb | undefined;
    extWindow().hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast: (_a: string, _o: unknown[], _k: string, cb: AnswerCb) => {
        answer = cb;
      }
    };
    const promise = broadcastWithExtension("alice", [["transfer", {}]], "active");
    let settled = false;
    promise.then(
      () => (settled = true),
      () => (settled = true)
    );

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 - 1);
    expect(notices).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(notices).toEqual(["key-or-hot.keychain-broadcast-pending"]));

    // An hour on, still waiting, and the notice was shown once.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(settled).toBe(false);
    expect(notices).toHaveLength(1);

    answer?.({ success: true, result: { id: "tx1" } } as TxAnswer);
    await expect(promise).resolves.toEqual({ id: "tx1" });
    window.removeEventListener("ecency-feedback", onFeedback);
  });

  // A worker that drops the request never calls back: the notice lets the
  // user stop waiting, with the outcome unknown, not as a failure to retry.
  it("lets the user stop waiting from the notice, with the outcome unknown and no retry", async () => {
    vi.useFakeTimers();
    const toasts: { message: string; action?: { label: string; onClick: () => void } }[] = [];
    const onFeedback = (e: Event) => toasts.push((e as CustomEvent).detail);
    window.addEventListener("ecency-feedback", onFeedback);
    let answer: AnswerCb | undefined;
    const requestBroadcast = vi.fn((_a: string, _o: unknown[], _k: string, cb: AnswerCb) => {
      answer = cb;
    });
    extWindow().hive_keychain = { requestHandshake: (cb: () => void) => cb(), requestBroadcast };
    const promise = broadcastWithExtension("alice", [["transfer", {}]], "active");
    const outcome = promise.then(
      () => "resolved",
      (e: Error) => e.message
    );

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await vi.waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0].action?.label).toBe("key-or-hot.keychain-stop-waiting");
    toasts[0].action?.onClick();
    await expect(outcome).resolves.toBe("key-or-hot.keychain-broadcast-unknown");

    // A late answer changes nothing, and nothing was sent again.
    answer?.({ success: false, message: "connect ECONNREFUSED 1.2.3.4:443" } as TxAnswer);
    await vi.advanceTimersByTimeAsync(0);
    expect(requestBroadcast).toHaveBeenCalledTimes(1);
    window.removeEventListener("ecency-feedback", onFeedback);
  });

  it("brings the notice back two minutes after it is closed, so the way out is not lost", async () => {
    vi.useFakeTimers();
    const toasts: { onDismiss?: () => void }[] = [];
    const onFeedback = (e: Event) => toasts.push((e as CustomEvent).detail);
    window.addEventListener("ecency-feedback", onFeedback);
    extWindow().hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast: vi.fn()
    };
    void broadcastWithExtension("alice", [["transfer", {}]], "active").catch(() => {});
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await vi.waitFor(() => expect(toasts).toHaveLength(1));

    // Closed with X: still waiting (an approval may be coming), no new notice yet.
    toasts[0].onDismiss?.();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000 - 1);
    expect(toasts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(toasts).toHaveLength(2));
    window.removeEventListener("ecency-feedback", onFeedback);
  });

  it("closes the notice when Keychain answers after it appeared", async () => {
    vi.useFakeTimers();
    const shown: string[] = [];
    const dismissed: string[] = [];
    const onFeedback = (e: Event) => shown.push((e as CustomEvent<{ id: string }>).detail.id);
    const onDismiss = (e: Event) => dismissed.push((e as CustomEvent<string>).detail);
    window.addEventListener("ecency-feedback", onFeedback);
    window.addEventListener("ecency-feedback-dismiss", onDismiss);
    let answer: AnswerCb | undefined;
    extWindow().hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast: (_a: string, _o: unknown[], _k: string, cb: AnswerCb) => {
        answer = cb;
      }
    };
    const promise = broadcastWithExtension("alice", [["transfer", {}]], "active");
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    await vi.waitFor(() => expect(shown).toHaveLength(1));

    expect(dismissed).toHaveLength(0);
    answer?.({ success: true, result: { id: "tx3" } } as TxAnswer);
    await expect(promise).resolves.toEqual({ id: "tx3" });
    // The test setup's random() mock gives no ids, so count the dismissals.
    await vi.waitFor(() => expect(dismissed).toHaveLength(1));
    window.removeEventListener("ecency-feedback", onFeedback);
    window.removeEventListener("ecency-feedback-dismiss", onDismiss);
  });

  it("shows no notice when Keychain answers before the wait gets long", async () => {
    vi.useFakeTimers();
    const notices: string[] = [];
    const onFeedback = (e: Event) => notices.push((e as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener("ecency-feedback", onFeedback);
    extWindow().hive_keychain = {
      requestHandshake: (cb: () => void) => cb(),
      requestBroadcast: (_a: string, _o: unknown[], _k: string, cb: AnswerCb) =>
        setTimeout(() => cb({ success: true, result: { id: "tx2" } } as TxAnswer), 30_000)
    };
    const promise = broadcastWithExtension("alice", [["transfer", {}]], "active");
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(promise).resolves.toEqual({ id: "tx2" });
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(notices).toEqual([]);
    window.removeEventListener("ecency-feedback", onFeedback);
  });
});

describe("the stop-waiting error", () => {
  // It must never send the request another way: the first may still go through.
  it("does not trigger the auth fallback to another sign method", async () => {
    const { shouldTriggerAuthFallback } = await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk");
    const en = (await import("@/features/i18n/locales/en-US.json")).default as {
      "key-or-hot": Record<string, string>;
    };
    const text = en["key-or-hot"]["keychain-broadcast-unknown"];
    expect(text).toMatch(/check your wallet history/);
    expect(shouldTriggerAuthFallback(new Error(text))).toBe(false);
  });
});
