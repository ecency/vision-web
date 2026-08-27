import { afterEach, describe, it, expect, vi } from "vitest";
import { beforeSend } from "@/utils/sentry-before-send";

type Ev = Parameters<typeof beforeSend>[0];

function makeEvent(
  value: string,
  frames: { filename?: string; function?: string; abs_path?: string }[] = [],
  opts: { type?: string; handled?: boolean } = {}
): Ev {
  return {
    exception: {
      values: [
        {
          type: opts.type ?? "TypeError",
          value,
          stacktrace: { frames },
          ...(opts.handled !== undefined
            ? { mechanism: { type: "onunhandledrejection", handled: opts.handled } }
            : {})
        }
      ]
    }
  } as unknown as Ev;
}

const WEBPACK_FRAME = {
  filename: "app:///_next/static/chunks/webpack-9732e1c31d36b1a3.js"
};
const APP_FRAME = { filename: "app:///_next/static/chunks/app/page.js" };

describe("beforeSend — deploy-skew reclassification", () => {
  // The post-deploy cluster (ECENCY-NEXT-1FPK/1FPM/1FPN/1FPJ): a stale tab's
  // async chunk import rejects, surfacing as onunhandledrejection that bypasses
  // the React render boundaries. beforeSend must fold these into the single
  // low-severity skew issue instead of letting them spawn fresh error issues.
  it("reclassifies the Firefox webpack-factory rejection (e[c] is undefined)", () => {
    const ev = makeEvent('can\'t access property "call", e[c] is undefined', [APP_FRAME, WEBPACK_FRAME], {
      handled: false
    });
    const out = beforeSend(ev);
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.deploy_skew).toBe("true");
    expect(out!.fingerprint).toEqual(["deploy-skew-auto-recovered"]);
  });

  it("reclassifies the Chrome webpack-factory rejection (reading 'call')", () => {
    const ev = makeEvent("Cannot read properties of undefined (reading 'call')", [WEBPACK_FRAME], {
      handled: false
    });
    const out = beforeSend(ev);
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["deploy-skew-auto-recovered"]);
  });

  it("reclassifies the Safari webpack-factory rejection (evaluating 'x.call')", () => {
    const ev = makeEvent("undefined is not an object (evaluating 'e.call')", [WEBPACK_FRAME], {
      handled: false
    });
    const out = beforeSend(ev);
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["deploy-skew-auto-recovered"]);
  });

  it("reclassifies chunk-load failures even with no stack frames", () => {
    const ev = makeEvent("ChunkLoadError: Loading chunk 482 failed", [], { type: "ChunkLoadError" });
    expect(beforeSend(ev)!.fingerprint).toEqual(["deploy-skew-auto-recovered"]);
  });

  it("does NOT reclassify a real `.call of undefined` app bug with no webpack frame", () => {
    const ev = makeEvent("Cannot read properties of undefined (reading 'call')", [APP_FRAME]);
    const out = beforeSend(ev);
    expect(out).not.toBeNull();
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });

  describe("mixed-build frames (foreign ?dpl) — ECENCY-NEXT-1GNN", () => {
    const OWN_RELEASE = "ecency-next@9e6dd083a2a19c103c2bf813a8bd2a8dd3ad9a83";

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("reclassifies a chunk executing from a DIFFERENT deployment", () => {
      vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
      // The chunk loaded fine, so the symptom is a missing export in an app
      // frame — no webpack frame, no chunk-load message. Only the foreign dpl
      // in the frame URL gives it away.
      const ev = makeEvent("(0 , y.useNewsletterEnabled) is not a function", [
        { filename: "app:///_next/static/chunks/app/page-77d004dc07e923a7.js?dpl=67bf6584" }
      ]);
      const out = beforeSend(ev);
      expect(out).not.toBeNull();
      expect(out!.level).toBe("warning");
      expect(out!.tags?.deploy_skew).toBe("true");
      expect(out!.fingerprint).toEqual(["deploy-skew-auto-recovered"]);
    });

    it("reads the dpl from abs_path when filename lost the query", () => {
      vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
      const ev = makeEvent("(0 , y.useNewsletterEnabled) is not a function", [
        {
          filename: "app:///_next/static/chunks/app/page-77d004dc07e923a7.js",
          abs_path: "https://ecency.com/_next/static/chunks/app/page-77d004dc07e923a7.js?dpl=67bf6584"
        }
      ]);
      expect(beforeSend(ev)!.fingerprint).toEqual(["deploy-skew-auto-recovered"]);
    });

    it("does NOT reclassify a missing-export bug from this build's own chunks", () => {
      vi.stubEnv("SENTRY_RELEASE", OWN_RELEASE);
      const ev = makeEvent("(0 , y.someExport) is not a function", [
        { filename: "app:///_next/static/chunks/app/page-abc123.js?dpl=9e6dd083" }
      ]);
      const out = beforeSend(ev);
      expect(out).not.toBeNull();
      expect(out!.level).toBeUndefined();
      expect(out!.fingerprint).toBeUndefined();
    });
  });
});

