import type { Event, Integration } from "@sentry/core";

/** Grouping fingerprint of the RC shortfall telemetry (api/rc-shortfall-report). */
const RC_SHORTFALL_FINGERPRINT = "rc-shortfall";

function isRcShortfallEvent(event: Event): boolean {
  return event.fingerprint?.[0] === RC_SHORTFALL_FINGERPRINT;
}

/**
 * Sentry's default Dedupe drops an event equal to the previous one by
 * message, fingerprint and stacktrace, ignoring user and tags. RC telemetry
 * counts each failure (the reporter already dedupes per error object and
 * per account/op/day), so a second account hitting the same failure must
 * not be dropped (#2196). RC events skip Dedupe and are not remembered as
 * its previous event, so ordinary errors are deduped exactly as before.
 */
function exemptRcShortfall(dedupe: Integration): Integration {
  const inner = dedupe.processEvent;
  if (!inner) return dedupe;
  return {
    ...dedupe,
    processEvent(event, hint, client) {
      if (isRcShortfallEvent(event)) return event;
      return inner.call(dedupe, event, hint, client);
    }
  };
}

/** The client's integrations: defaults minus BrowserTracing, Dedupe exempting RC telemetry. */
export function clientIntegrations(defaults: Integration[]): Integration[] {
  return defaults
    .filter((i) => i.name !== "BrowserTracing")
    .map((i) => (i.name === "Dedupe" ? exemptRcShortfall(i) : i));
}
