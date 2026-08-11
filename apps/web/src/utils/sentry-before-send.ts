import type * as Sentry from "@sentry/nextjs";
import { isEmptyCaptureEvent } from "./sentry-empty-capture";
import { isDeploySkewError } from "./deploy-skew";

// Derive the exact event type Sentry's `beforeSend` hook receives, so this stays
// in lockstep with the SDK without a runtime import of @sentry/nextjs here.
type SentryErrorEvent = Parameters<NonNullable<Sentry.BrowserOptions["beforeSend"]>>[0];

/**
 * The single Sentry `beforeSend` hook for the web client — the only place EVERY
 * event passes through (render-boundary captures, global handlers, and the
 * early-error buffer all funnel here). Extracted from sentry.client.config.ts so
 * its filtering/reclassification rules are unit-testable.
 *
 * Returns the (possibly mutated) event to send, or `null` to drop it.
 */
export function beforeSend(event: SentryErrorEvent): SentryErrorEvent | null {
  // Drop value-less captures — captureException(null/undefined/"") produces a
  // synthetic exception with no message and no stack frames (zero actionable
  // info, all grouped as the "<unknown>" issue). Only empty + frame-less
  // events are dropped, so real errors (which always carry a stack or a
  // message) are never lost. See sentry-empty-capture for the exact rule.
  if (isEmptyCaptureEvent(event)) {
    return null;
  }

  const exceptionType = event.exception?.values?.[0]?.type ?? "";
  const message = event.exception?.values?.[0]?.value ?? "";
  const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
  const stackStr = JSON.stringify(frames);

  // ECENCY-NEXT-1F6Y: a DOM `Event`/`ErrorEvent` handed to captureException
  // instead of an Error. A failed resource load (<img>/<script>/<link> firing
  // `onerror`) or a promise rejected with the raw browser event reaches the SDK,
  // which wraps the non-Error input as a SYNTHETIC exception whose `type` is the
  // DOM interface name ("Event"/"ErrorEvent") and whose only frame is the SDK's
  // own capture call (no app frame, no actionable info). These are environmental
  // — overwhelmingly bot/crawler traffic failing resource fetches on post pages,
  // never an Ecency bug — and were the project's #1-volume issue, repeatedly
  // tripping the "Critical errors" alert. You never `throw new Event()`, so a real
  // error can't carry this type; we additionally require the `synthetic` flag so a
  // (hypothetical) deliberately-captured Event with real context is still kept.
  if (
    (exceptionType === "Event" || exceptionType === "ErrorEvent") &&
    event.exception?.values?.[0]?.mechanism?.synthetic
  ) {
    return null;
  }

  // Deploy/version skew: a stale tab requests a chunk whose module id changed in
  // a newer build, so the webpack runtime is handed an undefined module factory
  // (Chrome "reading 'call'", Firefox "e[c] is undefined", Safari "evaluating
  // 'e[c].call'") or a dynamic import fails. The render-boundary paths
  // (global-error.tsx, SentryErrorBoundary) already reclassify these to a single
  // low-severity "deploy-skew-auto-recovered" issue and reload — but a skew error
  // thrown from an async chunk import surfaces as `onunhandledrejection`, which
  // Sentry's GlobalHandlers integration captures DIRECTLY, bypassing those
  // boundaries and spawning a fresh error-level issue after every deploy. This is
  // the only hook that sees that path, so reclassify here too into the SAME shape
  // (so the events merge with the boundary-caught twin instead of grouping anew).
  // isDeploySkewError matches on `stack`; beforeSend frames carry `filename`, so
  // join them into a newline string. The webpack-<hash>.js frame requirement in
  // the matcher keeps this off ordinary ".call of undefined" app bugs. We keep
  // the event (at warning level) rather than dropping it so skew frequency and
  // release-spread stay visible.
  const skewCandidate = {
    message,
    stack: frames.map((f) => f.filename ?? "").join("\n")
  };
  if (isDeploySkewError(skewCandidate)) {
    event.level = "warning";
    event.tags = { ...event.tags, deploy_skew: "true" };
    event.fingerprint = ["deploy-skew-auto-recovered"];
    return event;
  }

  // ECENCY-NEXT-1AA7: an injected page script (pageHook.js / __mm__updateUrl)
  // JSON.stringify'ing a DOM node. Gate on the injected-script frame so a real
  // app-side circular-stringify bug (different frames) is still reported.
  if (
    /Converting circular structure to JSON/i.test(message) &&
    /pageHook|__mm__/i.test(stackStr)
  ) {
    return null;
  }

  // Hive RC (Resource Credits) exhaustion is an EXPECTED user condition, never an
  // Ecency bug: the user's own account is temporarily out of mana, so the chain
  // rejects the broadcast. The node phrases it several ways ("payer has not enough
  // RC mana ... has_mana", "Please wait to transact or power up HIVE", "needs <N>
  // RC"); the app normalizes all of them to an "Insufficient Resource Credits"
  // toast. Drop ALL of these regardless of the handled flag — un-awaited broadcast
  // call sites (e.g. the vote slider) surface them as `onunhandledrejection`
  // (handled=false), which the earlier "Insufficient Resource Credits"-only,
  // handled-only guard never matched (the raw RPCError carries none of that text).
  // None of these phrases appear in app code, so over-filter risk is nil.
  if (
    /has not enough RC mana|has_mana:|Insufficient Resource Credits|Please wait to transact|needs \d+ RC/i.test(
      message
    )
  ) {
    return null;
  }

  // AbortController-induced timeouts (TimeoutError / AbortError) ship
  // with no stack frames, so we can't tell which fetch is at fault.
  // Walk recent breadcrumbs for the last in-flight fetch URL and tag
  // the event so we can correlate timeouts to specific endpoints.
  // Trigger only on the canonical AbortController error names plus the
  // standard "signal timed out" phrase — a broader /aborted/i match
  // would also tag unrelated paths (transaction aborts, stream aborts).
  if (
    (exceptionType === "TimeoutError" ||
      exceptionType === "AbortError" ||
      // Wrapped form: a plain Error whose message carries the AbortError —
      // must be tagged here too or the reclassification below loses its
      // correlation tag.
      /^AbortError:/.test(message) ||
      /signal timed out/i.test(message)) &&
    !event.tags?.timeoutUrl
  ) {
    const crumbs = event.breadcrumbs ?? [];
    for (let i = crumbs.length - 1; i >= 0; i--) {
      const c = crumbs[i];
      const rawUrl = (c.data as { url?: string } | undefined)?.url;
      if (
        (c.category === "fetch" || c.category === "xhr") &&
        typeof rawUrl === "string"
      ) {
        // Strip query/hash before tagging — request URLs can carry
        // tokens or identifiers we don't want as searchable telemetry.
        let safeUrl: string;
        try {
          const parsed = new URL(rawUrl, window.location.origin);
          safeUrl = `${parsed.origin}${parsed.pathname}`;
        } catch {
          safeUrl = rawUrl.split(/[?#]/)[0] ?? "";
        }
        if (safeUrl) {
          event.tags = { ...event.tags, timeoutUrl: safeUrl.slice(0, 200) };
        }
        break;
      }
    }
  }

  // A cancellation AbortError is not a crash: the page keeps working —
  // something cancelled a fetch on purpose (React Query's cancelRefetch
  // aborting a superseded refetch, the Next router aborting a navigation
  // fetch, an unmount) and a promise nobody awaits was left holding the
  // rejection. Our own chains all consume their abort rejections (React Query
  // attaches catch handlers throughout, and the SDK's callREST rethrows
  // external aborts into an awaited chain), which is why these events' stacks
  // point at the ABORTER (query-core's abortController.abort()) rather than
  // any app frame — the leaked promise is a derived one created outside our
  // code (typically an injected fetch wrapper), and the whole family is
  // Chrome-only. RECLASSIFY (not drop) to a single low-severity fingerprint,
  // keeping the timeoutUrl tag applied above: a genuine regression that
  // floats abort rejections would still show as a spike on this fingerprint
  // instead of spawning per-page error issues. Deliberately NOT gated on
  // mechanism: most of the family arrives as onunhandledrejection, but
  // rejections from the pre-init window are replayed through captureException
  // by lazy-sentry (mechanism generic/handled:true) and must fold into the
  // same bucket — an AbortError is a cancellation by construction, whatever
  // path delivered it. TimeoutError is intentionally NOT reclassified:
  // "signal timed out" means a request genuinely exceeded its window, which
  // is node-health signal. The `^AbortError:` message form covers rejections
  // wrapped in a plain Error (e.g. "Error > AbortError: The user aborted a
  // request.").
  if (exceptionType === "AbortError" || /^AbortError:/.test(message)) {
    event.level = "warning";
    event.tags = { ...event.tags, cancellation_abort: "true" };
    event.fingerprint = ["cancellation-abort-unhandled"];
    return event;
  }

  // React 19 SSR streaming-resume ($RS) crash that FOLLOWS a hydration mismatch.
  // React #418 (text-content mismatch — commonly a browser extension or
  // auto-translate rewriting text on legacy/non-English browsers, or a residual
  // SSR locale/Date drift) tears the subtree down and regenerates it CLIENT-SIDE,
  // so the user still gets a working page; React's $RS inline resume script then
  // can't find its now-removed node and throws. Phrasings seen across engines:
  //   Chrome ≤116  "Cannot read property 'parentNode' of null"
  //   Chrome 117+  "Cannot read properties of null (reading 'parentNode')"
  //   Firefox      `can't access property "parentNode", a is null`
  //   Firefox min. "b is null"  (the resume var is minified to a single letter)
  //   Safari       "null is not an object (evaluating 'a.parentNode')"
  // RECLASSIFY (not drop) to ONE low-severity, fingerprinted issue. Sentry groups
  // $RS by the permlink in its argument, so each post page would otherwise spawn a
  // fresh error-level issue. Reclassifying stops that per-permlink spam and marks
  // it auto-recovered, while leaving the underlying #418 fully visible — so a
  // GENUINE hydration regression would still surface as a spike on this
  // fingerprint across many users/pages. The $RS-frame requirement keeps this off
  // ordinary null-access app bugs (those have no $RS in the stack).
  const isParentNodeNull =
    message.includes("reading 'parentNode'") ||
    message.includes("property 'parentNode'") ||
    message.includes('"parentNode"') ||
    /null is not an object \(evaluating '[a-z]\.parentNode'\)/.test(message);
  const isMinifiedNull =
    /^[a-z] is null$/i.test(message) || // Firefox minified "b is null"
    // Chrome minified twin — single-char property name only (the $RS resume var
    // is minified to one letter, e.g. "reading 'b'"). Multi-char names like
    // 'document'/'innerHTML' are intentionally NOT matched, so an unrelated
    // null-access that merely co-occurs with a $RS frame stays a real error.
    /Cannot read properties of null \(reading '[a-z$]'\)/i.test(message);
  if ((isParentNodeNull || isMinifiedNull) && stackStr.includes("$RS")) {
    event.level = "warning";
    event.tags = { ...event.tags, hydration_autorecovered: "true" };
    event.fingerprint = ["hydration-rs-autorecovered"];
    return event;
  }

  // iframe contentWindow teardown that FOLLOWS a React #418 hydration mismatch —
  // the iframe variant of the $RS self-heal handled just above. When hydration
  // fails React tears the tree down; an iframe's contentWindow becomes null while
  // some downstream code still reads .document off it. The user still gets a
  // working page (React regenerated the subtree client-side), so this is
  // self-healed noise, seen on ANY page that renders post content with embedded
  // iframes (profile, feeds, hot/trending, etc.).
  // Each JS engine has its own phrasing for the same null-property access:
  //   Firefox/SpiderMonkey: `can't access property "document", a.contentWindow is null`
  //   Safari/WebKit:        `null is not an object (evaluating 'a.contentWindow.document')`
  //                         (the variable is minified to a single letter)
  // V8/Chrome says "Cannot read properties of null (reading 'document')" — that
  // grammar is intentionally NOT matched here (handled by the Chrome-botnet block
  // below and by the narrowed isMinifiedNull rule above).
  // We deliberately do NOT gate on browser=Firefox/Safari — event.contexts.browser
  // is enriched server-side from the User-Agent, so it is absent in the
  // client-side beforeSend and such a gate would never match.
  // RECLASSIFY (not drop) to one fingerprinted warning, exactly like $RS: the
  // per-page error spam collapses into a single low-severity issue while a genuine
  // hydration regression still surfaces as a spike on this fingerprint.
  // TODO(hydration): investigate hydration drift — likely a locale/Date/Intl
  // mismatch or a value that differs between SSR and the first client render.
  const isIframeContentWindowNull =
    (message.includes("can't access property \"document\"") &&
      message.includes("contentWindow is null")) ||
    /null is not an object \(evaluating '[a-z]\.contentWindow\.document'\)/.test(message);
  if (isIframeContentWindowNull) {
    event.level = "warning";
    event.tags = { ...event.tags, hydration_autorecovered: "true" };
    event.fingerprint = ["hydration-iframe-autorecovered"];
    return event;
  }

  // Chrome botnet traffic - null/undefined document access from synthetic handler.
  // Two real Chrome grammars, both specific to the 'document' property:
  //   old singular (Chrome ≤90 / Chrome Mobile 79):
  //     "Cannot read property 'document' of null"   (name BEFORE "of null")
  //   modern plural (Chrome 91+):
  //     "Cannot read properties of null (reading 'document')"
  // Kept document-only on purpose: a different property (e.g. parentNode) in
  // either grammar must NOT be swept up here — those are handled elsewhere.
  if (
    /Cannot read (?:property 'document' of (?:null|undefined)|properties of (?:null|undefined) \(reading 'document'\))/.test(
      message
    ) &&
    stackStr.includes("HTMLDocument.c")
  ) {
    return null;
  }

  // ECENCY-NEXT-13K2 / ECENCY-NEXT-1GFP: a script that failed to PARSE. Engines
  // throw these SyntaxErrors at COMPILE time, so there is no JS stack. They
  // reach Sentry through exactly two shapes, matched by the frame gate below:
  //   - pre-init: the lazy-sentry early-error replay captures the raw error —
  //     ZERO frames (and mechanism/handled that look like an app capture);
  //   - post-init: GlobalHandlers' onerror sees the stackless error and
  //     synthesizes a single placeholder frame from the ErrorEvent — function
  //     "?" with the failing script URL as filename — so exactly ONE
  //     anonymous frame.
  // Two real causes, both environmental, neither an app bug:
  //   - a truncated/corrupted script download (V8 "Unexpected end of input",
  //     SpiderMonkey "missing ; after for-loop condition" / "unterminated
  //     string literal");
  //   - an old engine hitting syntax it predates in a chunk it downloaded fine
  //     (WebKit "Unexpected private name #R. Cannot parse class method with
  //     private name.", "Unexpected token '.'" for optional chaining).
  // An app-thrown SyntaxError always carries a real stack (JSON.parse & friends
  // are RUNTIME throws), and every engine's JSON grammar names JSON (V8 "is not
  // valid JSON" / "Unexpected end of JSON input", SpiderMonkey "JSON.parse: …",
  // WebKit "JSON Parse error: …") — so the frame gate + parse grammar + non-JSON
  // cannot swallow a real res.json()/JSON.parse failure, including the
  // frame-less rejection res.json() produces.
  // RECLASSIFY (not drop) to one fingerprinted warning like the skew/hydration
  // rules above: truncation volume is network weather, but a SPIKE on this
  // fingerprint after a build-tooling change would mean we shipped syntax our
  // browserslist targets cannot parse — worth keeping visible. This rule sits
  // BEFORE the chunk-corruption drop below on purpose: the drop rule would
  // silently eat the post-init single-frame shape for the commonest grammars
  // and blind that spike. Replayed early captures additionally carry the
  // failing script URL in extra.earlySource (lazy-sentry.ts) for attribution.
  const isScriptParseGrammar =
    /Unexpected (?:end of (?:input|script)|token|identifier|string|number|keyword|private name)|Invalid or unexpected token|Cannot parse (?:class method|function)|missing .+ (?:after|before)|expected expression|unterminated (?:string|regexp)/i.test(
      message
    );
  const hasNoRealFrames =
    frames.length === 0 || (frames.length === 1 && frames[0].function === "?");
  if (
    exceptionType === "SyntaxError" &&
    hasNoRealFrames &&
    isScriptParseGrammar &&
    !/JSON/i.test(message)
  ) {
    event.level = "warning";
    event.tags = { ...event.tags, script_parse_failure: "true" };
    event.fingerprint = ["script-parse-failure"];
    return event;
  }

  // Network issues corrupting JS chunk downloads. After the reclassify rule
  // above this only sees events with at least one REAL frame (or a synthetic
  // frame under a non-parse grammar) — kept as a drop for the legacy shapes
  // that still reach it.
  if (
    /^SyntaxError/.test(exceptionType) &&
    /Unexpected (end of input|token)/.test(message) &&
    /chunks?[/\\-]/.test(stackStr)
  ) {
    return null;
  }

  // ECENCY-NEXT-1GE4 / ECENCY-NEXT-1GHH: sendDataToNative accesses
  // window.webkit.messageHandlers without guarding for its existence. That
  // object is only present inside Apple's WKWebView (the Ecency native iOS
  // app); non-WKWebView browsers on iOS (e.g. Instagram or Facebook in-app
  // browsers) leave window.webkit undefined, so the unguarded access throws.
  // The stack-frame name check was dropped because minification renames
  // sendDataToNative (e.g. to "O"); the property chain in the message is NOT
  // minifiable, so it is the reliable signal. Match the exact terminated form
  // `messageHandlers')` — i.e. window.webkit itself is undefined — so a genuine
  // in-app bug such as a missing named handler (whose message instead reads
  // `...messageHandlers.<name>.postMessage')`) is still reported, not dropped.
  if (exceptionType === "TypeError" && message.includes("window.webkit.messageHandlers')")) {
    return null;
  }

  // ECENCY-NEXT-1GKP + 28 sibling buckets (issue #1433): @noble/ciphers fails its OWN
  // module-init self-test on some engines. `_polyval.js` builds a throwaway instance at
  // module evaluation (`hashCons(new Uint8Array(16), 0)`), whose GHASH constructor runs
  // `abytes(key, 16, "key")`. On the browser that reported this (a games console's
  // WebKit) the intermediate `Uint8Array.from()` returns a value that fails the library's
  // own isBytes check, so a freshly-built 16-byte array is rejected. Nothing we pass is
  // wrong and there is no fix on our side; it is an engine defect on one device family.
  // Because it throws during module evaluation the failure is per-require, so a single
  // visitor produced 29 SEPARATE issues: Sentry grouped them by the minified webpack
  // require frame, which differs per importing module. Reclassify into ONE fingerprint
  // so the fan-out stops, at warning level (the page still worked — every event is
  // handled), while a spike stays visible if this ever reaches real traffic.
  // Gated on the message alone ON PURPOSE: beforeSend runs in the browser, BEFORE
  // symbolication, so frames here carry minified chunk URLs — a `_polyval.js` frame gate
  // would look tighter and never match. The message is precise enough on its own: the
  // `"key"` title with length 16 exists only in GHASH's constructor, i.e. GCM/POLYVAL,
  // which nothing in the app calls (we use CBC, whose length-16 asserts are titled
  // "nonce"/"block"). A genuine runtime memo-encryption failure therefore still reports
  // at error level.
  if (/"key" expected Uint8Array of length 16/.test(message)) {
    event.level = "warning";
    event.tags = { ...event.tags, crypto_module_init: "true" };
    event.fingerprint = ["noble-ciphers-module-init"];
    return event;
  }

  return event;
}
