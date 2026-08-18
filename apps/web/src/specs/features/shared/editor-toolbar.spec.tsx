import { vi } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The toolbar's own text insertion (input-util) is the behaviour under test,
// so it stays real; only the token/session plumbing that rides along in the
// same barrel is stubbed.
vi.mock("@/utils", async () => {
  const inputUtil = await vi.importActual<Record<string, unknown>>("@/utils/input-util");
  return {
    ...inputUtil,
    random: vi.fn(() => "rnd"),
    getAccessToken: vi.fn(() => "mock-token"),
    ensureValidToken: vi.fn(async () => "mock-token")
  };
});
vi.mock("@/api/sdk-mutations", () => ({
  useUploadImageMutation: () => ({ mutateAsync: vi.fn(), isPending: false })
}));
vi.mock("@/core/global-store", () => ({
  useGlobalStore: (selector: (s: { theme: string }) => unknown) => selector({ theme: "day" })
}));

import { EditorToolbar } from "@/features/shared/editor-toolbar";
import { handleEditorShortcut } from "@/features/shared/editor-toolbar/shortcuts";

// One markdown composer as the comment box and the /submit page assemble it:
// the toolbar next to a `.the-editor` textarea, with the shortcut handler on
// the wrapper the way `Comment` and `/submit` attach it.
function Composer({ name, value }: { name: string; value: string }) {
  return (
    <div role="presentation" onKeyDown={handleEditorShortcut}>
      <EditorToolbar comment={true} sm={true} />
      <textarea className="the-editor" aria-label={name} defaultValue={value} />
    </div>
  );
}

function renderComposers(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Composer name="first" value="alpha" />
      <Composer name="second" value="beta" />
    </QueryClientProvider>
  );
}

function focusAndSelect(name: string, start: number, end: number): HTMLTextAreaElement {
  const box = screen.getByRole("textbox", { name }) as HTMLTextAreaElement;
  box.focus();
  box.setSelectionRange(start, end);
  return box;
}

describe("EditorToolbar", () => {
  test("Ctrl+B wraps the selection of the composer being typed in", () => {
    renderComposers();
    const first = focusAndSelect("first", 0, 5);

    fireEvent.keyDown(first, { key: "b", code: "KeyB", ctrlKey: true });

    expect(first).toHaveValue("**alpha**");
  });

  test("Ctrl+I wraps the selection with single stars", () => {
    renderComposers();
    const first = focusAndSelect("first", 0, 5);

    fireEvent.keyDown(first, { key: "i", code: "KeyI", ctrlKey: true });

    expect(first).toHaveValue("*alpha*");
  });

  test("a shortcut leaves every other composer on the page alone", () => {
    // Every mounted toolbar hears the same window event. Before the focus
    // gate, this keystroke produced `beta****` in the second box and moved the
    // caret there.
    renderComposers();
    const first = focusAndSelect("first", 0, 5);
    const second = screen.getByRole("textbox", { name: "second" });

    fireEvent.keyDown(first, { key: "b", code: "KeyB", ctrlKey: true });

    expect(first).toHaveValue("**alpha**");
    expect(second).toHaveValue("beta");
    expect(document.activeElement).toBe(first);
  });

  test("a shortcut with no editor focused does nothing", () => {
    // Nothing to aim at: acting anyway would format whichever box happened to
    // be mounted first, exactly the bug the gate is for.
    renderComposers();
    (document.activeElement as HTMLElement | null)?.blur();

    window.dispatchEvent(new Event("bold"));

    expect(screen.getByRole("textbox", { name: "first" })).toHaveValue("alpha");
    expect(screen.getByRole("textbox", { name: "second" })).toHaveValue("beta");
  });

  test("the toolbar button formats its own composer without needing focus", () => {
    // Clicking a button moves focus onto the button, so the button path must
    // not go through the focus gate.
    renderComposers();
    focusAndSelect("second", 0, 4);

    const [, secondBold] = screen.getAllByRole("button", { name: "editor-toolbar.bold" });
    fireEvent.click(secondBold);

    expect(screen.getByRole("textbox", { name: "second" })).toHaveValue("**beta**");
    expect(screen.getByRole("textbox", { name: "first" })).toHaveValue("alpha");
  });
});
