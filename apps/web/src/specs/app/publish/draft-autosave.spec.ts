import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MIN_INTERVAL_MS
} from "@/app/publish/_hooks/autosave-policy";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveToDraft = vi.hoisted(() => vi.fn());
const isActiveTab = vi.hoisted(() => ({ current: true }));

vi.mock("@/app/publish/_api", () => ({
  useSaveDraftApi: () => ({ mutateAsync: saveToDraft })
}));

vi.mock("@/app/publish/_hooks/use-draft-tab-coordinator", () => ({
  useDraftTabCoordinator: () => ({ isActiveTab: isActiveTab.current })
}));

const { useDraftAutosave } = await import("@/app/publish/_hooks/use-draft-autosave");

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function renderAutosave(initial: Record<string, unknown>) {
  return renderHook(
    ({ snapshot }: { snapshot: Record<string, unknown> }) =>
      useDraftAutosave({ enabled: true, snapshot }),
    { initialProps: { snapshot: initial } }
  );
}

describe("useDraftAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveToDraft.mockReset();
    saveToDraft.mockResolvedValue(undefined);
    isActiveTab.current = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves once the debounce window closes", async () => {
    renderAutosave({ title: "a title", content: "a body" });

    await advance(AUTOSAVE_DEBOUNCE_MS);

    expect(saveToDraft).toHaveBeenCalledTimes(1);
  });

  // Regression: the minimum-interval check used to `return` outright, which
  // discarded the save rather than deferring it. The next attempt could then
  // only come from a *further* edit plus another full debounce window, so an
  // edit made shortly after a save - and not followed by more typing - never
  // reached the server at all.
  it("defers a throttled save instead of dropping it", async () => {
    const { rerender } = renderAutosave({ title: "a title", content: "a body" });

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    // An edit landing inside the minimum interval, with no typing after it.
    rerender({ snapshot: { title: "a title", content: "a longer body" } });
    await advance(AUTOSAVE_DEBOUNCE_MS);

    // Still throttled, so nothing yet - but it must be queued, not lost.
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    await advance(AUTOSAVE_MIN_INTERVAL_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(2);
  });

  it("does not save again when nothing changed", async () => {
    const snapshot = { title: "a title", content: "a body" };
    const { rerender } = renderAutosave(snapshot);

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    rerender({ snapshot: { ...snapshot } });
    await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);

    expect(saveToDraft).toHaveBeenCalledTimes(1);
  });

  it("stays quiet while another tab holds the draft", async () => {
    isActiveTab.current = false;
    renderAutosave({ title: "a title", content: "a body" });

    await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);

    expect(saveToDraft).not.toHaveBeenCalled();
  });
});
