import React from "react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UIManager } from "@ui/core";
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle, isInOwnDropdownMenu } from "@ui/dropdown";

// The menu used to render in place as position:absolute, so any clipping
// ancestor (overflow hidden/auto, content-visibility) cut it off: the last
// comment's "..." menu lost its Delete item, chat and deck menus too. It now
// renders in a portal, outside every clipping box.
function renderInClippingBox(onItem = vi.fn()) {
  render(
    <UIManager>
      <div data-testid="clip" style={{ overflow: "hidden", height: 20 }}>
        <Dropdown>
          <DropdownToggle>
            <button type="button">menu</button>
          </DropdownToggle>
          <DropdownMenu>
            <DropdownItem onClick={onItem}>Delete</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </UIManager>
  );
  return onItem;
}

describe("DropdownMenu portal", () => {
  it("renders the open menu outside the clipping ancestor, fixed to the viewport", () => {
    renderInClippingBox();
    fireEvent.click(screen.getByText("menu"));

    const menu = screen.getByText("Delete").closest(".ecency-dropdown-menu") as HTMLElement;
    expect(menu).toBeInTheDocument();
    expect(screen.getByTestId("clip").contains(menu)).toBe(false);
    expect((menu.parentElement as HTMLElement).style.position).toBe("fixed");
  });

  it("keeps the menu open on mousedown inside it so the item click fires", () => {
    const onItem = renderInClippingBox();
    fireEvent.click(screen.getByText("menu"));

    const item = screen.getByText("Delete");
    fireEvent.mouseDown(item);
    expect(screen.getByText("Delete")).toBeInTheDocument();
    fireEvent.click(item);
    expect(onItem).toHaveBeenCalledTimes(1);
  });

  it("still closes on mousedown outside both the toggle and the menu", () => {
    renderInClippingBox();
    fireEvent.click(screen.getByText("menu"));

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("moves focus into the menu when it is opened from the keyboard", () => {
    renderInClippingBox();
    // A keyboard-activated click (Enter/Space on the toggle) has detail 0.
    fireEvent.click(screen.getByText("menu"), { detail: 0 });

    expect(document.activeElement).toBe(document.querySelector('.ecency-dropdown-menu [role="menuitem"]'));
  });

  it("leaves focus alone when it is opened with the mouse", () => {
    renderInClippingBox();
    const toggle = screen.getByText("menu");
    toggle.focus();
    fireEvent.click(toggle, { detail: 1 });

    expect(document.activeElement).toBe(toggle);
  });

  it("focuses a native button when the menu has no menu items", () => {
    render(
      <UIManager>
        <Dropdown>
          <DropdownToggle>
            <button type="button">menu</button>
          </DropdownToggle>
          <DropdownMenu>
            <button type="button">Reset</button>
          </DropdownMenu>
        </Dropdown>
      </UIManager>
    );
    fireEvent.click(screen.getByText("menu"), { detail: 0 });

    expect(document.activeElement).toBe(screen.getByText("Reset"));
  });

  it("closes on Escape and returns focus to the toggle", () => {
    renderInClippingBox();
    fireEvent.click(screen.getByText("menu"), { detail: 0 });

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });

    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText("menu"));
  });

  it("keeps the menu open while Tab moves between its items", () => {
    render(
      <UIManager>
        <Dropdown>
          <DropdownToggle>
            <button type="button">menu</button>
          </DropdownToggle>
          <DropdownMenu>
            <button type="button">First</button>
            <button type="button">Last</button>
          </DropdownMenu>
        </Dropdown>
      </UIManager>
    );
    fireEvent.click(screen.getByText("menu"), { detail: 0 });
    expect(document.activeElement).toBe(screen.getByText("First"));

    fireEvent.keyDown(screen.getByText("First"), { key: "Tab" });
    expect(screen.getByText("Last")).toBeInTheDocument();

    // Leaving forward from the last item closes and hands focus to the toggle,
    // so the browser's Tab continues from there.
    screen.getByText("Last").focus();
    fireEvent.keyDown(screen.getByText("Last"), { key: "Tab" });
    expect(screen.queryByText("Last")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText("menu"));
  });

  it("closes on Shift+Tab from the first item and focuses the toggle", () => {
    renderInClippingBox();
    fireEvent.click(screen.getByText("menu"), { detail: 0 });

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Tab", shiftKey: true });

    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText("menu"));
  });

  it("returns focus to the toggle after an item is chosen from the keyboard", () => {
    const onItem = renderInClippingBox();
    fireEvent.click(screen.getByText("menu"), { detail: 0 });
    const focused = document.activeElement as HTMLElement;

    fireEvent.keyDown(focused, { key: "Enter" });
    fireEvent.click(focused);

    expect(onItem).toHaveBeenCalled();
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByText("menu"));
  });

  it("tells a container's own open menu apart from other menus", () => {
    render(
      <UIManager>
        <div data-testid="form">
          <Dropdown>
            <DropdownToggle>
              <button type="button">own</button>
            </DropdownToggle>
            <DropdownMenu>
              <DropdownItem>own item</DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
        <Dropdown>
          <DropdownToggle>
            <button type="button">other</button>
          </DropdownToggle>
          <DropdownMenu>
            <DropdownItem>other item</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </UIManager>
    );
    const form = screen.getByTestId("form");

    fireEvent.click(screen.getByText("own"));
    expect(isInOwnDropdownMenu(form, screen.getByText("own item"))).toBe(true);
    fireEvent.mouseDown(document.body);

    fireEvent.click(screen.getByText("other"));
    expect(isInOwnDropdownMenu(form, screen.getByText("other item"))).toBe(false);
  });
});
