import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { EntryListLoadError } from "@/features/shared/entry-list-content/entry-list-load-error";

describe("EntryListLoadError", () => {
  it("shows sad Esie when the list has nothing on screen", () => {
    const { container } = render(<EntryListLoadError onRetry={vi.fn()} nothingShown />);

    expect(container.querySelector('img[data-esie-mood="sad"]')).toBeInTheDocument();
  });

  it("stays a plain footer under a list that has entries", () => {
    const { container } = render(<EntryListLoadError onRetry={vi.fn()} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("entry-index.load-error");
  });
});
