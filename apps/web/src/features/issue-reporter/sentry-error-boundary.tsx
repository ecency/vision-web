"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { isDeploySkewError, reloadForSkew } from "@/features/pwa-install/service-worker-recovery";

interface FallbackProps {
  error: Error;
  // Sentry event id of the captured exception, so the fallback can attach user
  // feedback to the SAME event (see SentryIssueReporterDialog).
  eventId?: string;
  reset: () => void;
}

interface Props {
  children: ReactNode;
  fallback: (props: FallbackProps) => ReactNode;
}

interface State {
  error?: Error;
  eventId?: string;
}

/**
 * Client error boundary that reports render-time throws to Sentry WITH the React
 * component stack attached. For "Element type is invalid" / undefined-component
 * errors the framework JS stack is entirely react-dom internals (0 app frames),
 * so the component stack is the only thing that names the component at fault —
 * `captureException` alone (e.g. from global-error, which only receives
 * `{ error }`) cannot. Pair with the uploaded source maps to pinpoint the file.
 *
 * Lifecycle note: `getDerivedStateFromError` renders the fallback first with
 * `eventId` still undefined, then `componentDidCatch` captures the exception and
 * sets `eventId` on a second render. A fallback that auto-opens the report
 * dialog must therefore guard on `eventId` to avoid capturing a duplicate
 * exception; the current entry fallback only reports on explicit click, so it
 * is unaffected.
 */
export class SentryErrorBoundary extends Component<Props, State> {
  state: State = {};

  // Message of the error that was showing when the user last pressed the
  // fallback's retry. If the very next catch carries the SAME message with no
  // successful commit of the children in between, re-rendering demonstrably
  // cannot recover: the failing module is already loaded and throws
  // identically forever (the mixed-build case a matcher doesn't know yet, or
  // any other deterministic render crash). Escalate to a loop-guarded reload
  // instead of leaving a retry button that visibly does nothing (#1674).
  private retriedErrorMessage: string | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate() {
    // A committed render of the children proves re-rendering CAN recover here,
    // so a later crash — even one with an identical message, like a flaky
    // network error recurring minutes after a successful retry — starts a
    // fresh retry cycle instead of escalating straight to a reload.
    if (!this.state.error) {
      this.retriedErrorMessage = null;
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // A deploy-skew crash (a chunk that no longer matches the running build) is
    // auto-recovered by reloading. Record it as a distinct, low-severity
    // "auto-recovered" event (so skew frequency stays visible) instead of a
    // fresh crash that re-spikes after every deploy, then reload — skip the
    // component-stack capture, which is only useful for real render bugs.
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
    // Did the user's retry just re-throw the identical error? (reset() records
    // the message; componentDidUpdate clears it on any successful commit, so a
    // match here means the retry never got a working render.)
    const retryCannotRecover =
      this.retriedErrorMessage !== null && this.retriedErrorMessage === error.message;
    const eventId = Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack ?? undefined } },
      ...(retryCannotRecover ? { tags: { retry_reload: "true" } } : {})
    });
    // Set the eventId FIRST so the report dialog stays usable if the reload is
    // loop-guarded away (reloadForSkew reloads at most once per session).
    this.setState({ eventId });
    if (retryCannotRecover) {
      void Sentry.flush(2000).finally(() => reloadForSkew());
    }
  }

  reset = () => {
    this.retriedErrorMessage = this.state.error?.message ?? null;
    this.setState({ error: undefined, eventId: undefined });
  };

  render() {
    const { error, eventId } = this.state;
    if (error) {
      return this.props.fallback({ error, eventId, reset: this.reset });
    }
    return this.props.children;
  }
}
