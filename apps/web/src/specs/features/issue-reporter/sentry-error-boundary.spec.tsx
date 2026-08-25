import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as Sentry from "@sentry/nextjs";
import { SentryErrorBoundary } from "@/features/issue-reporter/sentry-error-boundary";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(() => "evt-123"),
  flush: vi.fn(() => Promise.resolve(true))
}));

// A child whose throwing is toggleable, so we can exercise reset/recovery.
let shouldThrow = true;
function Maybe() {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return <div>recovered child</div>;
}

const fallback = ({ eventId, reset }: { error: Error; eventId?: string; reset: () => void }) => (
  <div>
    <span data-testid="fallback">fallback:{eventId ?? "none"}</span>
    <button onClick={reset}>retry</button>
  </div>
);

describe("SentryErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldThrow = true;
    // React logs caught boundary errors to console.error; silence the noise.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      <SentryErrorBoundary fallback={fallback}>
        <div>safe child</div>
      </SentryErrorBoundary>
    );

    expect(screen.getByText("safe child")).toBeInTheDocument();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("renders the fallback and reports with the React component stack on throw", () => {
    render(
      <SentryErrorBoundary fallback={fallback}>
        <Maybe />
      </SentryErrorBoundary>
    );

    // Fallback is shown instead of the crashed subtree.
    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    // Reported once, WITH the component stack attached (the part source maps
    // alone can't provide for undefined-component crashes).
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        contexts: { react: { componentStack: expect.any(String) } }
      })
    );

    // The captured event id is threaded into the fallback (for feedback assoc).
    expect(screen.getByTestId("fallback")).toHaveTextContent("fallback:evt-123");
  });

  it("reloads + reports a low-severity tagged event (not the component-stack crash) on a deploy-skew error", async () => {
    const reloadMock = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, reload: reloadMock }
    });
    sessionStorage.clear();

    function SkewBomb(): never {
      throw Object.assign(new Error("Cannot read properties of undefined (reading 'call')"), {
        stack: "at a (https://ecency.com/_next/static/chunks/webpack-2bcfd50e.js:1:1)"
      });
    }

    render(
      <SentryErrorBoundary fallback={fallback}>
        <SkewBomb />
      </SentryErrorBoundary>
    );

    // Captured as a distinct, low-severity, fingerprinted "auto-recovered" event
    // — NOT the component-stack crash capture (so it never re-spikes as a fresh
    // 500 after a deploy).
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        level: "warning",
        tags: { deploy_skew: "true" },
        fingerprint: ["deploy-skew-auto-recovered"]
      })
    );
    // The reload happens after the transport flush resolves (so the monitoring
    // event isn't dropped on unload).
    expect(Sentry.flush).toHaveBeenCalled();
    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));

    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it("restores children when reset is called after the child stops throwing", () => {
    render(
      <SentryErrorBoundary fallback={fallback}>
        <Maybe />
      </SentryErrorBoundary>
    );

    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    expect(screen.getByText("recovered child")).toBeInTheDocument();
    expect(screen.queryByTestId("fallback")).not.toBeInTheDocument();
  });

  it("hard-reloads when retry re-throws the identical error (re-rendering cannot recover)", async () => {
    const reloadMock = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, reload: reloadMock }
    });
    sessionStorage.clear();

    // shouldThrow stays true: the mixed-build case — the broken module is
    // already registered, so a re-render throws the identical error instantly.
    render(
      <SentryErrorBoundary fallback={fallback}>
        <Maybe />
      </SentryErrorBoundary>
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(reloadMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    // The second, identical catch is tagged as a failed retry and escalates to
    // a reload after the transport flush (so the event isn't lost on unload).
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
    expect(Sentry.captureException).toHaveBeenLastCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { retry_reload: "true" } })
    );
    expect(Sentry.flush).toHaveBeenCalled();
    await vi.waitFor(() => expect(reloadMock).toHaveBeenCalledTimes(1));

    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it("does NOT reload when an identical error recurs AFTER a successful retry", async () => {
    const reloadMock = vi.fn();
    const realLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, reload: reloadMock }
    });
    sessionStorage.clear();

    const { rerender } = render(
      <SentryErrorBoundary fallback={fallback}>
        <Maybe />
      </SentryErrorBoundary>
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();

    // The retry recovers: a committed render of the children resets the
    // escalation memory.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(screen.getByText("recovered child")).toBeInTheDocument();

    // A later crash with the very same message (e.g. the same flaky error
    // minutes later) starts a fresh retry cycle: fallback, no reload.
    shouldThrow = true;
    rerender(
      <SentryErrorBoundary fallback={fallback}>
        <Maybe />
      </SentryErrorBoundary>
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    // Drain the flush → reload microtask chain that a (wrong) escalation would
    // have queued before asserting nothing reloaded.
    await new Promise((r) => setTimeout(r, 0));
    expect(reloadMock).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ tags: { retry_reload: "true" } })
    );

    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });
});
