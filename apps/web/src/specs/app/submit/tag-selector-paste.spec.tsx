import React, { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/submit",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({})
}));

import { TagSelector } from "@/app/submit/_components/tag-selector";
import { renderWithQueryClient } from "@/specs/test-utils";

function renderSelector(initial: string[] = []) {
  const onChange = vi.fn();

  function Harness() {
    const [tags, setTags] = useState<string[]>(initial);
    return (
      <TagSelector
        tags={tags}
        maxItem={10}
        onChange={(next) => {
          onChange(next);
          setTags(next);
        }}
      />
    );
  }

  renderWithQueryClient(<Harness />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  return { input, onChange };
}

function paste(input: HTMLInputElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe("TagSelector paste", () => {
  it("keeps the valid tokens of a mixed paste and drops the invalid ones", () => {
    const { input, onChange } = renderSelector(["hive"]);

    paste(input, "travel my-first-post 2026recap photo-walk photography-");

    expect(onChange).toHaveBeenLastCalledWith(["hive", "travel", "photo-walk"]);
    // The first rejected token's rule is the one shown.
    expect(screen.getByText("tag-selector.limited_dash")).toBeTruthy();
  });

  it("shows no warning when every pasted token is valid", () => {
    const { input, onChange } = renderSelector();

    paste(input, "travel, photo-walk #web3");

    expect(onChange).toHaveBeenLastCalledWith(["travel", "photo-walk", "web3"]);
    expect(document.querySelector(".tag-selector .warning")).toBeNull();
  });
});
