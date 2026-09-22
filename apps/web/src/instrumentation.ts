import * as Sentry from "@sentry/nextjs";

export async function register() {
  Object.defineProperty(global, "_bitcore", {
    // Redefinable: without this a second register() in one process throws
    // "Cannot redefine property", which caps any spec of this file at a
    // single case and is a trap for whoever adds the next one.
    configurable: true,
    get() {
      return undefined;
    },
    set() {}
  });

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Belt and braces for the takedown lists, after Sentry.init so that stays
    // first. Every entry point that serves post data calls loadDmcaLists()
    // itself (see core/dmca-lists) and those calls stay load-bearing; this one
    // runs once per Node server process before any request, because
    // instrumentation is a framework entry that cannot be tree-shaken, and it
    // catches the NEXT route that serves posts and forgets to load them, which
    // is how #1862 happened. Verified on a production build that it resolves
    // the loader through the same webpack runtime the route handlers use, so
    // it shares one CONFIG instance. The edge runtime is a separate registry
    // and nothing post-serving runs there.
    const { loadDmcaLists } = await import("./core/dmca-lists");
    loadDmcaLists();

    const { initEventLoopMonitor } = await import("./event-loop-monitor");
    initEventLoopMonitor();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
