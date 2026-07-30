import {
  AUTOSAVE_COOLDOWN_MS,
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_FAIL_THRESHOLD,
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

  // Responses are not guaranteed to return in send order, so a slow earlier
  // save can land after a newer one and overwrite the newer content on the
  // server - and then mark the newer content as already persisted.
  it("never puts two saves on the wire at once", async () => {
    let resolveFirst: (() => void) | undefined;
    saveToDraft.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
    );

    const { rerender } = renderAutosave({ title: "a title", content: "a body" });

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    // A later edit, well past the throttle window, while the first save is
    // still unresolved.
    rerender({ snapshot: { title: "a title", content: "a longer body" } });
    await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    // Once it lands, the deferred save is free to go.
    await act(async () => {
      resolveFirst?.();
    });
    await advance(AUTOSAVE_MIN_INTERVAL_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(2);
  });

  // The Open draft action flushes through this same engine rather than opening
  // its own mutation. If it wrote independently, a slow autosave already on the
  // wire could land *after* the flush, put older content back on the server and
  // in the drafts cache, and the composer would then navigate to read exactly
  // that stale copy.
  it("queues a user-initiated flush behind an autosave already on the wire", async () => {
    const order: string[] = [];
    let resolveAutosave: (() => void) | undefined;

    saveToDraft.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveAutosave = () => {
            order.push("autosave");
            resolve();
          };
        })
    );

    const { result } = renderHook(
      ({ snapshot }: { snapshot: Record<string, unknown> }) =>
        useDraftAutosave({ enabled: true, snapshot }),
      { initialProps: { snapshot: { title: "a title", content: "a body" } } }
    );

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    saveToDraft.mockImplementation(async () => {
      order.push("flush");
    });

    // Flush while the autosave is still unresolved.
    let flushed: Promise<unknown> | undefined;
    await act(async () => {
      flushed = result.current.flush();
    });

    // It must not have gone out yet - the autosave still owns the wire.
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAutosave?.();
      await flushed;
    });

    expect(saveToDraft).toHaveBeenCalledTimes(2);
    expect(order).toEqual(["autosave", "flush"]);
  });

  // The created id arrives via setState, so it is a render behind. A write
  // queued straight after the create runs as a microtask, before React has
  // re-rendered, and would otherwise still be bound to `undefined` - taking the
  // create path a second time and leaving two drafts for one post.
  it("targets the draft the queued create just made, rather than creating another", async () => {
    const targets: (string | undefined)[] = [];
    let resolveCreate: ((id: string) => void) | undefined;

    saveToDraft.mockImplementationOnce(
      (options: { draftId?: string }) =>
        new Promise<string>((resolve) => {
          targets.push(options?.draftId);
          resolveCreate = (id: string) => resolve(id);
        })
    );
    saveToDraft.mockImplementation(async (options: { draftId?: string }) => {
      targets.push(options?.draftId);
      return undefined;
    });

    const { result } = renderHook(
      ({ snapshot }: { snapshot: Record<string, unknown> }) =>
        useDraftAutosave({ enabled: true, snapshot }),
      { initialProps: { snapshot: { title: "a title", content: "a body" } } }
    );

    // Autosave takes the create path: no draft exists yet.
    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(targets).toEqual([undefined]);

    // A manual save queues behind the still-unresolved create.
    let flushed: Promise<unknown> | undefined;
    await act(async () => {
      flushed = result.current.flush();
    });

    await act(async () => {
      resolveCreate?.("created-draft-id");
      await flushed;
    });

    // The queued write must update that draft, not create a second one.
    expect(targets).toEqual([undefined, "created-draft-id"]);

    // And it must report the update path, since useSaveDraftApi only redirects
    // from its create branch - the caller has to navigate itself.
    await expect(flushed).resolves.toEqual({
      draftId: "created-draft-id",
      created: false
    });
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

  // The breaker is what keeps a broken endpoint (drafts-add returning 406, say)
  // from being hit every debounce window for as long as the writer keeps
  // typing.
  it("backs off after repeated failures, then resumes once the cooldown elapses", async () => {
    saveToDraft.mockRejectedValue(new Error("drafts-add 406"));

    const { rerender } = renderAutosave({ title: "a title", content: "body 0" });
    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(1);

    for (let i = 1; i < AUTOSAVE_FAIL_THRESHOLD; i++) {
      rerender({ snapshot: { title: "a title", content: `body ${i}` } });
      await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);
    }
    expect(saveToDraft).toHaveBeenCalledTimes(AUTOSAVE_FAIL_THRESHOLD);

    // Breaker open: further edits are not sent at all.
    rerender({ snapshot: { title: "a title", content: "while backed off" } });
    await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(AUTOSAVE_FAIL_THRESHOLD);

    saveToDraft.mockResolvedValue(undefined);
    await advance(AUTOSAVE_COOLDOWN_MS);

    rerender({ snapshot: { title: "a title", content: "after the cooldown" } });
    await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);
    expect(saveToDraft).toHaveBeenCalledTimes(AUTOSAVE_FAIL_THRESHOLD + 1);
  });

  // inFlightRef only serialises one tab. Ordering between tabs is the draft
  // lock's job, so a user-initiated flush has to respect it too - otherwise an
  // inactive tab could overwrite whatever the tab holding the lock just stored.
  it("refuses a flush from a tab that does not hold the draft lock", async () => {
    isActiveTab.current = false;

    const { result } = renderHook(() =>
      useDraftAutosave({ enabled: true, snapshot: { title: "a title", content: "a body" } })
    );

    await expect(result.current.flush()).rejects.toThrow(/another tab/i);
    expect(saveToDraft).not.toHaveBeenCalled();
  });

  // The engine latched the created draft id and never let go, while clearAll
  // reset only publish state. Clearing the composer (or applying a template, or
  // publishing) therefore left the next post writing into the *previous* post's
  // draft - overwriting a post that the UI still claimed was safely auto-saved.
  it("drops the draft binding when the composer is cleared", async () => {
    const targets: (string | undefined)[] = [];
    saveToDraft.mockImplementation(async (options: { draftId?: string }) => {
      targets.push(options?.draftId);
      return targets.length === 1 ? "draft-for-post-a" : undefined;
    });

    const { rerender } = renderHook(
      ({ snapshot, resetKey }: { snapshot: Record<string, unknown>; resetKey: number }) =>
        useDraftAutosave({ enabled: true, snapshot, resetKey }),
      { initialProps: { snapshot: { title: "post A", content: "body A" }, resetKey: 0 } }
    );

    await advance(AUTOSAVE_DEBOUNCE_MS);
    expect(targets).toEqual([undefined]);

    // Clear, then write a different post.
    rerender({ snapshot: { title: "post B", content: "body B" }, resetKey: 1 });
    await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);

    // Post B must create its own draft, not overwrite post A's.
    expect(targets).toEqual([undefined, undefined]);
  });

  // After a clear the composer is empty but the engine still knew a draft id,
  // and flush had no content guard - so Open draft, the action offered to
  // recover the auto-saved post, wrote an empty post over it instead.
  it("refuses to flush when there is nothing worth saving", async () => {
    const { result } = renderHook(() =>
      useDraftAutosave({ enabled: false, snapshot: { title: "", content: "" } })
    );

    await expect(result.current.flush()).rejects.toThrow(/nothing worth saving/i);
    expect(saveToDraft).not.toHaveBeenCalled();
  });

  it("stays quiet while another tab holds the draft", async () => {
    isActiveTab.current = false;
    renderAutosave({ title: "a title", content: "a body" });

    await advance(AUTOSAVE_DEBOUNCE_MS + AUTOSAVE_MIN_INTERVAL_MS);

    expect(saveToDraft).not.toHaveBeenCalled();
  });
});
