import fs from "fs";
import path from "path";
import {
  extensionErrorMessage,
  isExplicitUserCancellation,
  isUserCancellation,
  isRetryableNodeError
} from "../../utils/extension-error";

describe("extensionErrorMessage", () => {
  it("falls back to the provided default when nothing is present", () => {
    expect(extensionErrorMessage({}, "Extension broadcast failed")).toBe(
      "Extension broadcast failed"
    );
  });

  it("surfaces the human-readable message", () => {
    expect(
      extensionErrorMessage({ message: "There was an error broadcasting." }, "fallback")
    ).toBe("There was an error broadcasting.");
  });

  it("surfaces a string error code", () => {
    expect(extensionErrorMessage({ error: "invalid_params" }, "fallback")).toBe("invalid_params");
  });

  // Regression: a cancel used to render as "Request was canceled by the user. -- user_cancel",
  // leaking Keychain's internal code into the UI. It now resolves to one translated line.
  it.each([
    [{ error: "user_cancel", message: "Request was canceled by the user." }],
    [{ error: "user_cancel" }],
    [{ message: "Request was canceled by the user." }],
    [{ error: { code: 4001, message: "User rejected request" } }],
  ])("returns the translated cancellation for %o", (resp) => {
    const result = extensionErrorMessage(resp, "Operation cancelled");
    expect(result).toBe("external-transfer.cancelled");
    expect(result).not.toContain("user_cancel");
  });

  // The replacement must not swallow a real failure that happens to read
  // cancel-ish. Hiding "missing required active authority" here would leave the
  // SDK's auth-upgrade classifier with nothing to match on.
  it.each([
    [{ message: "transaction rejected: missing required active authority" }],
    [{ error: { message: "Assert Exception:limit_order_cancel: order not found" } }],
    [{ message: "Broadcast rejected by the node" }],
    [{ error: "unauthorized", message: "Request rejected" }],
    // A bare status code alongside a detailed message: the message is the only
    // thing saying what actually happened, so it has to survive.
    [{ error: "rejected", message: "Invalid transaction: duplicate transaction" }],
  ])("keeps the real failure detail for %o", (resp) => {
    const result = extensionErrorMessage(resp, "Extension broadcast failed");
    expect(result).not.toBe("external-transfer.cancelled");
  });

  it("keeps both halves when a bare status carries a detailed message", () => {
    const result = extensionErrorMessage(
      { error: "rejected", message: "Invalid transaction: duplicate transaction" },
      "Extension broadcast failed"
    );
    expect(result).toContain("Invalid transaction: duplicate transaction");
    expect(result).toContain("rejected");
  });

  it("combines message and underlying error detail", () => {
    const result = extensionErrorMessage(
      { message: "There was an error broadcasting.", error: { message: "missing required active authority" } },
      "fallback"
    );
    expect(result).toContain("There was an error broadcasting.");
    expect(result).toContain("missing required active authority");
  });

  it("does not duplicate when message equals the string error", () => {
    expect(extensionErrorMessage({ message: "boom", error: "boom" }, "fallback")).toBe("boom");
  });

  it("ignores an empty object error and uses the fallback", () => {
    expect(extensionErrorMessage({ error: {} }, "fallback")).toBe("fallback");
  });
});

describe("isUserCancellation", () => {
  it.each([
    [{ error: "user_cancel" }],
    [{ message: "Request was canceled by the user." }],
    [{ message: "User declined the transaction" }],
    // object-shaped errors (e.g. EIP-1193 / wallet code 4001)
    [{ error: { code: 4001, message: "User rejected request" } }],
    [{ error: { message: "user_cancel" } }],
  ])("treats %o as a cancellation", (resp) => {
    expect(isUserCancellation(resp)).toBe(true);
  });

  it.each([
    [{}],
    [{ message: "missing required active authority" }],
    [{ error: { code: -32000, message: "insufficient resource credits" } }],
  ])("treats %o as NOT a cancellation", (resp) => {
    expect(isUserCancellation(resp)).toBe(false);
  });
});

/**
 * The strict variant gates whether the real failure text is discarded, so it
 * matches only explicit signals: a whole-string cancellation code, the wallet
 * 4001 code, or a phrase naming the user as the actor.
 */
describe("isExplicitUserCancellation", () => {
  it.each([
    [{ error: "user_cancel" }],
    [{ error: "USER_CANCEL" }],
    [{ error: "cancelled" }],
    [{ error: "rejected" }],
    [{ message: "Request was canceled by the user." }],
    [{ message: "User declined the transaction" }],
    [{ error: { code: 4001, message: "User rejected request" } }],
    [{ error: { message: "user_cancelled" } }],
  ])("treats %o as an explicit cancellation", (resp) => {
    expect(isExplicitUserCancellation(resp)).toBe(true);
  });

  it.each([
    [{}],
    // Unanchored substrings that the loose matcher accepts and this one must not
    [{ message: "transaction rejected: missing required active authority" }],
    [{ error: { message: "Assert Exception:limit_order_cancel: order not found" } }],
    [{ message: "Broadcast rejected by the node" }],
    [{ message: "Request declined: insufficient resource credits" }],
    [{ error: "unauthorized" }],
    // A cancellation code is only a code when it is the whole field
    [{ error: "cancel_transfer_from_savings failed" }],
    // A bare status names no actor, so a message alongside it is real detail
    [{ error: "rejected", message: "Invalid transaction: duplicate transaction" }],
    [{ error: "cancelled", message: "The node closed the connection mid-broadcast" }],
  ])("treats %o as NOT an explicit cancellation", (resp) => {
    expect(isExplicitUserCancellation(resp)).toBe(false);
  });
});

/**
 * The cancellation sentence is reused rather than newly minted: `external-transfer.cancelled`
 * ("Transaction cancelled by user.") is already translated in every locale, while a new
 * en-US key would read English everywhere until Crowdin round-trips it. That only holds
 * while the key exists in all of them.
 */
describe("cancellation string coverage", () => {
  const LOCALES_DIR = path.join(__dirname, "../../features/i18n/locales");

  it.each(fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json")))(
    "%s defines external-transfer.cancelled",
    (file) => {
      const locale = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), "utf-8"));
      expect(typeof locale["external-transfer"]?.cancelled).toBe("string");
      expect(locale["external-transfer"].cancelled.length).toBeGreaterThan(0);
    }
  );
});

describe("isRetryableNodeError", () => {
  it.each([
    [{ message: "Request failed with status code 502" }],
    [{ message: "All origin servers are unavailable" }],
    [{ error: "ETIMEDOUT" }],
    [{ message: "timeout of 30000ms exceeded" }],
    [{ error: { message: "connect ECONNREFUSED 1.2.3.4:443" } }],
    [{ message: "bad gateway" }],
  ])("retries node/transport failure %o", (resp) => {
    expect(isRetryableNodeError(resp)).toBe(true);
  });

  it.each([
    [{}], // no signal → don't blindly re-prompt
    [{ message: "missing required active authority" }],
    [{ message: "insufficient resource credits" }],
    [{ error: "user_cancel" }],
    [{ message: "Transaction already in the blockchain" }],
    // tightened: bare "network" and 500/"internal server error" must NOT retry —
    // they can wrap deterministic chain rejections
    [{ message: "broadcast to network failed: missing authority" }],
    [{ message: "Request failed with status code 500" }],
    [{ message: "Internal Server Error" }],
  ])("does NOT retry deterministic/cancel failure %o", (resp) => {
    expect(isRetryableNodeError(resp)).toBe(false);
  });
});
