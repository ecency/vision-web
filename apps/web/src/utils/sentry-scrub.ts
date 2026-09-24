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
// `payment_intent_client_secret` on the points-gift return URL.
const SECRET_PARAM_NAMES =
  "access_token|refresh_token|id_token|token|code|secret|password|api_key|apikey|key|signature|sig|[a-z0-9_.-]*_(?:secret|token)";
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

const MAX_DEPTH = 5;

function isPlainContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  if (Array.isArray(v)) return true;
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// Scrub every string inside arrays and plain objects, in place, down to
// MAX_DEPTH levels. Console breadcrumbs keep their args in `data.arguments`
// and CaptureConsole-style extras nest `{ args: [...] }` in an array, so one
// level is not enough. The depth bound is also what makes a cycle safe: a
// self-referencing object is walked at most MAX_DEPTH levels and then left.
function scrubDeep(container: unknown, depth = 0): void {
  if (depth >= MAX_DEPTH || !isPlainContainer(container)) return;
  const obj = container as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === "string") {
      const scrubbed = /query/i.test(key) ? scrubQueryString(v) : scrubUrlSecrets(v);
      if (scrubbed !== v) obj[key] = scrubbed;
    } else if (v && typeof v === "object") {
      scrubDeep(v, depth + 1);
    }
  }
}

interface ScrubbableBreadcrumb {
  message?: string;
  data?: unknown;
}

/**
 * Scrub one breadcrumb in place: its message and every string in `data`
 * (`url` for fetch/xhr, `from`/`to` for navigation, `arguments` for console).
 * Returns the breadcrumb.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  if (typeof crumb.message === "string") {
    crumb.message = scrubUrlSecrets(crumb.message);
  }
  scrubDeep(crumb.data);
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

interface ScrubbableEvent {
  message?: unknown;
  transaction?: unknown;
  breadcrumbs?: ScrubbableBreadcrumb[];
  request?: { url?: string; query_string?: unknown; headers?: unknown };
  exception?: { values?: { value?: string; stacktrace?: { frames?: ScrubbableFrame[] } }[] };
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
  spans?: { description?: string; data?: unknown }[];
}

/**
 * Scrub every place a URL can reach in a Sentry event, in place, and return it.
 * Never throws. A location that cannot be scrubbed is removed instead, and if
 * it cannot be removed either this returns `null`, so the caller drops the
 * event: a failure sends less, never the secret.
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
      if (typeof req.url === "string") req.url = scrubUrlSecrets(req.url);
      const qs = req.query_string;
      if (typeof qs === "string") {
        // Sentry stores the query WITHOUT its leading `?`.
        req.query_string = scrubQueryString(qs);
      } else if (Array.isArray(qs)) {
        // [[name, value], ...]
        req.query_string = qs.map((pair) =>
          Array.isArray(pair) && SECRET_PARAM_NAME_RE.test(String(pair[0]))
            ? [pair[0], FILTERED]
            : pair
        );
      } else if (qs && typeof qs === "object") {
        const rec = qs as Record<string, unknown>;
        for (const name of Object.keys(rec)) {
          if (SECRET_PARAM_NAME_RE.test(name)) rec[name] = FILTERED;
        }
      }
      // Referer carries the previous page URL, e.g. /auth?code=...
      scrubDeep(req.headers);
    }),

    // Removing the exception would send a different event, so a failure here
    // is reported as unscrubbable and the event is dropped instead.
    (() => {
      try {
        for (const ex of event.exception?.values ?? []) {
          if (typeof ex.value === "string") ex.value = scrubUrlSecrets(ex.value);
          // A page-attributed frame (inline or injected script) carries the
          // page URL, query included. Chunk `?dpl=` queries are not secrets
          // and pass through, which the deploy-skew matcher relies on.
          for (const f of ex.stacktrace?.frames ?? []) {
            if (typeof f.filename === "string") f.filename = scrubUrlSecrets(f.filename);
            if (typeof f.abs_path === "string") f.abs_path = scrubUrlSecrets(f.abs_path);
            if (typeof f.module === "string") f.module = scrubUrlSecrets(f.module);
          }
        }
        return true;
      } catch {
        return false;
      }
    })(),

    // `extra` is populated by the lazy-sentry early-error replay (earlySource,
    // earlyMessage); contexts and tags are covered for anything that copies a
    // URL into them (the timeoutUrl tag is derived AFTER this scrub, and a
    // transaction's root span data lives in contexts.trace.data).
    scrubOrRemove(event, "extra", () => scrubDeep(event.extra)),
    scrubOrRemove(event, "tags", () => scrubDeep(event.tags)),
    scrubOrRemove(event, "contexts", () => scrubDeep(event.contexts)),

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
        scrubDeep(span.data);
      }
    })
  ];

  return results.every(Boolean) ? event : null;
}