describe("beforeSend — RC exhaustion is dropped as expected user condition", () => {
  it("drops the raw RPCError even when UNHANDLED (onunhandledrejection)", () => {
    const ev = makeEvent(
      "payer has not enough RC mana for transaction:has_mana: Account: ai-operator has 81178628 RC, needs 106812114 RC. Please wait to transact or power up HIVE.",
      [],
      { type: "RPCError", handled: false }
    );
    expect(beforeSend(ev)).toBeNull();
  });

  it("drops the legacy 'Insufficient Resource Credits' phrasing", () => {
    expect(beforeSend(makeEvent("Insufficient Resource Credits"))).toBeNull();
  });

  it("drops the 'needs <N> RC' phrasing", () => {
    expect(beforeSend(makeEvent("RPCError: ... has 1 RC, needs 248319953 RC ..."))).toBeNull();
  });

  it("anchors has_mana to the assertion form (has_mana:) and does not over-filter a bare substring", () => {
    expect(beforeSend(makeEvent("Assert Exception: transaction:has_mana: Account x"))).toBeNull();
    // A future unrelated error merely containing the substring must NOT be dropped.
    const unrelated = makeEvent("has_mana_check skipped", [APP_FRAME]);
    expect(beforeSend(unrelated)).toBe(unrelated);
  });

  it("keeps an ordinary application error untouched", () => {
    const ev = makeEvent("TypeError: cannot read foo of bar", [APP_FRAME]);
    expect(beforeSend(ev)).toBe(ev);
  });
});

describe("beforeSend — $RS hydration-resume reclassification", () => {
  // A React #418 text mismatch regenerates the subtree; React's $RS streaming-
  // resume script then throws on the removed node. Self-healed noise — reclassify
  // to one fingerprinted warning (NOT dropped), so a genuine hydration regression
  // still surfaces. Sentry groups $RS by the permlink, so the frame carries it.
  const RS_FRAME = {
    function: "$RS",
    filename: "app:///@storicious/re-barski-202662t14550715z"
  } as unknown as { filename?: string };

  it("reclassifies Firefox minified 'b is null' inside a $RS frame", () => {
    const out = beforeSend(makeEvent("b is null", [RS_FRAME]));
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.hydration_autorecovered).toBe("true");
    expect(out!.fingerprint).toEqual(["hydration-rs-autorecovered"]);
  });

  it("reclassifies the Chrome MINIFIED single-letter null read inside $RS", () => {
    // Exercises the isMinifiedNull second branch specifically (the minified
    // resume var, not the literal 'parentNode' covered by isParentNodeNull).
    const out = beforeSend(makeEvent("Cannot read properties of null (reading 'b')", [RS_FRAME]));
    expect(out!.fingerprint).toEqual(["hydration-rs-autorecovered"]);
    expect(out!.level).toBe("warning");
  });

  it("reclassifies the literal parentNode-null phrasing inside $RS (isParentNodeNull)", () => {
    const out = beforeSend(
      makeEvent("Cannot read properties of null (reading 'parentNode')", [RS_FRAME])
    );
    expect(out!.fingerprint).toEqual(["hydration-rs-autorecovered"]);
  });

  it("reclassifies the Firefox parentNode phrasing inside $RS (ECENCY-NEXT-1C6V)", () => {
    // The exact payload of ECENCY-NEXT-1C6V. SpiderMonkey quotes the property
    // name with ASCII straight double-quotes, NOT typographic curly ones — this
    // pins the `includes('"parentNode"')` branch against a refactor that assumes
    // otherwise.
    const out = beforeSend(makeEvent('can\'t access property "parentNode", b is null', [RS_FRAME]));
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["hydration-rs-autorecovered"]);
  });

  it("does NOT over-match a multi-char null read even with a $RS frame", () => {
    // The narrowed single-char regex must leave a real "(reading 'document')"
    // bug as an error, even if a $RS frame happens to be on the stack.
    const ev = makeEvent("Cannot read properties of null (reading 'document')", [RS_FRAME]);
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT touch a real 'b is null' app bug with no $RS frame", () => {
    const ev = makeEvent("b is null", [APP_FRAME]);
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });
});

