import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";

const captureException = vi.fn();

vi.mock("@/core/sentry/lazy-sentry", () => ({
  sentry: {
    captureException: (...args: unknown[]) => captureException(...args),
    withScope: (callback: (scope: unknown) => void) =>
      callback({ setExtra: vi.fn(), setTag: vi.fn() }),
    setTag: vi.fn()
  }
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/core/global-store", () => ({
  useGlobalStore: vi.fn((selector: (state: any) => any) => selector({ activeUser: null }))
}));

import { Feedback } from "@/features/shared/feedback/feedback";
import { error } from "@/features/shared/feedback/feedback-events";

// The Report button on an error toast is the only thing that sends these
// failures to Sentry. It reports `context.error` when the caller attached one
// and a fresh Error(message) otherwise, and the synthetic fallback carries the
// click handler's stack, so every caller that omits the cause lands in one
// undiagnosable group with everybody else's.
describe("reporting an error toast", () => {
  const report = () =>
    fireEvent.click(screen.getByRole("button", { name: "feedback-modal.report" }));

  beforeEach(() => captureException.mockClear());

  it("reports the original error when the caller attaches one", () => {
    render(<Feedback />);
    const cause = new Error("Request failed with status 413");

    act(() => error("Couldn't upload image.", undefined, { error: cause }));
    report();

    expect(captureException).toHaveBeenCalledWith(cause);
  });

  it("keeps the underlying message rather than the translated toast", () => {
    render(<Feedback />);

    act(() => error("Couldn't upload image.", undefined, { error: new Error("Failed to fetch") }));
    report();

    expect((captureException.mock.calls[0][0] as Error).message).toBe("Failed to fetch");
  });

  it("falls back to a synthetic error when the caller attaches nothing", () => {
    render(<Feedback />);

    act(() => error("Couldn't upload image."));
    report();

    expect((captureException.mock.calls[0][0] as Error).message).toBe("Couldn't upload image.");
  });
});
