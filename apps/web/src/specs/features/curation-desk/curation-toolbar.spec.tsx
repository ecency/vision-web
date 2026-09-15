import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CurationToolbar } from "@/features/curation-desk/curation-toolbar";
import { defaultQueueFilters, resolveFilters } from "@/features/curation-desk/hooks";

function renderToolbar(isRoster: boolean) {
  const onChange = vi.fn();
  render(
    <CurationToolbar
      filters={resolveFilters(defaultQueueFilters(), isRoster)}
      isRoster={isRoster}
      totalEstimate={null}
      activeFilterCount={0}
      savedOwner={null}
      onSort={vi.fn()}
      onChange={onChange}
      onReshuffle={vi.fn()}
      onReset={vi.fn()}
    />
  );
  return { onChange };
}

/**
 * The controls a curator changes while working sit on the sort's line, so a
 * wide screen does not spend a row on each of them.
 */
describe("CurationToolbar", () => {
  it("puts the window next to the sort and changes it from there", () => {
    const { onChange } = renderToolbar(true);
    const select = screen.getByLabelText("curation-desk.filters.window") as HTMLSelectElement;
    expect(select.value).toBe("full");
    fireEvent.change(select, { target: { value: "all" } });
    expect(onChange).toHaveBeenCalledWith({ window: "all" });
  });

  it("toggles the handled-post chips from the toolbar", () => {
    const { onChange } = renderToolbar(true);
    fireEvent.click(screen.getByRole("switch", { name: "curation-desk.filters.hide-curated" }));
    expect(onChange).toHaveBeenCalledWith({ hideCurated: false });
    fireEvent.click(screen.getByRole("switch", { name: "curation-desk.filters.unreviewed" }));
    expect(onChange).toHaveBeenCalledWith({ unreviewedOnly: false });
  });

  it("offers unreviewed only to the roster alone", () => {
    renderToolbar(false);
    expect(screen.queryByRole("switch", { name: "curation-desk.filters.hide-curated" })).not.toBeNull();
    expect(screen.queryByRole("switch", { name: "curation-desk.filters.unreviewed" })).toBeNull();
  });
});