describe("beforeSend — Chrome botnet 'document' access is dropped", () => {
  // Synthetic botnet handler reads .document off a null/undefined receiver.
  // Two real Chrome grammars must both be dropped, but only for 'document'.
  const BOTNET_FRAME = { function: "HTMLDocument.c" } as unknown as { filename?: string };

  it("drops the modern plural format (Chrome 91+)", () => {
    const ev = makeEvent("Cannot read properties of null (reading 'document')", [BOTNET_FRAME]);
    expect(beforeSend(ev)).toBeNull();
  });

  it("drops the old singular format (Chrome ≤90 / Chrome Mobile 79)", () => {
    const ev = makeEvent("Cannot read property 'document' of null", [BOTNET_FRAME]);
    expect(beforeSend(ev)).toBeNull();
  });

  it("drops the 'undefined' variant of the singular format", () => {
    const ev = makeEvent("Cannot read property 'document' of undefined", [BOTNET_FRAME]);
    expect(beforeSend(ev)).toBeNull();
  });

  it("does NOT over-match a different property (parentNode) with the same frame", () => {
    // Guards the document-only intent: making the (reading '…') clause loose
    // would wrongly sweep up parentNode null-reads too.
    const ev = makeEvent("Cannot read properties of null (reading 'parentNode')", [BOTNET_FRAME]);
    expect(beforeSend(ev)).toBe(ev);
  });

  it("does NOT drop the document read without the synthetic botnet frame", () => {
    const ev = makeEvent("Cannot read properties of null (reading 'document')", [APP_FRAME]);
    expect(beforeSend(ev)).toBe(ev);
  });
});

describe("beforeSend — webkit.messageHandlers (non-WKWebView) is dropped", () => {
  // ECENCY-NEXT-1GE4 / ECENCY-NEXT-1GHH: window.webkit exists only inside
  // Apple's WKWebView, so the native-bridge helper sendDataToNative throws when
  // the page runs in a non-WKWebView (e.g. the Instagram or Facebook in-app
  // browser on iOS). Not an Ecency app bug — dropped as noise. The stack-frame
  // check was removed (minification renames sendDataToNative, e.g. to "O"); the
  // message's property chain is the reliable, non-minifiable signal. The match
  // is scoped to a TypeError whose message ends `messageHandlers')` (window.webkit
  // itself undefined), so a genuine in-app missing-handler bug is still reported.
  const MSG = "undefined is not an object (evaluating 'window.webkit.messageHandlers')";
  const NATIVE_FRAME = { function: "sendDataToNative", filename: APP_FRAME.filename };
  const MINIFIED_FRAME = { function: "O", filename: APP_FRAME.filename };

  it("drops the webkit.messageHandlers TypeError thrown from sendDataToNative", () => {
    expect(beforeSend(makeEvent(MSG, [NATIVE_FRAME]))).toBeNull();
  });

  it("drops the webkit.messageHandlers TypeError when the frame is minified", () => {
    expect(beforeSend(makeEvent(MSG, [MINIFIED_FRAME]))).toBeNull();
  });

  it("drops a webkit.messageHandlers error even without a matching stack frame", () => {
    expect(beforeSend(makeEvent(MSG, [APP_FRAME]))).toBeNull();
  });

  it("does NOT drop an unrelated error coming from a sendDataToNative frame", () => {
    const ev = makeEvent("TypeError: foo is not a function", [NATIVE_FRAME]);
    expect(beforeSend(ev)).toBe(ev);
  });

  it("does NOT drop a real in-app bug where a named handler is missing", () => {
    // window.webkit IS present here (real WKWebView); the failing access is a
    // missing named handler, so the message reads `...messageHandlers.<name>...`
    // rather than the terminated `messageHandlers')`. That is an actionable bug.
    const ev = makeEvent(
      "undefined is not an object (evaluating 'window.webkit.messageHandlers.share.postMessage')",
      [NATIVE_FRAME]
    );
    expect(beforeSend(ev)).toBe(ev);
  });
});

