/**
 * Cloudflare Turnstile token verification.
 *
 * The widget in `features/shared/turnstile` produces a single-use token; this is the
 * half that makes it mean anything. Without a server-side siteverify call the token is
 * decoration: the subscribe relay drops unknown body fields, so shipping only the widget
 * would give a form that is harder for readers and unchanged for scripts.
 *
 * Its own module rather than an inline fetch, for one concrete reason: the route spec
 * stubs a single global fetch and indexes `mocks.fetch.mock.calls[0]` to assert the
 * newsletter request body. An inline call would take that slot and quietly turn those
 * assertions into claims about the siteverify request instead, with several still passing
 * by accident.
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable" | "unconfigured" };

/**
 * Read inside the function, never at module scope. `NEWSLETTER_API` in
 * newsletter-internal is a module-scope read and only survives its spec because that
 * file calls `vi.resetModules()` and imports the route dynamically; anything that
 * mocks without resetting modules reads a stale value. This has no such trap.
 */
export function turnstileSecret(): string | null {
  const secret = process.env.TURNSTILE_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/**
 * Error codes that mean WE are misconfigured or Cloudflare is broken, as opposed to the
 * caller presenting a bad token. They are reported as `unavailable` so a deployment
 * mistake surfaces as a retryable failure rather than accusing readers of being bots.
 */
const NOT_THE_CALLERS_FAULT = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "bad-request",
  "internal-error"
]);

/**
 * @param token the widget's single-use response token
 * @param remoteip the caller's IP when known; pass `clientIp(request)`, which already
 *   returns a validated literal or undefined, rather than re-deriving it here
 * @param action when set, the token must have been issued for this action. The newsletter
 *   and signup share one sitekey, so without this a token solved on the signup page would
 *   be spendable on the subscribe endpoint and vice versa.
 */
export async function verifyTurnstile(
  token: string,
  remoteip?: string,
  action?: string
): Promise<TurnstileResult> {
  const secret = turnstileSecret();
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (!token) return { ok: false, reason: "invalid" };

  const form = new URLSearchParams({ secret, response: token });
  if (remoteip) form.set("remoteip", remoteip);

  let res: Response;
  try {
    res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(8_000)
    });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    console.error(
      `[Turnstile] siteverify ${name === "TimeoutError" || name === "AbortError" ? "timed out" : "unreachable"}`
    );
    return { ok: false, reason: "unavailable" };
  }

  if (!res.ok) {
    console.error(`[Turnstile] siteverify upstream error ${res.status}`);
    return { ok: false, reason: "unavailable" };
  }

  const data = (await res.json().catch(() => null)) as {
    success?: boolean;
    action?: string;
    "error-codes"?: string[];
  } | null;
  if (!data) {
    console.error("[Turnstile] siteverify returned unparseable body");
    return { ok: false, reason: "unavailable" };
  }

  if (data.success !== true) {
    const codes = data["error-codes"] ?? [];
    if (codes.some((c) => NOT_THE_CALLERS_FAULT.has(c))) {
      console.error(`[Turnstile] siteverify config error: ${codes.join(",")}`);
      return { ok: false, reason: "unavailable" };
    }
    // invalid-input-response, timeout-or-duplicate: a spent, forged or expired token.
    return { ok: false, reason: "invalid" };
  }

  // A valid token for a DIFFERENT action is still a forged request here. Treated as
  // invalid rather than unavailable: the token is genuine, it just is not for us.
  if (action && data.action !== action) {
    console.error(`[Turnstile] action mismatch: expected ${action}, got ${data.action}`);
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}
