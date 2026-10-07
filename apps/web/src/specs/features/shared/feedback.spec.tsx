import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { Feedback } from "@/features/shared/feedback/feedback";
import { ErrorTypes } from "@/enums";
import { dismissFeedback, FeedbackObject } from "@/features/shared/feedback/feedback-events";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/core/global-store", () => ({
  useGlobalStore: vi.fn((selector: (state: any) => any) => selector({ activeUser: null }))
}));

// Toasts enter with a pure CSS keyframe and exit with a 150ms
// useMountTransition-driven fade + slide-down. These tests pin that both the
// close button and the 5s auto-expiry play the exit before unmounting, and
// that hover still pauses auto-expiry.
describe("Feedback", () => {
  const emit = (detail: Partial<FeedbackObject>) =>
    act(() => {
      window.dispatchEvent(
        new CustomEvent("ecency-feedback", {
          detail: { id: "toast-1", type: "success", message: "saved!", ...detail }
        })
      );
    });

  const toastWrapper = () => document.querySelector(".feedback-item-enter");

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders an incoming toast with the CSS entrance class", () => {
    render(<Feedback />);
    emit({ message: "saved!" });

    expect(screen.getByText("saved!")).toBeInTheDocument();
    expect(toastWrapper()).not.toBeNull();
  });

  it("animates out on manual close, then unmounts", () => {
    render(<Feedback />);
    emit({ message: "saved!" });

    // Let the entrance settle (open flips true a couple of rAFs after mount)
    // so the opacity-0 below is genuinely the exit state.
    act(() => vi.advanceTimersByTime(100));
    expect(toastWrapper()!.className).toContain("opacity-100");

    fireEvent.click(screen.getByRole("button", { name: "g.close" }));

    // Exit state applies while the toast is still mounted...
    expect(screen.getByText("saved!")).toBeInTheDocument();
    expect(toastWrapper()!.className).toContain("opacity-0");
    expect(toastWrapper()!.className).toContain("translate-y-3");

    // ...and the 150ms exit timer removes it from the store.
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("saved!")).not.toBeInTheDocument();
  });

  it("animates out on auto-expiry, then unmounts", () => {
    render(<Feedback />);
    emit({ message: "saved!" });

    act(() => vi.advanceTimersByTime(100));
    expect(toastWrapper()!.className).toContain("opacity-100");

    act(() => vi.advanceTimersByTime(5000));

    expect(screen.getByText("saved!")).toBeInTheDocument();
    expect(toastWrapper()!.className).toContain("opacity-0");

    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("saved!")).not.toBeInTheDocument();
  });

  it("hover pauses auto-expiry; leaving re-arms it", () => {
    render(<Feedback />);
    emit({ message: "saved!" });

    fireEvent.mouseEnter(screen.getByRole("alert"));
    act(() => vi.advanceTimersByTime(10000));
    expect(screen.getByText("saved!")).toBeInTheDocument();
    expect(toastWrapper()!.className).not.toContain("opacity-0");

    fireEvent.mouseLeave(screen.getByRole("alert"));
    // Auto-expiry fires at 5s; the exit timer is only scheduled once React
    // flushes that update, so the 150ms exit needs its own advance.
    act(() => vi.advanceTimersByTime(5000));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("saved!")).not.toBeInTheDocument();
  });

  it("dismisses toasts independently", () => {
    render(<Feedback />);
    emit({ id: "toast-1", message: "first" });
    emit({ id: "toast-2", message: "second" });

    const closeButtons = screen.getAllByRole("button", { name: "g.close" });
    fireEvent.click(closeButtons[0]);
    act(() => vi.advanceTimersByTime(200));

    expect(screen.queryByText("first")).not.toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
  });
  it("keeps an error toast for 10s instead of 5s", () => {
    render(<Feedback />);
    emit({ type: "error", message: "failed" });

    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByText("failed")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(4100));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });

  it("keeps a toast with an action until it is used, and does not report a dismissal then", () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(<Feedback />);
    // errorType set, as error() always does: Retry sits next to the Report button
    emit({ type: "error", errorType: ErrorTypes.COMMON, message: "upload failed", action: { label: "Retry", onClick }, onDismiss } as Partial<FeedbackObject>);
    expect(screen.getByRole("button", { name: "feedback-modal.report" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByText("upload failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    act(() => vi.advanceTimersByTime(200));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.queryByText("upload failed")).not.toBeInTheDocument();
  });

  it("reports a dismissal once when a toast with an action is closed", () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    render(<Feedback />);
    emit({ type: "error", message: "upload failed", action: { label: "Retry", onClick }, onDismiss });

    fireEvent.click(screen.getByRole("button", { name: "g.close" }));
    act(() => vi.advanceTimersByTime(200));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("closes a toast from code with dismissFeedback, reporting the dismissal", () => {
    const onDismiss = vi.fn();
    render(<Feedback />);
    emit({ id: "toast-9", type: "error", message: "upload failed", action: { label: "Retry", onClick: vi.fn() }, onDismiss });

    act(() => dismissFeedback("toast-9"));
    act(() => vi.advanceTimersByTime(200));

    expect(screen.queryByText("upload failed")).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