describe("beforeSend — synthetic DOM Event capture is dropped", () => {
  // ECENCY-NEXT-1F6Y: captureException handed a DOM `Event`/`ErrorEvent` instead
  // of an Error (failed resource load onerror, or a promise rejected with the raw
  // browser event). The SDK wraps the non-Error input as a SYNTHETIC exception
  // whose `type` is the DOM interface name and whose only frame is its own capture
  // call. No app frame, no actionable info, overwhelmingly bot/crawler traffic —
  // dropped as noise. Requires BOTH the DOM type AND the synthetic flag.
  function makeSynthetic(
    type: "Event" | "ErrorEvent",
    opts: { synthetic?: boolean; frames?: { filename?: string }[] } = {}
  ): Ev {
    return {
      exception: {
        values: [
          {
            type,
            value: `Event \`${type}\` (type=error) captured as exception`,
            stacktrace: { frames: opts.frames ?? [{ filename: "@sentry/core/exports.js" }] },
            mechanism: { type: "generic", handled: true, synthetic: opts.synthetic ?? true }
          }
        ]
      }
    } as unknown as Ev;
  }

  it("drops a synthetic DOM Event captured as exception", () => {
    expect(beforeSend(makeSynthetic("Event"))).toBeNull();
  });

  it("drops a synthetic ErrorEvent captured as exception", () => {
    expect(beforeSend(makeSynthetic("ErrorEvent"))).toBeNull();
  });

  it("does NOT drop a DOM-Event-typed exception that is NOT synthetic", () => {
    // Without the synthetic flag we can't be sure the SDK fabricated it from a
    // non-Error input, so keep it rather than risk dropping a real capture.
    const ev = makeSynthetic("Event", { synthetic: false, frames: [APP_FRAME] });
    expect(beforeSend(ev)).toBe(ev);
  });

  it("does NOT drop a synthetic capture whose type is a real Error", () => {
    // `synthetic: true` alone (e.g. a captured non-Error string/object the app
    // threw with context) must NOT be swept up — only DOM Event types are.
    const ev = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "boom",
            stacktrace: { frames: [APP_FRAME] },
            mechanism: { type: "generic", handled: true, synthetic: true }
          }
        ]
      }
    } as unknown as Ev;
    expect(beforeSend(ev)).toBe(ev);
  });
});

describe("beforeSend — frame-less script-parse SyntaxError is reclassified", () => {
  // ECENCY-NEXT-13K2 / ECENCY-NEXT-1GFP: engines throw parse-time SyntaxErrors
  // while COMPILING a script, so there is no JS stack — the event arrives with
  // zero frames and the frame-gated chunk rule can't take it. Environmental
  // (truncated download, or an old engine hitting syntax it predates), so it is
  // reclassified (NOT dropped) to one fingerprinted warning: a spike would mean
  // we shipped syntax our browserslist targets can't parse.
  const parseEvent = (msg: string) => makeEvent(msg, [], { type: "SyntaxError" });

  it("reclassifies the V8 truncation grammar (Unexpected end of input)", () => {
    const out = beforeSend(parseEvent("Unexpected end of input"));
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.script_parse_failure).toBe("true");
    expect(out!.fingerprint).toEqual(["script-parse-failure"]);
  });

  it("reclassifies the SpiderMonkey truncation grammar (missing ; after for-loop condition)", () => {
    const out = beforeSend(parseEvent("missing ; after for-loop condition"));
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["script-parse-failure"]);
  });

  it("reclassifies the WebKit private-name grammar (old engine, modern syntax)", () => {
    const out = beforeSend(
      parseEvent("Unexpected private name #R. Cannot parse class method with private name.")
    );
    expect(out!.fingerprint).toEqual(["script-parse-failure"]);
  });

  it("reclassifies the WebKit method-parameter grammar", () => {
    const out = beforeSend(
      parseEvent("Unexpected token '='. Expected an opening '(' before a method's parameter list.")
    );
    expect(out!.fingerprint).toEqual(["script-parse-failure"]);
  });

  it("reclassifies optional chaining on a pre-chaining engine (Unexpected token '.')", () => {
    const out = beforeSend(parseEvent("Unexpected token '.'"));
    expect(out!.fingerprint).toEqual(["script-parse-failure"]);
  });

  it("does NOT touch a frame-less V8 JSON.parse failure ('is not valid JSON')", () => {
    // res.json() on an HTML error page — a REAL signal about an API response,
    // and V8 creates it with no JS frames on the stack. Must stay an error.
    const ev = parseEvent("Unexpected token '<', \"<html>…\" is not valid JSON");
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT touch the older V8 JSON grammar (Unexpected end of JSON input)", () => {
    const ev = parseEvent("Unexpected end of JSON input");
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT touch the SpiderMonkey JSON.parse grammar", () => {
    // beforeSend mutates in place and returns the SAME reference, so toBe alone
    // is vacuous — the level/fingerprint assertions are what pin "untouched".
    const ev = parseEvent("JSON.parse: unexpected end of data at line 1 column 1 of the JSON data");
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT touch a SyntaxError WITH frames (runtime throw from app code)", () => {
    // A constructed/thrown SyntaxError always has a stack; only compile-time
    // parse failures are frame-less. Non-chunk filename so the frame-gated
    // chunk rule doesn't take it either.
    const ev = makeEvent("Unexpected token ')'", [{ filename: "app:///src/utils/template.ts" }], {
      type: "SyntaxError"
    });
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT touch a frame-less SyntaxError with a NON-parse grammar", () => {
    // e.g. an invalid-selector DOMException surfaced with name SyntaxError —
    // not a script-parse failure, so it must stay a real error.
    const ev = parseEvent("'##bad' is not a valid selector");
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT touch a frame-less parse grammar under a different exception type", () => {
    const ev = makeEvent("Unexpected end of input", [], { type: "TypeError" });
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });

  // POST-init the same parse failures arrive through GlobalHandlers' onerror,
  // which synthesizes exactly one placeholder frame — function "?" with the
  // failing script URL — for a stackless error. The rule must take that shape
  // too, and must take it BEFORE the chunk-corruption drop rule (which would
  // otherwise silently eat the commonest grammars and blind the fingerprint).
  const SYNTHETIC_ONERROR_FRAME = {
    filename: "app:///_next/static/chunks/5678-fedcba.js",
    function: "?"
  };

  it("reclassifies the post-init single-synthetic-frame shape (WebKit private name)", () => {
    const out = beforeSend(
      makeEvent(
        "Unexpected private name #R. Cannot parse class method with private name.",
        [SYNTHETIC_ONERROR_FRAME],
        { type: "SyntaxError" }
      )
    );
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["script-parse-failure"]);
  });

  it("reclassifies (not drops) the post-init truncation shape despite the chunk frame", () => {
    // Ordering guard: with one synthetic chunks/ frame and an "Unexpected end
    // of input" message, the chunk-corruption rule would DROP this — the
    // reclassify rule must win so the fingerprint keeps its volume visible.
    const out = beforeSend(
      makeEvent("Unexpected end of input", [SYNTHETIC_ONERROR_FRAME], { type: "SyntaxError" })
    );
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["script-parse-failure"]);
  });

  it("does NOT take a single REAL frame (named function) — parse errors never have one", () => {
    // A single NAMED frame means a runtime throw, not a compile failure. Non-
    // chunk filename so the chunk-drop rule doesn't take it either; it must
    // pass through untouched.
    const ev = makeEvent("Unexpected token ')'", [
      { filename: "app:///src/utils/template.ts", function: "renderTemplate" }
    ], { type: "SyntaxError" });
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });
});

