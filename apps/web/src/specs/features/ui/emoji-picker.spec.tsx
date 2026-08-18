import { vi } from "vitest";
import React, { useRef } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// jsdom has neither ResizeObserver nor layout, so floating-ui's auto-update
// needs a stub. Coordinates are therefore meaningless here; what this spec
// pins down is the behaviour around them, which is where the bugs were.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverStub,
  writable: true,
  configurable: true
});

vi.mock("@emoji-mart/data", () => ({ default: {} }));
vi.mock("@emoji-mart/react", () => ({
  // eslint-disable-next-line react/display-name
  default: ({ onEmojiSelect }: { onEmojiSelect: (e: { native: string }) => void }) => (
    <button data-testid="emoji-grid" onClick={() => onEmojiSelect({ native: "👍" })}>
      grid
    </button>
  )
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: { theme: string }) => unknown) => selector({ theme: "day" })
}));

import { EmojiPicker } from "@/features/ui/emoji-picker";

function Harness({
  show,
  changeState,
  onSelect,
  withTrigger = true
}: {
  show: boolean;
  changeState: (v: boolean) => void;
  onSelect?: (v: string) => void;
  withTrigger?: boolean;
}) {
  const buttonRef = useRef<HTMLElement | null>(null);

  return (
    <div>
      <button ref={buttonRef as React.RefObject<HTMLButtonElement>} data-testid="trigger">
        emoji
      </button>
      <div data-testid="elsewhere">elsewhere</div>
      <EmojiPicker
        show={show}
        changeState={changeState}
        onSelect={onSelect ?? (() => {})}
        buttonRef={withTrigger ? buttonRef : undefined}
      />
    </div>
  );
}

function renderPicker(props: Partial<React.ComponentProps<typeof Harness>> = {}) {
  const changeState = vi.fn();
  const onSelect = vi.fn();
  const container = document.createElement("div");
  container.id = "popper-container";
  document.body.appendChild(container);

  const utils = render(
    <Harness show={true} changeState={changeState} onSelect={onSelect} {...props} />
  );

  return { changeState, onSelect, popper: container, ...utils };
}

const dialog = () => document.querySelector(".emoji-picker-dialog") as HTMLElement | null;

describe("EmojiPicker", () => {
  afterEach(() => {
    document.getElementById("popper-container")?.remove();
  });

  test("renders nothing while closed", () => {
    renderPicker({ show: false });

    expect(dialog()).toBeNull();
  });

  test("renders into the popper container, not next to its trigger", () => {
    // Escaping the toolbar's subtree is what keeps an ancestor with a
    // backdrop-filter (the decks post viewer) from capturing fixed positioning.
    const { popper } = renderPicker();

    expect(dialog()).not.toBeNull();
    expect(popper.contains(dialog())).toBe(true);
  });

  test("stays invisible while it has nothing to be positioned against", () => {
    // The panel used to paint at its static position for a frame before the
    // coordinates were written, which put it a whole viewport away on a
    // scrolled page. Without a trigger to anchor to there is no position to
    // compute, so it must never become visible.
    renderPicker({ withTrigger: false });

    expect(dialog()).toHaveStyle({ visibility: "hidden" });
  });

  test("becomes visible once positioned against its trigger", async () => {
    renderPicker();

    await waitFor(() => expect(dialog()).toHaveStyle({ visibility: "visible" }));
  });

  test("closes on a pointer down outside", () => {
    const { changeState, getByTestId } = renderPicker();

    fireEvent.pointerDown(getByTestId("elsewhere"));

    expect(changeState).toHaveBeenCalledWith(false);
  });

  test("stays open on a pointer down inside the panel", () => {
    const { changeState, getByTestId } = renderPicker();

    fireEvent.pointerDown(getByTestId("emoji-grid"));

    expect(changeState).not.toHaveBeenCalled();
  });

  test("leaves the trigger to toggle itself", () => {
    // Closing here would fight the trigger's own click handler and reopen it.
    const { changeState, getByTestId } = renderPicker();

    fireEvent.pointerDown(getByTestId("trigger"));

    expect(changeState).not.toHaveBeenCalled();
  });

  test("hands the picked emoji up and closes", () => {
    const { changeState, onSelect, getByTestId } = renderPicker();

    fireEvent.click(getByTestId("emoji-grid"));

    expect(onSelect).toHaveBeenCalledWith("👍");
    expect(changeState).toHaveBeenCalledWith(false);
  });
});
