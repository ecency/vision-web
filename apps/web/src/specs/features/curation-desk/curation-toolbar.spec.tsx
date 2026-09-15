import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CurationWindow } from "@ecency/sdk";
import { CurationToolbar } from "@/features/curation-desk/curation-toolbar";
import { countActiveFilters, defaultQueueFilters, narrowsBacklog, resolveFilters } from "@/features/curation-desk/hooks";

function renderToolbar(isRoster: boolean, extra: { totalEstimate?: number; window?: CurationWindow } = {}) {
  const onChange = vi.fn();
  const filters = { ...defaultQueueFilters(), ...(extra.window ? { window: extra.window } : {}) };
  // The count and the narrowing flag come from the same functions the queue
  // view uses, so a label cannot pass here on props the desk never produces.
  render(
    <CurationToolbar
      filters={resolveFilters(filters, isRoster)}
      isRoster={isRoster}
      totalEstimate={extra.totalEstimate ?? null}
      activeFilterCount={countActiveFilters(filters, isRoster)}
      narrowed={narrowsBacklog(filters, isRoster)}
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

  /**
   * total_estimate is the team backlog at every age, so under the default
   * 24 h window it is not the number of posts that match what is on screen.
   */
  it("labels the count as backlog under the default window, with nothing to reset", () => {
    renderToolbar(true, { totalEstimate: 40 });
    expect(screen.queryByText("curation-desk.toolbar.backlog")).not.toBeNull();
    expect(screen.queryByText("curation-desk.toolbar.match")).toBeNull();
    expect(screen.queryByLabelText("curation-desk.toolbar.reset")).toBeNull();
  });

  /**
   * "All windows" moves away from the default, so Reset appears, and it
   * narrows nothing, so the count is the number of matches.
   */
  it("labels the count as matches once every window is shown, with Reset on offer", () => {
    renderToolbar(true, { totalEstimate: 40, window: "all" });
    expect(screen.queryByText("curation-desk.toolbar.match")).not.toBeNull();
    expect(screen.queryByText("curation-desk.toolbar.backlog")).toBeNull();
    expect(screen.queryByLabelText("curation-desk.toolbar.reset")).not.toBeNull();
  });

  it("offers unreviewed only to the roster alone", () => {
    renderToolbar(false);
    expect(screen.queryByRole("switch", { name: "curation-desk.filters.hide-curated" })).not.toBeNull();
    expect(screen.queryByRole("switch", { name: "curation-desk.filters.unreviewed" })).toBeNull();
  });
});