describe("beforeSend — Firefox iframe contentWindow-null teardown is reclassified", () => {
  // ECENCY-NEXT-1FGA: the iframe variant of the $RS #418 self-heal above. After a
  // Firefox hydration mismatch an iframe's contentWindow is null while downstream
  // code reads .document off it; React already regenerated the subtree, so it is
  // self-healed noise — reclassified (NOT dropped) to one fingerprinted warning so
  // a genuine hydration regression still spikes. Matched on SpiderMonkey's engine-
  // specific phrasing (both substrings), NOT on browser=Firefox: contexts.browser
  // is enriched server-side and is ABSENT in client-side beforeSend, so the
  // fixtures here omit it on purpose — injecting it would mask a re-introduced
  // dead browser gate (the bug this branch originally shipped with).
  const FF_MSG = 'can\'t access property "document", a.contentWindow is null';

  function makeClientEvent(value: string, url: string): Ev {
    return {
      exception: {
        values: [{ type: "TypeError", value, stacktrace: { frames: [APP_FRAME] } }]
      },
      request: { url }
    } as unknown as Ev;
  }

  it("reclassifies to a fingerprinted warning on a NON-profile page (broadened, e.g. /hot/1am)", () => {
    const out = beforeSend(makeClientEvent(FF_MSG, "https://ecency.com/hot/1am"));
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.hydration_autorecovered).toBe("true");
    expect(out!.fingerprint).toEqual(["hydration-iframe-autorecovered"]);
  });

  it("reclassifies with NO browser context present (the dead /Firefox/ gate is gone)", () => {
    // Regression guard: client-side beforeSend never sees contexts.browser, so the
    // match must not depend on it. Re-adding a browserName gate would fail this.
    const out = beforeSend(makeClientEvent(FF_MSG, "https://ecency.com/@user/some-post"));
    expect(out!.fingerprint).toEqual(["hydration-iframe-autorecovered"]);
  });

  it("does NOT touch the V8/Chrome phrasing of the same null-document access", () => {
    // V8 says "Cannot read properties of null (reading 'document')" — different
    // engine grammar, so the Firefox-phrasing match must leave it alone (and with
    // no HTMLDocument.c frame the Chrome-botnet block below won't take it either).
    const ev = makeClientEvent(
      "Cannot read properties of null (reading 'document')",
      "https://ecency.com/hot/1am"
    );
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT match when only one of the two required substrings is present", () => {
    // Locks in the AND specificity: a Firefox null-access on a DIFFERENT property
    // (no "contentWindow is null") stays a real error.
    const ev = makeClientEvent(
      'can\'t access property "document", foo is null',
      "https://ecency.com/hot/1am"
    );
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.fingerprint).toBeUndefined();
  });

  it("does NOT match Firefox phrasing for a DIFFERENT property on a null contentWindow", () => {
    // Twin of the Safari different-property guard below, for the SpiderMonkey
    // grammar. The accessed property must be `document` itself — a null-access on
    // a property whose name merely CONTAINS "document" (documentElement,
    // ownerDocument) is a different bug and must stay a real error.
    // Regression guard for a proposed relaxation to
    //   includes("can't access property") && includes("document")
    // which reclassified this case into the hydration bucket and hid it.
    const ev = makeClientEvent(
      'can\'t access property "documentElement", a.contentWindow is null',
      "https://ecency.com/hot/1am"
    );
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.level).toBeUndefined();
    expect(ev.fingerprint).toBeUndefined();
  });

  it("reclassifies the Safari/WebKit phrasing (ECENCY-NEXT-1G9Z)", () => {
    // Safari says: null is not an object (evaluating 'a.contentWindow.document')
    // where the variable is minified to a single letter.
    const out = beforeSend(
      makeClientEvent(
        "null is not an object (evaluating 'a.contentWindow.document')",
        "https://ecency.com/@sochimasazzy/the-rich-kids-high-school-chapter-2-short-fiction-story"
      )
    );
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.hydration_autorecovered).toBe("true");
    expect(out!.fingerprint).toEqual(["hydration-iframe-autorecovered"]);
  });

  it("does NOT match Safari phrasing for a DIFFERENT contentWindow property", () => {
    // Guards the contentWindow.document-only intent: accessing a different property
    // (e.g. contentWindow.location) on a null iframe must NOT be swept up.
    const ev = makeClientEvent(
      "null is not an object (evaluating 'a.contentWindow.location')",
      "https://ecency.com/hot/1am"
    );
    expect(beforeSend(ev)).toBe(ev);
    expect(ev.fingerprint).toBeUndefined();
  });
});

