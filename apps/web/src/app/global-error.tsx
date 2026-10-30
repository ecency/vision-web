"use client"; // Error boundaries must be Client Components

/**
 * The app-wide error module. The profile and community segments have their own
 * (#2000, see the note at the end of this comment); everything else lands here.
 *
 * #1808 asked whether the entry, wave,
 * feed, profile and community routes should get an `error.tsx` of their own now
 * that their loading modules are gone. The answer is no. The reason is worth
 * recording so the next reader does not re-derive it.
 *
 * A route-level `error.tsx` would not catch what those routes now risk. Next
 * compiles it into a `'use client'` class boundary
 * (next/dist/client/components/error-boundary.js, getDerivedStateFromError),
 * and React's SERVER renderer does not run error boundaries at all: a throw
 * during SSR is recovered only AT a Suspense boundary, which client-renders
 * that segment instead. Measured on react-dom 19's own server renderer: with a
 * Suspense boundary around a throwing component the shell survives and the
 * boundary is emitted as `<!--$!-->` ("Switched to client rendering"); with a
 * class error boundary and NO Suspense, renderToPipeableStream calls
 * onShellError and the whole document is lost. Those routes deliberately have
 * no Suspense boundary above their content - that is what removed the hidden
 * segment and the late $RC swap, what moved /trending's LCP from 11.08s to
 * 8.70s - so an `error.tsx` there would be a client chunk on the hot path that
 * changes nothing about the failure it was added for.
 *
 * Nor would it catch the failures these routes actually see. Data fetches go
 * through withSsrTimeout (core/react-query/query-helpers.ts), which resolves
 * `undefined` rather than throwing. The pages already render an empty feed or
 * call notFound() for that.
 *
 * What is left for an error module to catch is a CLIENT render throw:
 * hydration, or a re-render after interaction. On these routes that is the same
 * deterministic throw that already took the SSR render down, so the reader
 * never reaches it - and where it is reachable, the fix is a guard at the call,
 * not a boundary around the page: a guard keeps the page and loses one line of
 * text, a boundary keeps the chrome and loses the page. See
 * core/entries/catch-post-image-safely.ts and
 * core/entries/post-body-summary-safely.ts for the two calls on that path.
 *
 * Revisit if a route grows a render that can fail on its own (a client-only
 * widget with real logic, a third-party embed), or if a Suspense boundary comes
 * back for an unrelated reason - with one in place, an `error.tsx` below it
 * would start earning its chunk.
 *
 * #2000 is that case for profile, community and wave pages. A failed account,
 * community or post lookup now THROWS (prefetchRequired) instead of answering
 * notFound(): a lookup failure is not an absence. On the routes without a
 * Suspense boundary a full page load is still not caught by a boundary - the
 * server answers it as a retryable 503 - but on a CLIENT-side navigation, and
 * on the profile sub-pages that keep a loading.tsx, the error reaches the
 * client and would land here, a full-page 500 with no retry. The segments'
 * `error.tsx` (features/shared/lookup-unavailable) keep the layout around a
 * retry instead.
 */

import { Feedback } from "@/features/shared/feedback";
import Image from "next/image";
import i18next from "i18next";
import Link from "next/link";
import { Button } from "@ui/button";
import { Esie } from "@ui/esie";
import { SentryIssueReporterDialog } from "@/features/issue-reporter";
import defaults from "@/defaults";
import * as Sentry from "@sentry/nextjs";
import { isDeploySkewError, reloadForSkew } from "@/features/pwa-install/service-worker-recovery";
import { useEffect, useState } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [eventId, setEventId] = useState<string>();

  // Report the crash to Sentry as soon as the fallback renders, so we always
  // get an event — even when the user never opens the report dialog. The
  // optional user feedback (via SentryIssueReporterDialog) is then attached to
  // THIS event id instead of capturing a second, separate exception.
  useEffect(() => {
    // A deploy-skew crash (a chunk that no longer matches the running build) is
    // auto-recovered by reloading onto the current build. Record it as a
    // distinct, low-severity "auto-recovered" event — NOT a fresh 500 that would
    // re-spike after every deploy — so we keep visibility into skew frequency
    // without it masquerading as a new crash. Then reload (once per session).
    if (isDeploySkewError(error)) {
      Sentry.captureException(error, {
        level: "warning",
        tags: { deploy_skew: "true" },
        fingerprint: ["deploy-skew-auto-recovered"]
      });
      // Flush the transport before reloading, otherwise the monitoring event is
      // dropped on unload. Bounded so a slow/blocked transport can't delay the
      // recovery reload; reloadForSkew still runs on timeout.
      void Sentry.flush(2000).finally(() => reloadForSkew());
      return;
    }
    setEventId(Sentry.captureException(error));
  }, [error]);

  return (
    // global-error must include html and body tags
    <html>
      <body>
        <div
          className="bg-repeat"
          style={{
            backgroundSize: "200px",
            backgroundImage: `url(/assets/circle-pattern.svg)`
          }}
        >
          <Feedback />
          <div className="container mx-auto p-4 grid sm:grid-cols-2 gap-4 h-[100vh] items-center">
            <div className="flex flex-col justify-center gap-4 md:gap-8">
              <div className="flex gap-4">
                <Image src={defaults.logo} alt="logo" width={72} height={72} />
                <h1 className="text-8xl font-black text-blue-dark-sky">500</h1>
              </div>
              <h2 className="text-2xl font-semibold">{i18next.t("global-error.description")}</h2>
              <div className="flex items-center gap-4">
                <Link href="/">
                  <Button>{i18next.t("not-found.back-home")}</Button>
                </Link>
                <SentryIssueReporterDialog error={error} eventId={eventId} />
              </div>
            </div>
            {/* The page's main illustration and its LCP element — don't lazy-load it. */}
            <Esie mood="sad" height={360} priority className="mx-auto w-[300px] max-w-full" />
          </div>
        </div>
        <div id="modal-overlay-container" />
        <div id="modal-dialog-container" />
      </body>
    </html>
  );
}
