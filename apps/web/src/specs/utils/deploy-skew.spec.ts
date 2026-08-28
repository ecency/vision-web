import { afterEach, describe, it, expect, vi } from "vitest";
import { isDeploySkewError } from "@/utils/deploy-skew";

// ECENCY-NEXT-1GNZ: `hasForeignDeploymentFrame` used String.prototype.matchAll,
// which is Safari 13+. On iOS 12.5.8 the call threw a TypeError from inside
// Sentry's beforeSend, so the SDK dropped the event it was processing and
// reported that TypeError instead: every real error from those browsers was
// lost. Next's polyfill bundle carries `noModule` and Safari 12 does support
// modules, so it never loads there. These specs pin the dpl scan to APIs that
// engine has.
const OWN_RELEASE = "ecency-next@9e6dd083a2a19c103c2bf813a8bd2a8dd3ad9a83";
const OWN_CHUNK =
  "at r (https://ecency.com/_next/static/chunks/app/page-abc123.js?dpl=9e6dd083:1:2)";
const FOREIGN_CHUNK =
  "at r (https://ecency.com/_next/static/chunks/app/page-77d004dc07e923a7.js?dpl=67bf6584:1:2)";
// Neither a chunk-load message nor a webpack-factory one, so a `true` verdict
// can only have come from the dpl scan.
const MESSAGE = "(0 , y.useNewsletterEnabled) is not a function";

/**
 * Run `fn` on an engine that has no String.prototype.matchAll, i.e. Safari 12.
 * The property is removed for the call only and restored in a `finally`, so a
 * failure inside `fn` cannot leave the rest of the suite on a crippled String.
 */
function withoutMatchAll<T>(fn: () => T): T {
  const original = String.prototype.matchAll;
  delete (String.prototype as { matchAll?: unknown }).matchAll;
  try {
    return fn();
  } finally {
    Object.defineProperty(String.prototype, "matchAll", {
      value: original,
      writable: true,
      configurable: true,
      enumerable: false
    });
  }
}

describe("isDeploySkewError — foreign ?dpl frames without String.prototype.matchAll", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("still detects a foreign deployment frame (ECENCY-NEXT-1GNZ regression)", () => {
    vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
    const verdict = withoutMatchAll(() =>
      isDeploySkewError({ message: MESSAGE, stack: FOREIGN_CHUNK })
    );
    expect(verdict).toBe(true);
  });

  it("does not throw on the engine that lacks matchAll", () => {
    vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
    // The original bug was the throw itself, not a wrong verdict: it happened
    // for EVERY event, including this one where the answer is a plain false.
    expect(() =>
      withoutMatchAll(() => isDeploySkewError({ message: MESSAGE, stack: OWN_CHUNK }))
    ).not.toThrow();
  });

  it("still clears this build's own chunks", () => {
    vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
    const verdict = withoutMatchAll(() =>
      isDeploySkewError({ message: MESSAGE, stack: OWN_CHUNK })
    );
    expect(verdict).toBe(false);
  });

  it("restores String.prototype.matchAll for everything after it", () => {
    expect(typeof String.prototype.matchAll).toBe("function");
    expect([..."ab".matchAll(/[ab]/g)]).toHaveLength(2);
  });
});

describe("isDeploySkewError — the dpl scan itself", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("finds a foreign dpl that is not the first match in the stack", () => {
    // The loop must keep scanning past this build's own frames; a rewrite that
    // only ever reads the first match would pass every other spec here.
    vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
    expect(isDeploySkewError({ message: MESSAGE, stack: `${OWN_CHUNK}\n${FOREIGN_CHUNK}` })).toBe(
      true
    );
  });

  it("ignores a third-party script carrying its own dpl query", () => {
    // Only /_next/static/ chunks may vote, otherwise an unrelated vendor script
    // burns the session's one guarded reload.
    vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
    expect(
      isDeploySkewError({
        message: MESSAGE,
        stack: "at v (https://cdn.example.com/widget.js?dpl=67bf6584:1:1)"
      })
    ).toBe(false);
  });

  it("is inert when no SENTRY_RELEASE is inlined (local dev)", () => {
    vi.stubEnv("SENTRY_RELEASE", "");
    expect(isDeploySkewError({ message: MESSAGE, stack: FOREIGN_CHUNK })).toBe(false);
  });

  it("tolerates an error with no stack at all", () => {
    vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
    expect(isDeploySkewError({ message: MESSAGE })).toBe(false);
  });
});
