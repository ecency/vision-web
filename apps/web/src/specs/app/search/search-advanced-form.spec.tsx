import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  params: new URLSearchParams()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  // Next memoizes useSearchParams per URL. Handing back a stable instance here
  // matters: a fresh object on every render would retrigger the form's sync
  // effect and wipe whatever the test just typed.
  useSearchParams: () => mocks.params,
  ReadonlyURLSearchParams: URLSearchParams
}));

import { SearchAdvancedForm } from "@/app/search/_components/search-advanced-form";

const searchField = () =>
  screen.getByPlaceholderText("search-comment.search-placeholder") as HTMLInputElement;
const authorField = () =>
  screen.getByPlaceholderText("search-comment.author-placeholder") as HTMLInputElement;
const categoryField = () =>
  screen.getByPlaceholderText("search-comment.category-placeholder") as HTMLInputElement;
const tagsField = () =>
  screen.getByPlaceholderText("search-comment.tags-placeholder") as HTMLInputElement;
// Type, Date and Sort in DOM order.
const typeSelect = () => screen.getAllByRole("combobox")[0] as HTMLSelectElement;
const applyButton = () => screen.getByRole("button", { name: "g.apply" });

function pushedParams(): URLSearchParams {
  expect(mocks.push).toHaveBeenCalledTimes(1);
  return new URLSearchParams(mocks.push.mock.calls[0][0] as string);
}

