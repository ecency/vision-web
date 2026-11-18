import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("@/core/entries/post-body-text-safely", async () => ({
  postBodyTextSafely: (body: string) => body
}));

import { searchSummary } from "@/features/shared/search-list-item/search-summary";

// The server's highlighted text (body_marked) is HTML with <mark>; the
// fallback summary is plain text and must stay text: parsed as HTML, `a<b`
// would lose everything after the `<`.
describe("searchSummary", () => {
  it.each(["x<y", "if a<b then everything else here", '<mark style="position:fixed">X</mark>'])(
    "shows the fallback summary %j as text",
    (body) => {
      const { container } = render(<div>{searchSummary(undefined, body)}</div>);
      expect(container.textContent).toBe(body);
      expect(container.querySelector("mark")).toBeNull();
    }
  );

  it("keeps the server's highlights", () => {
    const { container } = render(<div>{searchSummary("a <mark>hit</mark> b", "ignored")}</div>);
    expect(container.querySelector("mark")).toHaveTextContent("hit");
    expect(container.textContent).toBe("a hit b");
  });
});

describe("search highlights", () => {
  it("drops attributes from a highlight and anything that is not text or <mark>", () => {
    const { container } = render(
      <div>{searchSummary('a <mark style="position:fixed" onclick="x()">hit</mark> <img src=x>b', "ignored")}</div>
    );
    const mark = container.querySelector("mark")!;
    expect(mark).toHaveTextContent("hit");
    expect(mark.attributes).toHaveLength(0);
    expect(container.querySelector("img")).toBeNull();
  });
});
