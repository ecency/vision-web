import { describe, it, expect } from "vitest";
import {
  BuiltSearchQuery,
  buildSearchQuery,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_TAGS,
  normalizeSearchAuthor,
  normalizeSearchCategory,
  normalizeSearchTags,
  SearchQuery,
  SearchType
} from "./query-builder";

/**
 * Parses a built query back out and rebuilds it, i.e. exactly what the advanced
 * form does when it seeds its fields from the URL and the user presses Apply
 * again without changing anything.
 */
function reapply(built: BuiltSearchQuery): BuiltSearchQuery {
  const parsed = new SearchQuery(built.q);

  return buildSearchQuery({
    search: parsed.search,
    author: parsed.author,
    type: parsed.type,
    category: parsed.category,
    tags: parsed.tags
  });
}

describe("Search query", () => {
  describe("author", () => {
    it("1", () => {
      const q = new SearchQuery("foo");
      expect(q.author).toBe("");
    });

    it("2", () => {
      const q = new SearchQuery("foo author:bar");
      expect(q.author).toBe("bar");
    });
  });

  describe("type", () => {
    it("1", () => {
      const q = new SearchQuery("foo");
      expect(q.type).toBe("");
    });

    it("2", () => {
      const q = new SearchQuery("foo type:comment");
      expect(q.type).toBe("comment");
    });

    it("3", () => {
      const q = new SearchQuery("foo type:post");
      expect(q.type).toBe("post");
    });
  });

  describe("category", () => {
    it("1", () => {
      const q = new SearchQuery("foo");
      expect(q.category).toBe("");
    });

    it("2", () => {
      const q = new SearchQuery("foo category:hive-125125");
      expect(q.category).toBe("hive-125125");
    });
  });

  describe("tags", () => {
    it("1", () => {
      const q = new SearchQuery("foo");
      expect(q.tags).toEqual([]);
    });

    it("2", () => {
      const q = new SearchQuery("foo tag:bar,baz,zoo");
      expect(q.tags).toEqual(["bar", "baz", "zoo"]);
    });

    it("drops the empty segment left by a trailing comma", () => {
      expect(new SearchQuery("foo tag:a,").tags).toEqual(["a"]);
      expect(new SearchQuery("foo tag:,a,,b,").tags).toEqual(["a", "b"]);
    });

    it("collects every tag token, the way the API does", () => {
      // The API joins all of its tag: matches before splitting on commas, so
      // reading only the first token here reports 3 tags for a query that
      // actually applies 6 - and lets it past the MAX_SEARCH_TAGS guard.
      expect(new SearchQuery("foo tag:a,b,c tag:d,e,f").tags).toEqual([
        "a",
        "b",
        "c",
        "d",
        "e",
        "f"
      ]);
    });

    it("dedupes across tokens", () => {
      expect(new SearchQuery("foo tag:a,b tag:b,c").tags).toEqual(["a", "b", "c"]);
    });
  });

  describe("stripped query", () => {
    it("1", () => {
      const q = new SearchQuery(
        "foo bar  author:baz  type:post category:hive-125125  tag:tag1,tag2  zoo"
      );
      expect(q.search).toBe("foo bar zoo");
    });
  });
});

describe("normalizeSearchAuthor", () => {
  it("strips the @ and lowercases, so the API's exact term filter matches", () => {
    expect(normalizeSearchAuthor("@Demo")).toBe("demo");
  });

  it("trims surrounding whitespace and repeated @", () => {
    expect(normalizeSearchAuthor("  @@Demo  ")).toBe("demo");
  });

  it("leaves an empty value empty", () => {
    expect(normalizeSearchAuthor("   ")).toBe("");
  });

  it("keeps only the first word, since the token stops at the space anyway", () => {
    // "author:demo bob" filters on demo and turns "bob" into required free
    // text, which is the same trap the tag field had.
    expect(normalizeSearchAuthor("demo bob")).toBe("demo");
  });
});

describe("normalizeSearchCategory", () => {
  it("trims and lowercases", () => {
    expect(normalizeSearchCategory("  Hive-125125 ")).toBe("hive-125125");
  });

  it("leaves an empty value empty", () => {
    expect(normalizeSearchCategory("  ")).toBe("");
  });

  it("keeps only the first word", () => {
    expect(normalizeSearchCategory("My Category")).toBe("my");
  });

  it("strips a leading hash, like tags do", () => {
    // Categories are matched by the same exact term query as tags, and users
    // write them the same way.
    expect(normalizeSearchCategory("#Hive-125125")).toBe("hive-125125");
  });
});

describe("normalizeSearchTags", () => {
  it("splits on commas and whitespace and lowercases", () => {
    expect(normalizeSearchTags("  Travel, Photography ")).toEqual(["travel", "photography"]);
  });

  it("accepts space separated tags", () => {
    expect(normalizeSearchTags("travel photography")).toEqual(["travel", "photography"]);
  });

  it("strips leading hashes", () => {
    expect(normalizeSearchTags("#tag")).toEqual(["tag"]);
    expect(normalizeSearchTags("##Tag, #other")).toEqual(["tag", "other"]);
  });

  it("dedupes in first-seen order", () => {
    expect(normalizeSearchTags("travel, Travel, #travel, photography")).toEqual([
      "travel",
      "photography"
    ]);
  });

  it("drops empty segments", () => {
    expect(normalizeSearchTags("a,,b,")).toEqual(["a", "b"]);
    expect(normalizeSearchTags("")).toEqual([]);
    expect(normalizeSearchTags("   ,  ")).toEqual([]);
  });

  it("accepts an already split list through buildSearchQuery", () => {
    expect(buildSearchQuery({ tags: ["Travel", "travel", "#Photography"] }).tags).toEqual([
      "travel",
      "photography"
    ]);
  });
});

