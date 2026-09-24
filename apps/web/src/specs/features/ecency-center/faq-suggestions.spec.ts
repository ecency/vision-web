import { getFaqSuggestions } from "@/features/ecency-center/data/faq-suggestions";
import data from "@/features/ecency-center/data/path.json";

const forPattern = (pattern: string) => data.faqPaths.find((p) => p.path === pattern)!.suggestions;

/**
 * The last matching path.json entry wins, so the `/.*` fallback must not
 * override the per-page suggestions (#1617).
 */
describe("getFaqSuggestions", () => {
  it.each([
    ["/@alice/posts", "/@.+/(posts)"],
    ["/@alice/wallet", "/@.+/(wallet)"],
    ["/@alice/blog", "/@.+/(blog|posts|wallet|points|engine|permissions)"],
    ["/market", "/market"],
    ["/some/unknown", "/.*"],
    ["/", "/.*"]
  ])("%s gets the %s suggestions", (pathname, pattern) => {
    expect(getFaqSuggestions(pathname)).toEqual(forPattern(pattern));
  });

  it("gives per-page suggestions that differ from the fallback", () => {
    expect(getFaqSuggestions("/market")).not.toEqual(forPattern("/.*"));
  });

  it("returns nothing without a pathname", () => {
    expect(getFaqSuggestions(null)).toEqual([]);
  });
});
