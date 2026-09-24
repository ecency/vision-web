// Redaction of secrets that travel IN URLs, applied to Sentry events and
// breadcrumbs before they leave the process (issue #1651).
//
// Sentry's breadcrumbs integration records fetch/XHR/navigation URLs verbatim,
// and the same URL can resurface in `request.url`, a Referer header, an error
// message or an `extra` value. Everything here is pure string work with no
// browser or Node globals, so the client, server and edge configs share it.

const FILTERED = "[Filtered]";

// Path routes whose remainder IS the credential, matched on any host:
//   - `/hs/<token>`: imagehoster upload (SDK `uploadImage` on i.ecency.com and
//     the app's own `api/misc.ts` on `defaults.imageServer`). The token is the
//     user's access token. `/hs/@author/permlink` is also an ordinary Ecency
//     tag route, so a remainder starting with `@` is left alone.
//   - `/newsletter/confirm/<token>`, `/newsletter/unsubscribe/<token>`: the
//     emailed newsletter links, as a page and under `/api/newsletter/`.
// Everything up to the query, hash, whitespace or a quote is redacted, so a
// token that contains `/` cannot leak its tail.
const SECRET_PATH_RE = /(\/(?:hs|newsletter\/(?:confirm|unsubscribe))\/)(?!@)[^?#\s"'<>]+/gi;

// Query or fragment parameters that carry credentials: the HiveSigner `code`
// on /auth and create-hs, `access_token`/`refresh_token` on OAuth redirects,
// the Mattermost websocket `token`, `client_secret` on the server-side token
// exchange, and the generic names a future endpoint is likely to use. Any
// name ENDING in `_secret` or `_token` matches too, e.g. Stripe's
// `payment_intent_client_secret` on the points-gift return URL. Pagination
// cursors (`page_token`, `next_token`, `continuation_token`) are not
// credentials and are what makes a paging bug debuggable, so they are kept.
const SECRET_PARAM_NAMES =
  "access_token|refresh_token|id_token|token|code|secret|password|api_key|apikey|key|signature|sig|(?!(?:page|next|continuation)_token\\b)[a-z0-9_.-]*_(?:secret|token)";
const SECRET_PARAM_RE = new RegExp(`([?&#](?:${SECRET_PARAM_NAMES})=)[^&#\\s"'<>]*`, "gi");
const SECRET_PARAM_NAME_RE = new RegExp(`^(?:${SECRET_PARAM_NAMES})$`, "i");

/** Redact every known secret-in-URL shape inside `value` (a URL or free text). */
export function scrubUrlSecrets(value: string): string {
  return value.replace(SECRET_PATH_RE, `$1${FILTERED}`).replace(SECRET_PARAM_RE, `$1${FILTERED}`);
}

// A bare query string (`code=X&y=1`, as Sentry stores `query_string` and OTel
// stores `url.query`) has no leading `?` for the first parameter to anchor on.
function scrubQueryString(value: string): string {
  if (value.startsWith("?")) return scrubUrlSecrets(value);
  return scrubUrlSecrets(`?${value}`).slice(1);
}

// A JSON member whose name is a secret parameter: `"code": "..."`.
const SECRET_JSON_MEMBER_RE = new RegExp(
  `("(?:${SECRET_PARAM_NAMES})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`,
  "gi"
);

// A request body captured as a string: form-encoded (`code=X&y=1`) or JSON.
function scrubBody(value: string): string {
  return scrubQueryString(value).replace(SECRET_JSON_MEMBER_RE, `$1"${FILTERED}"`);
}

// Sentry's own serialization limits (`normalizeDepth` 3 and
// `normalizeMaxBreadth` 1000; none of our configs override them). Sentry
// normalizes breadcrumb data, extra, contexts, contexts.trace.data and
// span data with these before the event is sent (@sentry/core
// utils/prepareEvent.js normalizeEvent). In utils-hoist/normalize.js visit(),
// a container past the depth becomes the string "[Object]"/"[Array]" and
// entries past the breadth are cut at "[MaxProperties ~]", so nothing beyond
// these bounds is sent, raw or otherwise, and walking it would only cost
// main-thread time. Strings are kept at ANY depth by visit(), so a string one
// level past the last walked container is still scrubbed below.
const NORMALIZE_DEPTH = 3;
const NORMALIZE_MAX_BREADTH = 1000;
// Two contexts escape the bound above (same normalizeEvent): `contexts.trace`
// is put back RAW after normalizing (only its `.data` is re-normalized), and
// `contexts.flags` is normalized from its own root. The raw trace, like the
// never-normalized `request`, is walked from its own root to this deeper
// bound instead (still finite, so a cycle cannot recurse forever).
const RAW_DEPTH = 10;

function isPlainContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  if (Array.isArray(v)) return true;
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// The plain shape Sentry's normalize gives an Error (convertToPlainObject):
// name, message and stack, which are not enumerable, plus own properties.
function errorToPlain(err: Error): Record<string, unknown> {
  return { ...err, name: err.name, message: err.message, stack: err.stack };
}

/**
 * Return `value` with every secret-bearing string scrubbed, COPY-ON-WRITE:
 * a container is never written to. When something inside it changes, a
 * scrubbed clone is returned instead, and an unchanged value comes back as
 * the same reference. This matters because these objects are often still
 * the app's: console breadcrumb `data.arguments` are the exact values passed
 * to console.* (the handler runs BEFORE the real console call), consoleHistory
 * entries are a live buffer, and a server request's headers are `req.headers`.
 * `key` is the property name, so a bare query string (`code=X&y=1`, as OTel
 * stores `url.query`) is matched without its leading `?`.
 */
interface ScrubOptions {
  maxDepth: number;
  // Also redact any string whose property NAME is a secret parameter
  // (`{ code: "..." }`). Only for request bodies: elsewhere a `code` or `key`
  // field is far more often an error code or an id than a credential.
  secretKeys?: boolean;
}

const NORMALIZED: ScrubOptions = { maxDepth: NORMALIZE_DEPTH };
// Sent RAW (no normalize bound), so walked further.
const RAW: ScrubOptions = { maxDepth: RAW_DEPTH };
const RAW_BODY: ScrubOptions = { maxDepth: RAW_DEPTH, secretKeys: true };

function scrubValue(value: unknown, level = 0, key = "", opts = NORMALIZED): unknown {
  if (typeof value === "string") {
    if (opts.secretKeys && SECRET_PARAM_NAME_RE.test(key)) return FILTERED;
    return /query/i.test(key) ? scrubQueryString(value) : scrubUrlSecrets(value);
  }
  if (!value || typeof value !== "object" || level >= opts.maxDepth) {
    return value;
  }
  if (value instanceof Error) {
    const plain = errorToPlain(value);
    const scrubbed = scrubValue(plain, level, key, opts);
    return scrubbed === plain ? value : scrubbed;
  }
  if (!isPlainContainer(value)) {
    // URL (and anything else Sentry serializes through toJSON to a string).
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === "function") {
      try {
        const json = toJSON.call(value);
        if (typeof json === "string") {
          const scrubbed = scrubUrlSecrets(json);
          return scrubbed === json ? value : scrubbed;
        }
      } catch {
        // Sentry falls back to its own walk; so does the return below.
      }
    }
    return value;
  }

  let clone: Record<string, unknown> | unknown[] | null = null;
  const keys = Object.keys(value).slice(0, NORMALIZE_MAX_BREADTH);
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    const scrubbed = scrubValue(v, level + 1, k, opts);
    if (scrubbed !== v) {
      clone ??= Array.isArray(value) ? value.slice() : { ...value };
      (clone as Record<string, unknown>)[k] = scrubbed;
    }
  }
  return clone ?? value;
}

