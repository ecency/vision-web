import { describe, expect, it } from "vitest";
import { countTrailingHiddenPages } from "@/features/shared/entry-list-item/use-auto-paging-paused";

const page = (...authors: string[]) => authors.map((author) => ({ author }));

describe("countTrailingHiddenPages", () => {
  it("counts the newest pages in a row that show nothing", () => {
    const pages = [page("alice"), page("spam"), page("spam", "spam"), page("spam")];
    expect(countTrailingHiddenPages(pages, ["spam"])).toBe(3);
  });

  it("stops at the newest page that shows something", () => {
    expect(countTrailingHiddenPages([page("spam"), page("spam", "alice")], ["spam"])).toBe(0);
  });

  it("counts a page a list filter emptied", () => {
    expect(countTrailingHiddenPages([page("alice"), page()], undefined)).toBe(1);
  });

  it("counts nothing for a logged-out viewer with full pages", () => {
    expect(countTrailingHiddenPages([page("spam"), page("spam")], undefined)).toBe(0);
  });
});
