import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { FaqSearchListener } from "@/app/(staticPages)/faq/_components/faq-anchor-listener";

/**
 * The FAQ page scrolls to the article named by the hash. Keys are element ids,
 * not CSS selectors, so `#what-savings%20mean` and `#123` must not throw.
 */
describe("FaqSearchListener", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Element.prototype.scrollIntoView = scrollIntoView;
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/faq");
  });

  function mountAt(hash: string, id: string) {
    const target = document.createElement("div");
    target.id = id;
    document.body.appendChild(target);
    window.history.replaceState(null, "", `/faq${hash}`);
    expect(() => render(<FaqSearchListener searchResult={[]} />)).not.toThrow();
    return target;
  }

  it("scrolls to a plain key", () => {
    const target = mountAt("#what-is-points", "what-is-points");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(target);
  });

  it("scrolls to a key with a percent-encoded space", () => {
    const target = mountAt("#what-savings%20mean", "what-savings mean");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(target);
  });

  it("scrolls to a digit-leading hash", () => {
    const target = mountAt("#123", "123");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(target);
  });

  it("ignores malformed percent-encoding", () => {
    mountAt("#%E0%A4%A", "x");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
