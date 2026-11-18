import fs from "fs";
import path from "path";
import {
  extensionErrorMessage,
  isExplicitUserCancellation,
  isUserCancellation,
  isUnsentBroadcastError
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

describe("isUnsentBroadcastError", () => {
  it.each([
    [{ message: "All origin servers are unavailable" }],
    [{ error: { message: "connect ECONNREFUSED 1.2.3.4:443" } }],
    [{ message: "getaddrinfo ENOTFOUND api.example.com" }],
    // A word like "gateway" in the node's own name is not a gateway answer.
    [{ message: "getaddrinfo ENOTFOUND hive-gateway.example.com" }],
    [{ message: "connect ECONNREFUSED https://upstream-node.example.com:8090/rpc" }],
    [{ message: "getaddrinfo EAI_AGAIN upstream-node.example.com" }],
    [{ message: "getaddrinfo ENOTFOUND node1:8091" }],
  ])("retries %o: nothing reached a node", (resp) => {
    expect(isUnsentBroadcastError(resp)).toBe(true);
  });

  it.each([
    [{}], // no signal → don't blindly re-prompt
    [{ message: "missing required active authority" }],
    [{ message: "insufficient resource credits" }],
    [{ error: "user_cancel" }],
    [{ message: "Transaction already in the blockchain" }],
    [{ message: "broadcast to network failed: missing authority" }],
    [{ message: "Request failed with status code 500" }],
    [{ message: "Internal Server Error" }],
    // The first transaction may already be on chain after these; a retry
    // signs a new one the chain cannot dedupe.
    [{ message: "Request failed with status code 502" }],
    [{ message: "Request failed with status code 504" }],
    [{ message: "bad gateway" }],
    [{ error: "ETIMEDOUT" }],
    [{ message: "timeout of 30000ms exceeded" }],
    [{ error: "socket hang up" }],
    [{ message: "Failed to fetch" }],
    [{ message: "Request failed with status code 503" }],
    [{ message: "Service Unavailable" }],
    // A gateway answered: a connection phrase from upstream does not make it unsent.
    [{ message: "Request failed with status code 504", error: "Unable to connect to upstream" }],
    [{ message: "Bad Gateway: could not connect to backend" }],
    [{ error: "ECONNREFUSED after timeout" }],
    // The diagnostic itself reports a gateway error: still ambiguous.
    [{ message: "502 Bad Gateway from api.example.com: could not connect" }],
    [{ message: "Bad Gateway.Could not connect" }],
    // Endpoint names are ignored only right after a DNS or refused-connection
    // code: nothing else around them may be dropped with them.
    [{ error: { cause: { url: "https://api.hive.blog", code: "ECONNRESET" } }, message: "Unable to connect to the node" }],
    [{ error: { code: -32000, data: { url: "https://api.hive.blog", status: 504, name: "GatewayTimeout" } }, message: "Could not connect" }],
    [{ error: { config: { url: "https://api.hive.blog/" }, code: "ETIMEDOUT", detail: "could not connect" } }],
    [{ message: "Could not connect to https://api.hive.blog/:ETIMEDOUT" }],
    [{ message: "Error: Could not connect. [https://api.hive.blog](ECONNRESET)" }],
    [{ message: "Could not connect to node: requests.exceptions.ReadTimeout" }],
    [{ message: "Unable to connect: java.net.SocketTimeoutException" }],
    [{ message: "error.gateway.timeout could not connect" }],
    [{ message: "gateway.go:88: could not connect to node" }],
    [{ message: "unable to connect to upstream.rpc.internal:8090 (502)" }],
    [{ message: "getaddrinfo ENOTFOUND https://api.hive.blog/:ETIMEDOUT" }],
    [{ message: "connect ECONNREFUSED gateway.example.com:443/rpc;timeout" }],
    // A word after the code is a diagnostic, not an endpoint.
    [{ message: "broadcast failed: ECONNREFUSED ETIMEDOUT" }],
    [{ message: "failed after 3 attempts: ECONNREFUSED ECONNRESET" }],
    [{ message: "connect ECONNREFUSED timed out" }],
    [{ message: "ECONNREFUSED status code 502" }],
    [{ message: "ENOTFOUND socket hang up" }],
    [{ message: "ECONNREFUSED timeout" }],
    [{ message: "request failed: ECONNREFUSED timeout." }],
    [{ message: "connect ECONNREFUSED upstream" }],
    [{ message: "getaddrinfo ENOTFOUND api.hive.blog.Timeout" }],
    [{ error: { errors: ["ECONNREFUSED ETIMEDOUT"] } }],
    // A name that is itself a signal word is kept: no retry.
    [{ message: "getaddrinfo ENOTFOUND backend:8091" }],
    [{ message: "ECONNREFUSED http://x.example.com/504-gateway-timeout" }],
  ])("does NOT retry %o", (resp) => {
    expect(isUnsentBroadcastError(resp)).toBe(false);
  });
});
