import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// Issue #2000: a failed record lookup on the profile and community routes now
// throws instead of answering notFound(). A full page load is answered with a
// retryable 503 by the server; a CLIENT-side navigation receives the error in
// the RSC payload instead. Without a segment error module it would reach
// global-error (a full-page "500" with no retry, reported to Sentry from the
// browser). The segment boundary keeps the page chrome and offers a retry.

const { refresh, captureException } = vi.hoisted(() => ({
  refresh: vi.fn(),
  captureException: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })
}));
vi.mock("@/core/sentry/lazy-sentry", () => ({ sentry: { captureException } }));

import { LookupUnavailableError } from "@/features/shared/lookup-unavailable";

afterEach(() => {
  vi.clearAllMocks();
});

describe("LookupUnavailableError (profile and community segment error boundary)", () => {
  it("offers a retry that refreshes the route and resets the boundary", () => {
    const reset = vi.fn();
    const error = Object.assign(new Error("server render failed"), { digest: "123" });
    render(<LookupUnavailableError error={error} reset={reset} />);

    expect(screen.getByText("lookup-unavailable.title")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "lookup-unavailable.retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not report an error that came from the server render", () => {
    const error = Object.assign(new Error("server render failed"), { digest: "123" });
    render(<LookupUnavailableError error={error} reset={vi.fn()} />);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports an error thrown by the client render", () => {
    const error = new Error("client render failed");
    render(<LookupUnavailableError error={error} reset={vi.fn()} />);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it.each([
    "(dynamicPages)/profile/[username]",
    "(dynamicPages)/community/[community]",
    "waves/[author]/[permlink]"
  ])(
    "is the error module of the %s segment",
    (segment) => {
      const file = join(process.cwd(), "src/app", segment, "error.tsx");
      expect(existsSync(file)).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/^"use client";/);
      expect(source).toContain("@/features/shared/lookup-unavailable");
    }
  );

  // The module ships with every profile and community page: the Sentry SDK
  // must stay off their eager bundle.
  it("reaches Sentry only through the lazy facade", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/shared/lookup-unavailable/lookup-unavailable-error.tsx"),
      "utf8"
    );
    expect(source).not.toMatch(/from "@sentry\//);
    expect(source).toContain("@/core/sentry/lazy-sentry");
  });
});
