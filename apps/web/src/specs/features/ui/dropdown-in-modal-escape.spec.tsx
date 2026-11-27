import React from "react";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UIManager } from "@ui/core";
import { Modal } from "@ui/modal";
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from "@ui/dropdown";

// The menu closes on Escape keydown; Modal dismisses on Escape keyup. One press
// sends both, so without a guard the sidebar's language menu took the sidebar
// down with it. Dispatch the real keydown + keyup pair.
// A browser sends keyup to whatever has focus by then (the toggle, once the
// menu closed), not to the element that got the keydown.
function pressEscape() {
  fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
  fireEvent.keyUp(document.activeElement as Element, { key: "Escape" });
}

describe("Escape in a dropdown inside a modal", () => {
  let portalRoot: HTMLElement;
  beforeEach(() => {
    portalRoot = document.createElement("div");
    portalRoot.id = "modal-dialog-container";
    document.body.appendChild(portalRoot);
  });
  afterEach(() => portalRoot.remove());

  it("closes only the menu, and the next Escape closes the modal", async () => {
    const onHide = vi.fn();
    render(
      <UIManager>
        <Modal show={true} onHide={onHide}>
          <Dropdown>
            <DropdownToggle>
              <button type="button">lang</button>
            </DropdownToggle>
            <DropdownMenu>
              <DropdownItem onClick={vi.fn()}>English</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </Modal>
      </UIManager>
    );
    fireEvent.click(screen.getByText("lang"), { detail: 0 });
    expect(document.activeElement).toBe(screen.getByText("English"));

    pressEscape();
    expect(screen.queryByText("English")).not.toBeInTheDocument();
    // The modal reports its close from an effect: let it run before asserting.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(onHide).not.toHaveBeenCalled();
    expect(screen.getByText("lang")).toBeInTheDocument();

    pressEscape();
    await waitFor(() => expect(onHide).toHaveBeenCalled());
  });
});
