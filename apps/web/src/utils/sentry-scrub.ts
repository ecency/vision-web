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
//     user's access token.
//   - `/newsletter/confirm/<token>`, `/newsletter/unsubscribe/<token>`: the
//     emailed newsletter links, as a page and under `/api/newsletter/`.
// Everything up to the query, hash, whitespace or a quote is redacted, so a
// token that contains `/` cannot leak its tail.
const SECRET_PATH_RE = /(\/(?:hs|newsletter\/(?:confirm|unsubscribe))\/)[^?#\s"'<>]+/gi;

// Query or fragment parameters that carry credentials: the HiveSigner `code`
// on /auth and create-hs, `access_token`/`refresh_token` on OAuth redirects,
// the Mattermost websocket `token`, `client_secret` on the server-side token
// exchange, and the generic names a future endpoint is likely to use.
const SECRET_PARAM_NAMES =
  "access_token|refresh_token|id_token|token|code|client_secret|secret|password|api_key|apikey|key|signature|sig";
const SECRET_PARAM_RE = new RegExp(`([?&#](?:${SECRET_PARAM_NAMES})=)[^&#\\s"'<>]*`, "gi");
const SECRET_PARAM_NAME_RE = new RegExp(`^(?:${SECRET_PARAM_NAMES})$`, "i");

/** Redact every known secret-in-URL shape inside `value` (a URL or free text). */
export function scrubUrlSecrets(value: string): string {
  return value.replace(SECRET_PATH_RE, `$1${FILTERED}`).replace(SECRET_PARAM_RE, `$1${FILTERED}`);
}

// Scrub the string values one level down in a plain record, in place.
function scrubRecord(record: unknown): void {
  if (!record || typeof record !== "object") return;
  const obj = record as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === "string") {
      obj[key] = scrubUrlSecrets(v);
    }
  }
}

interface ScrubbableBreadcrumb {
  message?: string;
  data?: unknown;
}

/**
 * Scrub one breadcrumb in place: its message and every string in `data`
 * (`url` for fetch/xhr, `from`/`to` for navigation). Returns the breadcrumb.
 */
export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  if (typeof crumb.message === "string") {
    crumb.message = scrubUrlSecrets(crumb.message);
  }
  scrubRecord(crumb.data);
  return crumb;
}

// Run one location's scrub on its own, so a malformed field in one place
// cannot abort the others, and nothing here can throw out of beforeSend.
function guard(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

interface ScrubbableEvent {
  message?: unknown;
  breadcrumbs?: ScrubbableBreadcrumb[];
  request?: { url?: string; query_string?: unknown; headers?: unknown };
  exception?: { values?: { value?: string }[] };
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
}

/**
 * Scrub every place a URL can reach in a Sentry event, in place, and return it.
 * Never throws. A location that cannot be scrubbed is removed instead, so a
 * failure sends less, never the secret.
 */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  if (
    !guard(() => {
      if (typeof event.message === "string") event.message = scrubUrlSecrets(event.message);
    })
  ) {
    delete event.message;
  }

  if (
    !guard(() => {
      for (const crumb of event.breadcrumbs ?? []) scrubBreadcrumb(crumb);
    })
  ) {
    delete event.breadcrumbs;
  }

  if (
    !guard(() => {
      const req = event.request;
      if (!req) return;
      if (typeof req.url === "string") req.url = scrubUrlSecrets(req.url);
      const qs = req.query_string;
      if (typeof qs === "string") {
        // Sentry stores the query WITHOUT its leading `?`; restore one so the
        // first parameter matches too, then strip it again.
        req.query_string = scrubUrlSecrets(`?${qs}`).slice(1);
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
      scrubRecord(req.headers);
    })
  ) {
    delete event.request;
  }

  guard(() => {
    for (const ex of event.exception?.values ?? []) {
      if (typeof ex.value === "string") ex.value = scrubUrlSecrets(ex.value);
    }
  });

  // `extra` is populated by the lazy-sentry early-error replay (earlySource,
  // earlyMessage); contexts and tags are covered for anything that copies a
  // URL into them (the timeoutUrl tag is derived AFTER this scrub).
  if (!guard(() => scrubRecord(event.extra))) delete event.extra;
  if (!guard(() => scrubRecord(event.tags))) delete event.tags;
  if (
    !guard(() => {
      const contexts = event.contexts;
      if (!contexts || typeof contexts !== "object") return;
      for (const ctx of Object.values(contexts as Record<string, unknown>)) scrubRecord(ctx);
    })
  ) {
    delete event.contexts;
  }

  return event;
}