describe("beforeSend — unhandled cancellation AbortError is reclassified", () => {
  // The chronic AbortError family (ECENCY-NEXT-13T7/1GHQ/KE4/1BRF/1ABA/1GEM/M4Q):
  // a deliberate fetch cancellation (React Query cancelRefetch, router
  // navigation abort, unmount) whose DOMException is left on a promise nobody
  // awaits. First-party chains all consume their abort rejections, so the
  // leaked promise is a derived one created outside app code; the events'
  // stacks name the aborter, not an app bug. Reclassified (NOT dropped) to one
  // fingerprinted warning so a genuine floating-abort regression still spikes.
  it("reclassifies the Chrome DOMException phrasing (signal is aborted without reason)", () => {
    const ev = makeEvent("signal is aborted without reason", [], {
      type: "AbortError",
      handled: false
    });
    const out = beforeSend(ev);
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.cancellation_abort).toBe("true");
    expect(out!.fingerprint).toEqual(["cancellation-abort-unhandled"]);
  });

  it("reclassifies the other engine phrasings under the AbortError type", () => {
    for (const msg of [
      "Fetch is aborted",
      "The operation was aborted. ",
      "The user aborted a request."
    ]) {
      const out = beforeSend(makeEvent(msg, [], { type: "AbortError", handled: false }));
      expect(out!.level).toBe("warning");
      expect(out!.fingerprint).toEqual(["cancellation-abort-unhandled"]);
    }
  });

  it("reclassifies the plain-Error wrap whose message is prefixed 'AbortError:'", () => {
    // ECENCY-NEXT-M4Q shape: the rejection reason was wrapped in a plain Error,
    // so the exception type is Error and only the message carries AbortError.
    // The wrapped form must ALSO pass the timeoutUrl tagging block above the
    // reclassification — a gap there would strip these events of their
    // correlation tag.
    const ev = makeEvent("AbortError: The user aborted a request.", [], {
      type: "Error",
      handled: false
    });
    (ev as any).breadcrumbs = [
      {
        category: "fetch",
        data: { url: "https://api.example.com/hafah-api/accounts/alice/operations?page=2" }
      }
    ];
    const out = beforeSend(ev);
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["cancellation-abort-unhandled"]);
    expect(out!.tags?.timeoutUrl).toBe(
      "https://api.example.com/hafah-api/accounts/alice/operations"
    );
  });

  it("keeps the timeoutUrl breadcrumb tag on the reclassified event", () => {
    // The tagging block above the reclassification must still run, and the
    // query string must still be stripped from the tagged URL.
    const ev = makeEvent("signal is aborted without reason", [], {
      type: "AbortError",
      handled: false
    });
    (ev as any).breadcrumbs = [
      {
        category: "fetch",
        data: { url: "https://api.example.com/hafah-api/accounts/alice/operations?page=2" }
      }
    ];
    const out = beforeSend(ev);
    expect(out!.tags?.timeoutUrl).toBe("https://api.example.com/hafah-api/accounts/alice/operations");
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["cancellation-abort-unhandled"]);
  });

  it("reclassifies the lazy-sentry replay shape too (mechanism generic/handled)", () => {
    // Rejections from the pre-init window are replayed through
    // captureException (mechanism generic/handled:true) — same cancellation,
    // same bucket. An AbortError is a cancellation whatever path delivered it.
    const ev = makeEvent("signal is aborted without reason", [], { type: "AbortError" });
    (ev as any).exception.values[0].mechanism = { type: "generic", handled: true };
    const out = beforeSend(ev);
    expect(out!.level).toBe("warning");
    expect(out!.fingerprint).toEqual(["cancellation-abort-unhandled"]);
  });

  it("does NOT reclassify an unhandled TimeoutError (genuine node-health signal)", () => {
    // "signal timed out" means a request exceeded its window — that volume is
    // how slow nodes surface; it must not be folded into cancellation noise.
    const ev = makeEvent("signal timed out", [], { type: "TimeoutError", handled: false });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });

  it("does NOT reclassify an ordinary Error merely mentioning an abort mid-message", () => {
    const ev = makeEvent("upload failed: request aborted by server", [], {
      type: "Error",
      handled: false
    });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });
});

