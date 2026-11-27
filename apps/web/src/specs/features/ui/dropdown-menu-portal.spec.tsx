import React from "react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UIManager } from "@ui/core";
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle } from "@ui/dropdown";

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
});
