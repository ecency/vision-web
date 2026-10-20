import { vi } from 'vitest';
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DetectBottom } from "@/features/shared/detect-bottom";

// Mock the react-in-viewport hook
vi.mock("react-in-viewport", () => ({
  useInViewport: vi.fn()
}));

import { useInViewport } from "react-in-viewport";

describe("DetectBottom", () => {
  const mockOnBottom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders without crashing", () => {
    (useInViewport as any).mockReturnValue({ inViewport: false });

    const { container } = render(<DetectBottom onBottom={mockOnBottom} />);

    expect(container.querySelector("div")).toBeInTheDocument();
  });

  test("calls onBottom when element enters viewport", () => {
    (useInViewport as any).mockReturnValue({ inViewport: true });

    render(<DetectBottom onBottom={mockOnBottom} />);

    expect(mockOnBottom).toHaveBeenCalled();
  });

  test("does not call onBottom when element is not in viewport", () => {
    (useInViewport as any).mockReturnValue({ inViewport: false });

    render(<DetectBottom onBottom={mockOnBottom} />);

    expect(mockOnBottom).not.toHaveBeenCalled();
  });

  test("calls onBottom only once when in viewport", () => {
    (useInViewport as any).mockReturnValue({ inViewport: true });

    render(<DetectBottom onBottom={mockOnBottom} />);

    expect(mockOnBottom).toHaveBeenCalledTimes(1);
  });

  test("updates when inViewport changes from false to true", () => {
    // Set initial mock value before first render
    (useInViewport as any).mockReturnValue({ inViewport: false });

    const { rerender } = render(<DetectBottom onBottom={mockOnBottom} />);

    expect(mockOnBottom).not.toHaveBeenCalled();

    (useInViewport as any).mockReturnValue({ inViewport: true });
    rerender(<DetectBottom onBottom={mockOnBottom} />);

    expect(mockOnBottom).toHaveBeenCalled();
  });

  test("uses correct rootMargin configuration", () => {
    (useInViewport as any).mockReturnValue({ inViewport: false });

    render(<DetectBottom onBottom={mockOnBottom} />);

    expect(useInViewport).toHaveBeenCalledWith(
      expect.any(Object),
      { rootMargin: "0px 0px 200px 0px" }
    );
  });

  test("creates ref and passes it to useInViewport", () => {
    (useInViewport as any).mockReturnValue({ inViewport: false });

    render(<DetectBottom onBottom={mockOnBottom} />);

    const callArgs = (useInViewport as any).mock.calls[0];
    expect(callArgs[0]).toHaveProperty("current");
  });

  test("handles rapid viewport changes", () => {
    const { rerender } = render(<DetectBottom onBottom={mockOnBottom} />);

    (useInViewport as any).mockReturnValue({ inViewport: true });
    rerender(<DetectBottom onBottom={mockOnBottom} />);

    (useInViewport as any).mockReturnValue({ inViewport: false });
    rerender(<DetectBottom onBottom={mockOnBottom} />);

    (useInViewport as any).mockReturnValue({ inViewport: true });
    rerender(<DetectBottom onBottom={mockOnBottom} />);

    expect(mockOnBottom).toHaveBeenCalled();
  });

  test("handles different onBottom callbacks", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    (useInViewport as any).mockReturnValue({ inViewport: true });

    const { rerender } = render(<DetectBottom onBottom={callback1} />);

    expect(callback1).toHaveBeenCalled();

    rerender(<DetectBottom onBottom={callback2} />);

    expect(callback2).toHaveBeenCalled();
  });

  test("renders a single div element", () => {
    (useInViewport as any).mockReturnValue({ inViewport: false });

    const { container } = render(<DetectBottom onBottom={mockOnBottom} />);

    const divs = container.querySelectorAll("div");
    expect(divs).toHaveLength(1);
  });

  test("div element has ref attached", () => {
    (useInViewport as any).mockReturnValue({ inViewport: false });

    render(<DetectBottom onBottom={mockOnBottom} />);

    expect(useInViewport).toHaveBeenCalled();
    const refArg = (useInViewport as any).mock.calls[0][0];
    expect(refArg).toHaveProperty("current");
  });

  test("handles onBottom callback that returns a value", () => {
    const onBottomWithReturn = vi.fn(() => "returned value");
    (useInViewport as any).mockReturnValue({ inViewport: true });

    render(<DetectBottom onBottom={onBottomWithReturn} />);

    expect(onBottomWithReturn).toHaveBeenCalled();
  });

  describe("paused", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      (useInViewport as any).mockReturnValue({ inViewport: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("does not load just because it is on screen", () => {
      render(<DetectBottom onBottom={mockOnBottom} paused />);
      expect(mockOnBottom).not.toHaveBeenCalled();
    });

    // A fling is a stream of events; a new onBottom (the parent re-rendering
    // after each page) must not let that stream load page after page.
    test("loads at most once per cooldown, whatever the parent re-renders", () => {
      const { rerender } = render(<DetectBottom onBottom={mockOnBottom} paused />);

      fireEvent.wheel(window, { deltaY: 40 });
      rerender(<DetectBottom onBottom={() => mockOnBottom()} paused />);
      fireEvent.wheel(window, { deltaY: 40 });
      fireEvent.wheel(window, { deltaY: 40 });
      expect(mockOnBottom).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      fireEvent.touchStart(window, { touches: [{ clientY: 300 }] });
      fireEvent.touchMove(window, { touches: [{ clientY: 200 }] });
      expect(mockOnBottom).toHaveBeenCalledTimes(2);
    });

    test("ignores scrolling up (wheel or finger), typing, buttons and dialogs", () => {
      const { container } = render(
        <>
          <input />
          <button>b</button>
          <div role="dialog">
            <p>modal</p>
          </div>
          <DetectBottom onBottom={mockOnBottom} paused />
        </>
      );

      fireEvent.wheel(window, { deltaY: -40 });
      fireEvent.touchStart(window, { touches: [{ clientY: 200 }] });
      fireEvent.touchMove(window, { touches: [{ clientY: 300 }] });
      fireEvent.keyDown(container.querySelector("input")!, { key: " " });
      fireEvent.keyDown(container.querySelector("button")!, { key: " " });
      fireEvent.wheel(container.querySelector("p")!, { deltaY: 40 });
      expect(mockOnBottom).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: "PageDown" });
      expect(mockOnBottom).toHaveBeenCalledTimes(1);
    });

    // The scroll that brings the sentinel on screen is the request for more;
    // waiting for a second gesture at the bottom felt stuck.
    test("loads for the gesture that brought it into view", () => {
      (useInViewport as any).mockReturnValue({ inViewport: false });
      const { rerender } = render(<DetectBottom onBottom={mockOnBottom} paused />);

      fireEvent.keyDown(window, { key: "End" });
      expect(mockOnBottom).not.toHaveBeenCalled();

      (useInViewport as any).mockReturnValue({ inViewport: true });
      rerender(<DetectBottom onBottom={mockOnBottom} paused />);
      expect(mockOnBottom).toHaveBeenCalledTimes(1);
    });

    test("does not count a gesture from long before it came into view", () => {
      (useInViewport as any).mockReturnValue({ inViewport: false });
      const { rerender } = render(<DetectBottom onBottom={mockOnBottom} paused />);

      fireEvent.keyDown(window, { key: "End" });
      vi.advanceTimersByTime(1000);
      (useInViewport as any).mockReturnValue({ inViewport: true });
      rerender(<DetectBottom onBottom={mockOnBottom} paused />);
      expect(mockOnBottom).not.toHaveBeenCalled();
    });

    test("keeps a finger drag going across a parent re-render", () => {
      const { rerender } = render(<DetectBottom onBottom={mockOnBottom} paused />);

      fireEvent.touchStart(window, { touches: [{ clientY: 300 }] });
      rerender(<DetectBottom onBottom={() => mockOnBottom()} paused />);
      fireEvent.touchMove(window, { touches: [{ clientY: 200 }] });
      expect(mockOnBottom).toHaveBeenCalledTimes(1);
    });

    test("ignores Shift+Space, shortcuts, handled keys and menu items", () => {
      const { container } = render(
        <>
          <div role="menuitem" tabIndex={0}>item</div>
          <DetectBottom onBottom={mockOnBottom} paused />
        </>
      );

      fireEvent.keyDown(window, { key: " ", shiftKey: true });
      fireEvent.keyDown(window, { key: "End", metaKey: true });
      fireEvent.keyDown(container.querySelector('[role="menuitem"]')!, { key: " " });
      const handled = new KeyboardEvent("keydown", { key: "PageDown", cancelable: true });
      handled.preventDefault();
      window.dispatchEvent(handled);
      expect(mockOnBottom).not.toHaveBeenCalled();
    });

    test("stops listening once unmounted", () => {
      const { unmount } = render(<DetectBottom onBottom={mockOnBottom} paused />);
      unmount();
      fireEvent.wheel(window, { deltaY: 40 });
      expect(mockOnBottom).not.toHaveBeenCalled();
    });

    test("loads on its own again once unpaused", () => {
      const { rerender } = render(<DetectBottom onBottom={mockOnBottom} paused />);
      rerender(<DetectBottom onBottom={mockOnBottom} paused={false} />);
      expect(mockOnBottom).toHaveBeenCalledTimes(1);
    });
  });
});
