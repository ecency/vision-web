import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { FaqSearchListener } from "@/app/(staticPages)/faq/_components/faq-anchor-listener";

const jsdomScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");

/**
 * The FAQ page scrolls to the article named by the hash. Keys are element ids,
 * not CSS selectors, so `#what-savings%20mean` and `#123` must not throw.
 */
describe("FaqSearchListener", () => {
  const scrollIntoView = vi.fn();
  // jsdom has no scrollIntoView; install a mock and put back whatever was there.
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView
    });
    scrollIntoView.mockClear();
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(Element.prototype, "scrollIntoView", original);
    } else {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
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

describe("FaqSearchListener spec hygiene", () => {
  it("leaves Element.prototype.scrollIntoView as jsdom had it", () => {
    expect(Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView")).toEqual(
      jsdomScrollIntoView
    );
  });
});
