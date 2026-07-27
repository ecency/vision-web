"use client"; // Error boundaries must be Client Components

import { Feedback } from "@/features/shared/feedback";
import Image from "next/image";
import i18next from "i18next";
import Link from "next/link";
import { Button } from "@ui/button";
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
            {/* The only image on the page and its LCP element — don't lazy-load it. */}
            <Image
              src="/assets/illustration-open-source.png"
              alt="logo"
              width={571}
              height={460}
              priority
            />
          </div>
        </div>
        <div id="modal-overlay-container" />
        <div id="modal-dialog-container" />
      </body>
    </html>
  );
}