describe("SearchAdvancedForm", () => {
  beforeEach(() => {
    mocks.push.mockClear();
    mocks.params = new URLSearchParams();
    localStorage.clear();
  });

  describe("apply", () => {
    it("navigates on a filter-only search - an author with no free text", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(authorField(), { target: { value: "@Demo" } });
      fireEvent.click(applyButton());

      expect(screen.queryByRole("alert")).toBeNull();
      // No leading space: " author:demo" is what the API rejected with
      // "Parsed query is empty!".
      expect(pushedParams().get("q")).toBe("author:demo");
    });

    it("navigates on a category-only and a tag-only search", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(categoryField(), { target: { value: "Hive-125125" } });
      fireEvent.click(applyButton());
      expect(pushedParams().get("q")).toBe("category:hive-125125");

      mocks.push.mockClear();
      fireEvent.change(categoryField(), { target: { value: "" } });
      fireEvent.change(tagsField(), { target: { value: "Travel, Photography" } });
      fireEvent.click(applyButton());
      expect(pushedParams().get("q")).toBe("tag:travel,photography");
    });

    it("combines free text with the filters", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(searchField(), { target: { value: "coffee" } });
      fireEvent.change(authorField(), { target: { value: "demo" } });
      fireEvent.change(tagsField(), { target: { value: "travel" } });
      fireEvent.click(applyButton());

      expect(pushedParams().get("q")).toBe("coffee author:demo tag:travel");
    });

    it("marks the URL as advanced so the panel reopens on reload", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(authorField(), { target: { value: "demo" } });
      fireEvent.click(applyButton());

      expect(pushedParams().get("adv")).toBe("1");
    });

    it("applies on Enter from a text field", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(authorField(), { target: { value: "demo" } });
      fireEvent.keyDown(authorField(), { key: "Enter" });

      expect(pushedParams().get("q")).toBe("author:demo");
    });
  });

  describe("validation", () => {
    it("refuses an empty form and does not navigate", () => {
      render(<SearchAdvancedForm />);

      fireEvent.click(applyButton());

      expect(screen.getByRole("alert")).toHaveTextContent("search-comment.error-no-criteria");
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("refuses a bare type filter - the API needs something selective", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(typeSelect(), { target: { value: "post" } });
      fireEvent.click(applyButton());

      expect(screen.getByRole("alert")).toHaveTextContent("search-comment.error-no-criteria");
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("refuses more than the allowed number of tags", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(tagsField(), { target: { value: "a, b, c, d, e, f" } });
      fireEvent.click(applyButton());

      expect(screen.getByRole("alert")).toHaveTextContent("search-comment.error-too-many-tags");
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("accepts exactly the allowed number of tags", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(tagsField(), { target: { value: "a, b, c, d, e" } });
      fireEvent.click(applyButton());

      expect(screen.queryByRole("alert")).toBeNull();
      expect(pushedParams().get("q")).toBe("tag:a,b,c,d,e");
    });

    it("counts deduped tags, so repeats do not trip the limit", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(tagsField(), { target: { value: "a, a, b, b, c, c, d, d, e, e" } });
      fireEvent.click(applyButton());

      expect(screen.queryByRole("alert")).toBeNull();
      expect(pushedParams().get("q")).toBe("tag:a,b,c,d,e");
    });

    it("refuses a query longer than the API's cap", () => {
      render(<SearchAdvancedForm />);

      fireEvent.change(searchField(), { target: { value: "a".repeat(120) } });
      fireEvent.click(applyButton());

      expect(screen.getByRole("alert")).toHaveTextContent("search-comment.error-too-long");
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("clears the error once the user edits a field", () => {
      render(<SearchAdvancedForm />);

      fireEvent.click(applyButton());
      expect(screen.getByRole("alert")).toBeInTheDocument();

      fireEvent.change(authorField(), { target: { value: "d" } });
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("clears the error when the URL changes under the panel", () => {
      const { rerender } = render(<SearchAdvancedForm />);

      fireEvent.click(applyButton());
      expect(screen.getByRole("alert")).toBeInTheDocument();

      // A navbar search or a Back navigation refills every field from the URL,
      // so a message pointing at the old field values has to go with them.
      mocks.params = new URLSearchParams("q=coffee");
      rerender(<SearchAdvancedForm />);

      expect(screen.queryByRole("alert")).toBeNull();
      expect(searchField().value).toBe("coffee");
    });

    // The free text field can hold token syntax, which both parsers read back
    // out as a filter. Guards that look at the field values instead of the
    // query actually sent let these through to a 400.
    describe("token syntax typed into the free text field", () => {
      it("counts tags from every token, not just the tags field", () => {
        render(<SearchAdvancedForm />);

        fireEvent.change(searchField(), { target: { value: "tag:a,b,c" } });
        fireEvent.change(tagsField(), { target: { value: "d, e, f" } });
        fireEvent.click(applyButton());

        expect(screen.getByRole("alert")).toHaveTextContent("search-comment.error-too-many-tags");
        expect(mocks.push).not.toHaveBeenCalled();
      });

      it("refuses a bare type: token even though the field is not empty", () => {
        render(<SearchAdvancedForm />);

        fireEvent.change(searchField(), { target: { value: "type:post" } });
        fireEvent.click(applyButton());

        expect(screen.getByRole("alert")).toHaveTextContent("search-comment.error-no-criteria");
        expect(mocks.push).not.toHaveBeenCalled();
      });

      it("still applies when the token leaves something selective behind", () => {
        render(<SearchAdvancedForm />);

        fireEvent.change(searchField(), { target: { value: "coffee tag:travel" } });
        fireEvent.click(applyButton());

        expect(screen.queryByRole("alert")).toBeNull();
        expect(pushedParams().get("q")).toBe("coffee tag:travel");
      });

      it("normalizes a token typed there, so the first apply is not a miss", () => {
        render(<SearchAdvancedForm />);

        // Unnormalized, "author:@Demo" reaches an exact lowercase term filter
        // and returns nothing, and only the second apply worked - by then the
        // value had moved into the author field.
        fireEvent.change(searchField(), { target: { value: "author:@Demo" } });
        fireEvent.click(applyButton());

        expect(pushedParams().get("q")).toBe("author:demo");
      });

      it("keeps a filled-in field when the free text carries the same token", () => {
        render(<SearchAdvancedForm />);

        // The API keeps only the first author: match and the free text goes
        // first, so the token would otherwise override the visible filter.
        fireEvent.change(searchField(), { target: { value: "coffee author:alice" } });
        fireEvent.change(authorField(), { target: { value: "bob" } });
        fireEvent.click(applyButton());

        expect(pushedParams().get("q")).toBe("coffee author:bob");
      });

      it("merges tags from both places, since the API joins every tag token", () => {
        render(<SearchAdvancedForm />);

        fireEvent.change(searchField(), { target: { value: "coffee tag:travel" } });
        fireEvent.change(tagsField(), { target: { value: "photography" } });
        fireEvent.click(applyButton());

        expect(pushedParams().get("q")).toBe("coffee tag:travel,photography");
      });

      it("keeps the Type select when the free text carries a broken type token", () => {
        render(<SearchAdvancedForm />);

        // The API reads the FIRST type: match, so "prototype:v2" shadowed the
        // select with "v2" and the whole search came back 400.
        fireEvent.change(searchField(), { target: { value: "prototype:v2" } });
        fireEvent.change(typeSelect(), { target: { value: "post" } });
        fireEvent.click(applyButton());

        expect(screen.queryByRole("alert")).toBeNull();
        expect(pushedParams().get("q")).toBe("proto type:post");
      });
    });
  });

  describe("seeding from the URL", () => {
    beforeEach(() => {
      mocks.params = new URLSearchParams({
        q: "coffee author:demo type:post category:hive-125125 tag:travel,photography",
        date: "week",
        sort: "newest",
        adv: "1"
      });
    });

    it("puts the stripped remainder in the free text field, not the raw query", () => {
      render(<SearchAdvancedForm />);

      expect(searchField().value).toBe("coffee");
      expect(authorField().value).toBe("demo");
      expect(categoryField().value).toBe("hive-125125");
      expect(tagsField().value).toBe("travel,photography");
    });

    // Regression for the duplicate-token bug: seeding the free text with the raw
    // query re-appended every filter on each apply ("coffee author:demo
    // author:demo ...") until q passed the server's length cap.
    it("does not duplicate the tokens when applied again untouched", () => {
      render(<SearchAdvancedForm />);

      fireEvent.click(applyButton());

      expect(pushedParams().get("q")).toBe(mocks.params.get("q"));
    });

    it("keeps date and sort from the URL", () => {
      render(<SearchAdvancedForm />);

      fireEvent.click(applyButton());

      const pushed = pushedParams();
      expect(pushed.get("date")).toBe("week");
      expect(pushed.get("sort")).toBe("newest");
    });
  });

  describe("date", () => {
    it("ignores the decks 'recent_date' entry and defaults to all time", () => {
      // The two features shared this localStorage key with different defaults,
      // so an untouched Date select silently reapplied the other one's value.
      localStorage.setItem("recent_date", JSON.stringify("week"));

      render(<SearchAdvancedForm />);

      fireEvent.change(authorField(), { target: { value: "demo" } });
      fireEvent.click(applyButton());

      expect(pushedParams().get("date")).toBe("all");
    });
  });

  describe("hide low", () => {
    it("is checked on the first render when the URL does not opt out", () => {
      render(<SearchAdvancedForm />);

      expect(screen.getByRole("checkbox", { name: "search-comment.hide-low" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });

    it("reads hd=0 from the URL", () => {
      mocks.params = new URLSearchParams({ q: "coffee", hd: "0" });

      render(<SearchAdvancedForm />);

      expect(screen.getByRole("checkbox", { name: "search-comment.hide-low" })).toHaveAttribute(
        "aria-checked",
        "false"
      );
    });
  });
});