describe("beforeSend — @noble/ciphers module-init self-test failure is reclassified", () => {
  // ECENCY-NEXT-1GKP and 28 siblings (issue #1433). One visitor on a games-console
  // browser produced 29 separate issues, because the throw happens while a module is
  // being required and Sentry grouped on the minified require frame — which differs per
  // importing module. One fingerprint, one bucket.
  const NOBLE_MESSAGE = '"key" expected Uint8Array of length 16, got type=object';

  it("reclassifies the module-init assertion into a single fingerprint", () => {
    const ev = makeEvent(NOBLE_MESSAGE, [WEBPACK_FRAME, APP_FRAME], {
      type: "Error",
      handled: true
    });
    const out = beforeSend(ev);
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.crypto_module_init).toBe("true");
    expect(out!.fingerprint).toEqual(["noble-ciphers-module-init"]);
  });

  it("groups every importing module's copy into the SAME bucket", () => {
    // The 29 buckets differed only by which module the require chain was in, i.e.
    // by frames, so the rule must not read frames at all.
    const a = beforeSend(
      makeEvent(NOBLE_MESSAGE, [WEBPACK_FRAME], { type: "Error", handled: true })
    );
    const b = beforeSend(
      makeEvent(NOBLE_MESSAGE, [{ filename: "app:///_next/static/chunks/4821-abc.js" }], {
        type: "Error",
        handled: true
      })
    );
    expect(a!.fingerprint).toEqual(["noble-ciphers-module-init"]);
    expect(b!.fingerprint).toEqual(a!.fingerprint);
  });

  it("does NOT downgrade an UNHANDLED copy of the same assertion", () => {
    // Every observed event was caught and the page kept working, which is what makes
    // warning honest. An unhandled one escaped, so it may have taken a chunk down with
    // it: that must stay an error with its own grouping, not be buried in this bucket.
    const ev = makeEvent(NOBLE_MESSAGE, [WEBPACK_FRAME], { type: "Error", handled: false });
    const out = beforeSend(ev);
    expect(out).not.toBeNull();
    expect(out!.level).toBeUndefined();
    expect(out!.tags?.crypto_module_init).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });

  it("does NOT downgrade when the mechanism is absent (no evidence it was caught)", () => {
    const ev = makeEvent(NOBLE_MESSAGE, [WEBPACK_FRAME], { type: "Error" });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });

  it("does NOT touch the CBC runtime path's length-16 assertion (titled 'nonce')", () => {
    // aes.js asserts `abytes(nonce, BLOCK_SIZE, "nonce")` — a real bug in our memo
    // encryption must stay an error-level issue with its own grouping.
    // handled: true on purpose, so this proves the MESSAGE gate rejects it rather than
    // passing only because the mechanism gate did.
    const ev = makeEvent('"nonce" expected Uint8Array of length 16, got type=undefined', [], {
      type: "Error",
      handled: true
    });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });

  it("does NOT touch an untitled Uint8Array assertion (bad key handed to encrypt)", () => {
    const ev = makeEvent("expected Uint8Array, got type=string", [], {
      type: "Error",
      handled: true
    });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });
});

