import {
  extensionErrorMessage,
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
    expect(result).toBe("trx-common.cancelled");
    expect(result).not.toContain("user_cancel");
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