interface ScrubbableBreadcrumb {
  message?: string;
  data?: unknown;
}

/**
 * Scrub one breadcrumb: its message and every string in `data` (`url` for
 * fetch/xhr, `from`/`to` for navigation, `arguments` for console). Only the
 * breadcrumb object itself, which Sentry owns, is assigned to. Returns it.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  if (typeof crumb.message === "string") {
    crumb.message = scrubUrlSecrets(crumb.message);
  }
  if (crumb.data !== undefined) {
    const data = scrubValue(crumb.data);
    if (data !== crumb.data) crumb.data = data;
  }
  return crumb;
}

// Run one location's scrub on its own, so a malformed field in one place
// cannot abort the others. On failure the location is removed; if even that
// fails (a frozen event) the caller is told, so it can drop the event.
function scrubOrRemove(target: object, key: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    try {
      return delete (target as Record<string, unknown>)[key];
    } catch {
      return false;
    }
  }
}

interface ScrubbableFrame {
  filename?: string;
  abs_path?: string;
  module?: string;
}

interface ScrubbableException {
  value?: string;
  stacktrace?: { frames?: ScrubbableFrame[] };
}

interface ScrubbableEvent {
  message?: unknown;
  transaction?: unknown;
  breadcrumbs?: ScrubbableBreadcrumb[];
  request?: { url?: string; query_string?: unknown; headers?: unknown; data?: unknown };
  exception?: { values?: ScrubbableException[] };
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
  spans?: { description?: string; data?: unknown }[];
}

function scrubFrame(f: ScrubbableFrame): ScrubbableFrame {
  const next = { ...f };
  let changed = false;
  for (const k of ["filename", "abs_path", "module"] as const) {
    const v = f[k];
    if (typeof v === "string") {
      const scrubbed = scrubUrlSecrets(v);
      if (scrubbed !== v) {
        next[k] = scrubbed;
        changed = true;
      }
    }
  }
  return changed ? next : f;
}

function scrubException(ex: ScrubbableException): ScrubbableException {
  const value = typeof ex.value === "string" ? scrubUrlSecrets(ex.value) : ex.value;
  const frames = ex.stacktrace?.frames;
  const nextFrames = frames?.map(scrubFrame);
  const framesChanged = !!frames && nextFrames!.some((f, i) => f !== frames[i]);
  if (value === ex.value && !framesChanged) return ex;
  return {
    ...ex,
    value,
    ...(framesChanged ? { stacktrace: { ...ex.stacktrace, frames: nextFrames } } : {})
  };
}

/**
 * Scrub every place a URL can reach in a Sentry event and return it. Only
 * the event object itself (and the breadcrumb/span objects, which Sentry
 * owns) is assigned to; everything below is replaced by scrubbed clones,
 * never written into. Never throws. A location that cannot be scrubbed is
 * removed instead, and if it cannot be removed either this returns `null`,
 * so the caller drops the event: a failure sends less, never the secret.
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T | null {
  const results = [
    scrubOrRemove(event, "message", () => {
      if (typeof event.message === "string") event.message = scrubUrlSecrets(event.message);
    }),

    scrubOrRemove(event, "breadcrumbs", () => {
      for (const crumb of event.breadcrumbs ?? []) scrubBreadcrumb(crumb);
    }),

    scrubOrRemove(event, "request", () => {
      const req = event.request;
      if (!req) return;
      const next = { ...req };
      if (typeof req.url === "string") next.url = scrubUrlSecrets(req.url);
      const qs = req.query_string;
      if (typeof qs === "string") {
        // Sentry stores the query WITHOUT its leading `?`.
        next.query_string = scrubQueryString(qs);
      } else if (Array.isArray(qs)) {
        // [[name, value], ...]
        next.query_string = qs.map((pair) =>
          Array.isArray(pair) && SECRET_PARAM_NAME_RE.test(String(pair[0]))
            ? [pair[0], FILTERED]
            : pair
        );
      } else if (qs && typeof qs === "object") {
        next.query_string = Object.fromEntries(
          Object.entries(qs).map(([name, v]) => [
            name,
            SECRET_PARAM_NAME_RE.test(name) ? FILTERED : v
          ])
        );
      }
      // Referer carries the previous page URL, e.g. /auth?code=...
      next.headers = scrubValue(req.headers, 0, "", RAW);
      // @sentry/node 8.55 captures incoming request bodies (non GET/HEAD, up to
      // 1 MB) and Sentry never normalizes `request`, so an error in POST
      // /api/auth-api/hs-token-refresh would ship the HiveSigner `code` in it.
      // 8.55 has no per-route body opt-out (ignoreIncomingRequestBody is v9).
      if (req.data !== undefined) {
        next.data =
          typeof req.data === "string"
            ? scrubBody(req.data)
            : scrubValue(req.data, 0, "", RAW_BODY);
      }
      event.request = next;
    }),

    // Removing the exception would send a different event, so a failure here
    // is reported as unscrubbable and the event is dropped instead.
    // A page-attributed frame (inline or injected script) carries the page
    // URL, query included. Chunk `?dpl=` queries are not secrets and pass
    // through, which the deploy-skew matcher relies on.
    (() => {
      try {
        const values = event.exception?.values;
        if (values) {
          const next = values.map(scrubException);
          if (next.some((ex, i) => ex !== values[i])) {
            event.exception = { ...event.exception, values: next };
          }
        }
        return true;
      } catch {
        return false;
      }
    })(),

    // `extra` is populated by the lazy-sentry early-error replay (earlySource,
    // earlyMessage); contexts and tags are covered for anything that copies a
    // URL into them (the timeoutUrl tag is derived AFTER this scrub).
    scrubOrRemove(event, "extra", () => {
      event.extra = scrubValue(event.extra);
    }),
    scrubOrRemove(event, "tags", () => {
      event.tags = scrubValue(event.tags);
    }),
    scrubOrRemove(event, "contexts", () => {
      let contexts = scrubValue(event.contexts) as Record<string, unknown> | undefined;
      if (contexts) {
        // See RAW_DEPTH: each walked from its own root.
        const trace = scrubValue(contexts.trace, 0, "", RAW);
        const flags = scrubValue(contexts.flags);
        if (trace !== contexts.trace || flags !== contexts.flags) {
          contexts = {
            ...contexts,
            ...(trace !== undefined ? { trace } : {}),
            ...(flags !== undefined ? { flags } : {})
          };
        }
      }
      event.contexts = contexts;
    }),

    // Transactions only (server/edge beforeSendTransaction): the name can be
    // an unparameterized URL, and child spans carry `url.full`, `http.url`,
    // `http.target`, `http.query` and a description with the raw URL.
    scrubOrRemove(event, "transaction", () => {
      if (typeof event.transaction === "string") {
        event.transaction = scrubUrlSecrets(event.transaction);
      }
    }),
    scrubOrRemove(event, "spans", () => {
      for (const span of event.spans ?? []) {
        if (typeof span.description === "string") {
          span.description = scrubUrlSecrets(span.description);
        }
        if (span.data !== undefined) {
          const data = scrubValue(span.data);
          if (data !== span.data) span.data = data;
        }
      }
    })
  ];

  return results.every(Boolean) ? event : null;
}