describe("beforeSend — browser-injected stack overflow is reclassified", () => {
  // ECENCY-NEXT-1GP9 and 16 siblings (issue #1699). Google's iOS browsers inject a
  // script that recurses over the DOM until the stack blows. Being inline it has no
  // URL of its own, so WebKit attributes every frame to the PAGE URL, which is also
  // what Sentry groups on: one visitor produced 12 issues in a single session.
  const OVERFLOW = "Maximum call stack size exceeded.";
  const injectedFrames = (page: string) => [
    { filename: `app:///${page}`, function: "Gk", abs_path: `app:///${page}` },
    { filename: `app:///${page}`, function: "Ik", abs_path: `app:///${page}` }
  ];

  it("reclassifies the injected-script recursion into a single fingerprint", () => {
    const ev = makeEvent(OVERFLOW, injectedFrames("@wotjsozm/following"), {
      type: "RangeError",
      handled: false
    });
    const out = beforeSend(ev);
    expect(out).not.toBeNull();
    expect(out!.level).toBe("warning");
    expect(out!.tags?.injected_script_overflow).toBe("true");
    expect(out!.fingerprint).toEqual(["browser-injected-stack-overflow"]);
  });

  it("groups every page URL into the SAME bucket (the fan-out this fixes)", () => {
    const a = beforeSend(
      makeEvent(OVERFLOW, injectedFrames("@wotjsozm/following"), { type: "RangeError" })
    );
    const b = beforeSend(
      makeEvent(OVERFLOW, injectedFrames("@dasunkwo/my-poetry"), { type: "RangeError" })
    );
    expect(a!.fingerprint).toEqual(["browser-injected-stack-overflow"]);
    expect(b!.fingerprint).toEqual(a!.fingerprint);
  });

  it("catches the frame-less copy (ECENCY-NEXT-MC8's single unparsed frame)", () => {
    // The long-running bucket carries one frame whose filename is the literal
    // string "undefined". Nothing to act on, so it belongs in the same bucket.
    const ev = makeEvent(OVERFLOW, [{ filename: "undefined" }], { type: "RangeError" });
    const out = beforeSend(ev);
    expect(out!.fingerprint).toEqual(["browser-injected-stack-overflow"]);
  });

  it("does NOT touch a real overflow recursing inside our own bundle", () => {
    // A runaway recursion in app code always carries chunk frames: it must stay an
    // error-level issue with its own grouping.
    const ev = makeEvent(OVERFLOW, [APP_FRAME, APP_FRAME], { type: "RangeError" });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.tags?.injected_script_overflow).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });

  it("does NOT touch a mixed stack where our code appears even once", () => {
    const ev = makeEvent(OVERFLOW, [...injectedFrames("@wotjsozm/following"), WEBPACK_FRAME], {
      type: "RangeError"
    });
    const out = beforeSend(ev);
    expect(out!.fingerprint).toBeUndefined();
  });

  it("reads abs_path too, not just filename", () => {
    const ev = makeEvent(
      OVERFLOW,
      [{ abs_path: "app:///_next/static/chunks/9959-4f643fb493706780.js" }],
      { type: "RangeError" }
    );
    const out = beforeSend(ev);
    expect(out!.fingerprint).toBeUndefined();
  });

  it("does NOT touch a different RangeError with no app frames", () => {
    // e.g. `new Array(-1)` from a third-party script: not this family, not this bucket.
    const ev = makeEvent("Invalid array length", injectedFrames("@wotjsozm"), {
      type: "RangeError"
    });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });

  it("collapses a copy that arrives wrapped as a plain Error (no RangeError type)", () => {
    // The rule reads the message, not the exception type: the phrase is engine-thrown
    // and appears in none of our own throw sites.
    const ev = makeEvent(OVERFLOW, injectedFrames("@wotjsozm"), { type: "Error" });
    const out = beforeSend(ev);
    expect(out!.fingerprint).toEqual(["browser-injected-stack-overflow"]);
  });

  it("does NOT touch the Firefox phrasing of a recursion limit", () => {
    // "InternalError: too much recursion" was never observed in this family (it is
    // exclusively Google's iOS browsers), so it stays reported as it arrives.
    const ev = makeEvent("too much recursion", injectedFrames("@wotjsozm"), {
      type: "InternalError"
    });
    const out = beforeSend(ev);
    expect(out!.level).toBeUndefined();
    expect(out!.fingerprint).toBeUndefined();
  });
});
