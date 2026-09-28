import {
  PUBLISH_HANDOFF_KEY,
  usePublishHandoff,
  usePublishHandoffWriter
} from "@/app/publish/_hooks/use-publish-handoff";
import { PREFIX } from "@/utils/local-storage";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOCAL_DRAFT_KEY = PREFIX + "_local_draft";

// A wave or deck thread over its character limit stages its content and opens
// /publish. That handoff used to be written into the submit page's local draft
// key, which nothing on /publish reads, so the content was dropped, and the
// partial write left that key holding a draft with no title that crashed
// /submit on its next visit (ECENCY-NEXT-1GJC).
describe("publish handoff", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stages content under its own key and leaves the submit draft alone", () => {
    const draft = { title: "in progress", tags: ["hive"], body: "a body", description: null };
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draft));

    const { result } = renderHook(() => usePublishHandoffWriter());
    act(() => result.current("an overflowing wave"));

    expect(JSON.parse(localStorage.getItem(PUBLISH_HANDOFF_KEY)!)).toEqual({
      body: "an overflowing wave"
    });
    expect(JSON.parse(localStorage.getItem(LOCAL_DRAFT_KEY)!)).toEqual(draft);
  });

  it("delivers staged content to the composer", () => {
    localStorage.setItem(PUBLISH_HANDOFF_KEY, JSON.stringify({ body: "an overflowing wave" }));

    const onReceive = vi.fn();
    renderHook(() => usePublishHandoff(onReceive));

    expect(onReceive).toHaveBeenCalledWith("an overflowing wave");
  });

  it("carries a title when one is staged (a Raidstead raid report)", () => {
    const writer = renderHook(() => usePublishHandoffWriter());
    act(() => writer.result.current("report body", "Week 1 raid report"));
    expect(JSON.parse(localStorage.getItem(PUBLISH_HANDOFF_KEY)!)).toEqual({
      body: "report body",
      title: "Week 1 raid report"
    });

    const onReceive = vi.fn();
    renderHook(() => usePublishHandoff(onReceive));
    expect(onReceive).toHaveBeenCalledWith("report body", "Week 1 raid report");
  });

  it("ignores a title that is not text", () => {
    localStorage.setItem(PUBLISH_HANDOFF_KEY, JSON.stringify({ body: "a body", title: { x: 1 } }));
    const onReceive = vi.fn();
    renderHook(() => usePublishHandoff(onReceive));
    expect(onReceive).toHaveBeenCalledWith("a body");
  });

  it("delivers once, so a later visit opens an empty composer", () => {
    localStorage.setItem(PUBLISH_HANDOFF_KEY, JSON.stringify({ body: "an overflowing wave" }));

    const first = vi.fn();
    renderHook(() => usePublishHandoff(first)).unmount();
    expect(first).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PUBLISH_HANDOFF_KEY)).toBeNull();

    const second = vi.fn();
    renderHook(() => usePublishHandoff(second));
    expect(second).not.toHaveBeenCalled();
  });

  it("does nothing when nothing is staged", () => {
    const onReceive = vi.fn();
    renderHook(() => usePublishHandoff(onReceive));

    expect(onReceive).not.toHaveBeenCalled();
  });

  it("drops a staged entry with an empty body instead of leaving it behind", () => {
    localStorage.setItem(PUBLISH_HANDOFF_KEY, JSON.stringify({ body: "" }));

    const onReceive = vi.fn();
    renderHook(() => usePublishHandoff(onReceive));

    expect(onReceive).not.toHaveBeenCalled();
    // Nothing to deliver is still something to clean up, otherwise the entry is
    // re-examined on every later visit and never consumed.
    expect(localStorage.getItem(PUBLISH_HANDOFF_KEY)).toBeNull();
  });

  it("drops a staged entry it cannot read a body from", () => {
    localStorage.setItem(PUBLISH_HANDOFF_KEY, JSON.stringify({ note: "not a handoff" }));

    const onReceive = vi.fn();
    renderHook(() => usePublishHandoff(onReceive));

    expect(onReceive).not.toHaveBeenCalled();
    expect(localStorage.getItem(PUBLISH_HANDOFF_KEY)).toBeNull();
  });

  it("round-trips from writer to composer", () => {
    const writer = renderHook(() => usePublishHandoffWriter());
    act(() => writer.result.current("wave text<br>![](https://images.ecency.com/x.png)"));

    const onReceive = vi.fn();
    renderHook(() => usePublishHandoff(onReceive));

    expect(onReceive).toHaveBeenCalledWith("wave text<br>![](https://images.ecency.com/x.png)");
  });
});
