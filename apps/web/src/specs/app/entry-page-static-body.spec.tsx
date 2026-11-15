import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPostBody } from "@ecency/render-helper";
import * as Sentry from "@sentry/nextjs";
import { EntryPageStaticBody } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-static-body";
import { mockEntry } from "@/specs/test-utils";

vi.mock("@ecency/render-helper", async () => ({
  ...(await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper")),
  renderPostBody: vi.fn()
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn()
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));

// The entry route has no Suspense boundary above the post body, so a throw
// during its SSR render is a full-page 500 (see page.tsx). This is the only
// containment left for hostile markdown on the server side.
describe("EntryPageStaticBody", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("renders the markdown output on the happy path", () => {
    vi.mocked(renderPostBody).mockReturnValue("<p>hello <b>world</b></p>");
    const { container } = render(
      <EntryPageStaticBody entry={mockEntry({ body: "hello **world**" })} />
    );
    const body = container.querySelector("#post-body");
    expect(body?.tagName).toBe("DIV");
    expect(body?.innerHTML).toBe("<p>hello <b>world</b></p>");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  // This body used to throw RangeError out of renderPostBody's last-resort
  // sanitizeHtml pass, and this test asserted the <pre> fallback caught it.
  // The sanitizer now maps out-of-range references to U+FFFD instead of calling
  // String.fromCodePoint on them, so the input renders normally and the guard
  // above is what would catch the NEXT such defect. Both halves are pinned: the
  // renderer no longer throws on it, and the body still reaches the page.
  it("renders the body that used to break the sanitizer (out-of-range entity)", async () => {
    const actual = await vi.importActual<typeof import("@ecency/render-helper")>(
      "@ecency/render-helper"
    );
    vi.mocked(renderPostBody).mockImplementation(actual.renderPostBody);
    const body = `<div title="&#1114112;">boom</span>`;
    expect(() => actual.renderPostBody(body, false, false, "ecency.com")).not.toThrow();
    const { container } = render(<EntryPageStaticBody entry={mockEntry({ body })} />);
    const rendered = container.querySelector("#post-body");
    expect(rendered?.tagName).toBe("DIV");
    expect(rendered?.textContent).toContain("boom");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("falls back to the escaped raw body and reports when the renderer throws", () => {
    vi.mocked(renderPostBody).mockImplementation(() => {
      throw new Error("hostile markdown");
    });
    const entry = mockEntry({ author: "alice", permlink: "boom", body: "<script>x</script> raw" });
    const { container } = render(<EntryPageStaticBody entry={entry} />);
    const body = container.querySelector("#post-body");
    expect(body?.tagName).toBe("PRE");
    expect(body?.textContent).toBe("<script>x</script> raw");
    expect(body?.querySelector("script")).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: expect.objectContaining({ author: "alice", permlink: "boom" }) })
    );
  });

  // #2083: closing Edit History calls router.replace, the server page renders
  // again and hands #post-body a fresh {__html} object with the same string.
  // React writes innerHTML whenever that object changes, which wiped every
  // enhancement the body viewer had re-applied (tweets, videos, hive ops).
  it("keeps the enhanced body DOM when it re-renders with the same html", () => {
    vi.mocked(renderPostBody).mockReturnValue("<p>hello</p>");
    const { container, rerender } = render(
      <EntryPageStaticBody entry={mockEntry({ body: "hello" })} />
    );
    const body = container.querySelector("#post-body")!;
    const enhancement = document.createElement("div");
    enhancement.className = "er-twitter-frame";
    body.appendChild(enhancement);

    rerender(<EntryPageStaticBody entry={mockEntry({ body: "hello" })} />);

    expect(container.querySelector("#post-body")).toBe(body);
    expect(body.querySelector(".er-twitter-frame")).toBe(enhancement);
  });

  it("replaces the body when the html changes", () => {
    vi.mocked(renderPostBody).mockReturnValue("<p>one</p>");
    const { container, rerender } = render(
      <EntryPageStaticBody entry={mockEntry({ body: "one" })} />
    );
    vi.mocked(renderPostBody).mockReturnValue("<p>two</p>");
    rerender(<EntryPageStaticBody entry={mockEntry({ body: "two" })} />);
    expect(container.querySelector("#post-body")?.innerHTML).toBe("<p>two</p>");
  });
});
