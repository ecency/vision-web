import React from "react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UIManager } from "@ui/core";

vi.mock("@ecency/sdk", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  HIVE_OPERATION_LIST: ["transfer", "fill_order"]
}));

import { HiveOperationFilterSelect } from "@/app/(dynamicPages)/profile/[username]/wallet/(token)/_components/hive-operation-filter-select";

// The filter menu holds only native buttons (Reset and one per operation). The
// menu is portaled to the end of the page, so a keyboard open has to put focus
// inside it or Tab walks through unrelated page controls first.
describe("HiveOperationFilterSelect keyboard access", () => {
  it("moves focus to the first button in the menu when opened from the keyboard", () => {
    render(
      <UIManager>
        <HiveOperationFilterSelect selected={[]} onChange={vi.fn()} />
      </UIManager>
    );
    const toggle = document.querySelector(".ecency-dropdown-toggle button") as HTMLElement;

    fireEvent.click(toggle, { detail: 0 });

    const menu = document.querySelector(".ecency-dropdown-menu") as HTMLElement;
    expect(menu).toBeInTheDocument();
    expect(menu.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe("BUTTON");
  });
});
