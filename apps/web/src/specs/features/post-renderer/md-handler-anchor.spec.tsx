import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MdHandler } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/md-handler";

// A post's own ids are namespaced by the renderer (`id="user-content-intro"`),
// so a shared link to `#intro` must still land on that element, as must a
// link to an author's `data-id` anchor.
describe("MdHandler", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
    vi.useRealTimers();
  });

  it.each([
    ["#intro", '<div id="user-content-intro">x</div>'],
    ["#user-content-intro", '<div id="user-content-intro">x</div>'],
    ["#intro", '<a data-id="intro"></a>'],
    ["#user-content-intro", '<a data-id="intro"></a>'],
    // An author's own data-id that happens to start with the prefix.
    ["#user-content-x", '<a data-id="user-content-x"></a>']
  ])("scrolls %s to %s", (hash, markup) => {
    vi.useFakeTimers();
    document.body.innerHTML = markup;
    const target = document.body.firstElementChild as HTMLElement;
    target.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", `/${hash}`);
    render(<MdHandler />);
    vi.advanceTimersByTime(400);
    expect(target.scrollIntoView).toHaveBeenCalled();
  });

  it("prefers the exact id over a data-id that only matches without the prefix", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<a data-id="sec"></a><div id="user-content-sec">x</div>';
    const [byDataId, byId] = Array.from(document.body.children) as HTMLElement[];
    byDataId.scrollIntoView = vi.fn();
    byId.scrollIntoView = vi.fn();
    window.history.replaceState(null, "", "/#user-content-sec");
    render(<MdHandler />);
    vi.advanceTimersByTime(400);
    expect(byId.scrollIntoView).toHaveBeenCalled();
    expect(byDataId.scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not throw on a hash that is not a valid selector", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", '/#a"]b');
    render(<MdHandler />);
    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
  });
});
