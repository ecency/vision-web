import { PublishModeHeader } from "@/app/publish/_components/publish-mode-header";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/shared/quest-streak-chip", () => ({
  QuestStreakChip: () => null
}));

const SAVED_AT = new Date("2026-07-30T10:42:33Z");

describe("PublishModeHeader", () => {
  it("offers the open-draft action once a draft has been auto-saved", () => {
    const onOpenDraft = vi.fn();
    render(
      <PublishModeHeader label="New Content" lastSaved={SAVED_AT} onOpenDraft={onOpenDraft} />
    );

    fireEvent.click(screen.getByRole("button", { name: "publish.open-draft" }));
    expect(onOpenDraft).toHaveBeenCalledTimes(1);
  });

  it("hides the action before anything has been saved", () => {
    render(<PublishModeHeader label="New Content" onOpenDraft={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "publish.open-draft" })).toBeNull();
  });

  // The draft and entry editors are already sitting on their content, so they
  // pass no handler and must not grow an extra control.
  it("hides the action for views that do not pass a handler", () => {
    render(<PublishModeHeader label="Draft Editing" lastSaved={SAVED_AT} />);

    expect(screen.queryByRole("button", { name: "publish.open-draft" })).toBeNull();
  });

  it("blocks a second click while the flush is in flight", () => {
    const onOpenDraft = vi.fn();
    render(
      <PublishModeHeader
        label="New Content"
        lastSaved={SAVED_AT}
        onOpenDraft={onOpenDraft}
        isOpeningDraft={true}
      />
    );

    const button = screen.getByRole("button", { name: "publish.open-draft" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onOpenDraft).not.toHaveBeenCalled();
  });

  // This strip is text-xs and shares its row with the quest chip, so the
  // timestamp stays hours-and-minutes: the default format spells out seconds.
  it("renders the saved time without seconds", () => {
    const { container } = render(
      <PublishModeHeader label="New Content" lastSaved={SAVED_AT} onOpenDraft={vi.fn()} />
    );

    expect(container.textContent).not.toMatch(/\d{1,2}:\d{2}:\d{2}/);
    expect(container.textContent).toMatch(/\d{1,2}:\d{2}/);
  });
});