describe("buildSearchQuery", () => {
  it("appends every filter to the free text", () => {
    const built = buildSearchQuery({
      search: "coffee",
      author: "@Demo",
      type: SearchType.POST,
      category: "Hive-125125",
      tags: "Travel, Photography"
    });

    expect(built.q).toBe("coffee author:demo type:post category:hive-125125 tag:travel,photography");
  });

  it("joins tags with commas and no spaces", () => {
    // A space inside the token would end it: the rest becomes required free text.
    expect(buildSearchQuery({ tags: "travel, photography, food" }).q).toBe(
      "tag:travel,photography,food"
    );
  });

  it("produces no leading space when there is no free text", () => {
    const built = buildSearchQuery({ author: "demo" });

    expect(built.q).toBe("author:demo");
    expect(built.q.startsWith(" ")).toBe(false);
  });

  it("omits the type token for SearchType.ALL", () => {
    expect(buildSearchQuery({ search: "coffee", type: SearchType.ALL }).q).toBe("coffee");
  });

  it("collapses whitespace inside the free text", () => {
    expect(buildSearchQuery({ search: "  coffee   beans  " }).q).toBe("coffee beans");
  });

  it("returns the normalized parts alongside the query", () => {
    const built = buildSearchQuery({
      search: " coffee ",
      author: "@Demo",
      type: SearchType.COMMENT,
      category: "Hive-1",
      tags: "Travel, travel, #photography"
    });

    expect(built.search).toBe("coffee");
    expect(built.author).toBe("demo");
    expect(built.type).toBe(SearchType.COMMENT);
    expect(built.category).toBe("hive-1");
    expect(built.tags).toEqual(["travel", "photography"]);
  });

  it("keeps the raw tag count so the caller can compare it to MAX_SEARCH_TAGS", () => {
    const built = buildSearchQuery({ tags: "a, b, c, d, e, f" });

    expect(built.tags).toHaveLength(6);
    expect(built.tags.length > MAX_SEARCH_TAGS).toBe(true);
  });

  it("does not silently truncate an over-long query", () => {
    const built = buildSearchQuery({ search: "a".repeat(MAX_SEARCH_QUERY_LENGTH + 20) });

    expect(built.q.length).toBe(MAX_SEARCH_QUERY_LENGTH + 20);
  });
});

describe("buildSearchQuery round trip", () => {
  const cases: Record<string, Parameters<typeof buildSearchQuery>[0]> = {
    "free text plus every filter": {
      search: "coffee beans",
      author: "@Demo",
      type: SearchType.POST,
      category: "Hive-125125",
      tags: "Travel, Photography"
    },
    "author only": { author: "@Demo" },
    "tags only": { tags: "Travel, Photography" },
    "category only": { category: "Hive-1" },
    "free text only": { search: "coffee" },
    "type plus author": { author: "demo", type: SearchType.COMMENT }
  };

  Object.entries(cases).forEach(([name, parts]) => {
    it(`parses back the normalized parts - ${name}`, () => {
      const built = buildSearchQuery(parts);
      const parsed = new SearchQuery(built.q);

      expect(parsed.search).toBe(built.search);
      expect(parsed.author).toBe(built.author);
      expect(parsed.type).toBe(built.type);
      expect(parsed.category).toBe(built.category);
      expect(parsed.tags).toEqual(built.tags);
    });

    // Regression for the duplicate-token bug: the form used to seed its free
    // text field from the RAW query, so every Apply re-appended the tokens
    // ("coffee author:demo author:demo ...") until the API's length cap killed
    // the search. Re-applying an unchanged form has to be a no-op.
    it(`is idempotent when re-applied - ${name}`, () => {
      const built = buildSearchQuery(parts);
      const once = reapply(built);
      const twice = reapply(once);

      expect(once.q).toBe(built.q);
      expect(twice.q).toBe(built.q);
    });
  });

  it("does not accumulate tokens over repeated applies", () => {
    let built = buildSearchQuery({ search: "coffee", author: "@Demo", tags: "Travel" });

    for (let i = 0; i < 10; i++) {
      built = reapply(built);
    }

    expect(built.q).toBe("coffee author:demo tag:travel");
    expect(built.q.length).toBeLessThanOrEqual(MAX_SEARCH_QUERY_LENGTH);
  });
});

describe("token boundaries", () => {
  // Must stay in lockstep with the API's parser (user_query_parser.py), which
  // anchors the same way. A disagreement here is silently wrong results.
  it("ignores a token glued to the end of an ordinary word", () => {
    expect(new SearchQuery("prototype:v2").type).toBe(SearchType.ALL);
    expect(new SearchQuery("prototype:v2").search).toBe("prototype:v2");
    expect(new SearchQuery("subcategory:hive-1").category).toBe("");
    expect(new SearchQuery("filetype:pdf hive").search).toBe("filetype:pdf hive");
  });

  it("still reads a real token beside a lookalike", () => {
    const q = new SearchQuery("prototype:v2 type:post");
    expect(q.type).toBe(SearchType.POST);
    expect(q.search).toBe("prototype:v2");
  });

  it("does not run words together when a mid-query token is stripped", () => {
    const q = new SearchQuery("foo tag:a,b bar");
    expect(q.tags).toEqual(["a", "b"]);
    expect(q.search).toBe("foo bar");
  });
});
