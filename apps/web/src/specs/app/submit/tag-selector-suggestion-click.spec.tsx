import React, { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/publish",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({})
}));

import { getTrendingTagsQueryOptions } from "@ecency/sdk";
import { TagSelector } from "@/app/submit/_components/tag-selector";
import { createTestQueryClient, renderWithQueryClient } from "@/specs/test-utils";

const TRENDING = ["deutsch", "dibujodigital", "defence", "discord"];

function renderSelector() {
  const onChange = vi.fn();

  // The selector is controlled, so keep the committed tags in state — otherwise a
  // stale `tags` prop hides whether the second commit saw the first one.
  function Harness() {
    const [tags, setTags] = useState<string[]>([]);
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

  // Seed through the same factory the component calls, so the key can never drift
  // apart from the mock's.
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getTrendingTagsQueryOptions(250).queryKey, {
    pages: [TRENDING],
    pageParams: [""]
  });

  renderWithQueryClient(<Harness />, { queryClient });

  const input = screen.getByRole("textbox") as HTMLInputElement;
  fireEvent.focus(input);

  return { input, onChange };
}

/**
 * jsdom does not implement the browser's focus-on-mousedown behaviour, and the app
 * has no user-event dependency, so spell the real sequence out: a browser moves
 * focus off the input on mousedown *unless* the handler calls preventDefault, and
 * only then delivers the click. `fireEvent` returns false when the event was
 * cancelled, which is exactly that condition.
 */
function clickSuggestion(input: HTMLInputElement, label: string) {
  const item = screen.getByText(label).closest("a")!;
  const focusMoves = fireEvent.mouseDown(item);
  if (focusMoves) {
    fireEvent.blur(input);
  }
  fireEvent.click(item);
}

describe("TagSelector suggestion click", () => {
  it("commits the clicked suggestion, not the partially typed value", () => {
    const { input, onChange } = renderSelector();

    fireEvent.input(input, { target: { value: "de" } });
    expect(screen.getByText("deutsch")).toBeTruthy();

    clickSuggestion(input, "deutsch");

    // Regression: the input's blur handler used to commit "de" first, which emptied
    // the suggestion list and unmounted the row before its click could land.
    expect(onChange).toHaveBeenCalledWith(["deutsch"]);
    expect(onChange).not.toHaveBeenCalledWith(["de"]);
    expect(input.value).toBe("");
  });

  it("keeps the input focused so a second suggestion can be picked", () => {
    const { input, onChange } = renderSelector();

    fireEvent.input(input, { target: { value: "de" } });
    clickSuggestion(input, "deutsch");

    expect(document.activeElement).toBe(input);

    fireEvent.input(input, { target: { value: "di" } });
    clickSuggestion(input, "discord");

    expect(onChange).toHaveBeenLastCalledWith(["deutsch", "discord"]);
  });
});
