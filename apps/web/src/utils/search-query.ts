// A token only counts at the start of the query or after whitespace, matching
// the search API's parser. Unanchored, these matched inside ordinary words:
// "prototype:v2" read as type=v2 and the API rejected it as an invalid type,
// "subcategory:hive-1" filtered on category=hive-1 with a stray "sub" left as
// required text. The boundary is captured rather than looked behind so it can
// be put back when the token is stripped, keeping the neighbouring words apart
// (a lookbehind would also be fine here, but this stays portable).
const author_re = /(^|\s)author:([^\s]+)/g;
const type_re = /(^|\s)type:([^\s]+)/g;
const category_re = /(^|\s)category:([^\s]+)/g;
const tag_re = /(^|\s)tag:([^\s]+)/g;

// Index of the token value in a match; group 1 is the boundary.
const VALUE = 2;

export enum SearchType {
  ALL = "",
  POST = "post",
  COMMENT = "comment"
}

export const MAX_SEARCH_TAGS = 5;

// The search API applies both caps itself (see query_validator); mirrored here
// so the client can refuse instead of turning a 400 into an empty result list.
export const MAX_SEARCH_QUERY_LENGTH = 100;

/**
 * Both parsers match a token with /author:([^\s]+)/, so a value containing a
 * space stops filtering at the space and the remainder silently becomes
 * required free text. Keep the first word only, which is what the API would
 * have filtered on anyway.
 */
function firstToken(value: string): string {
  return value.trim().split(/\s+/)[0] ?? "";
}

/**
 * Hive account names are lowercase and the API filters authors with an exact
 * term query, so "@Demo" has to become "demo" or it matches nothing.
 */
export function normalizeSearchAuthor(value: string): string {
  return firstToken(value).replace(/^@+/, "").toLowerCase();
}

export function normalizeSearchCategory(value: string): string {
  // Leading "#" goes for the same reason it goes on tags: a category is matched
  // by an exact term query, and users write categories the way they write tags.
  return firstToken(value).replace(/^#+/, "").toLowerCase();
}

/**
 * Accepts what a user actually types ("travel, photography", "#travel travel")
 * and returns exact-match ready tags, deduped in first-seen order.
 */
export function normalizeSearchTags(value: string): string[] {
  const seen = new Set<string>();

  return value
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#+/, "").toLowerCase())
    .filter((tag) => {
      if (tag === "" || seen.has(tag)) {
        return false;
      }

      seen.add(tag);
      return true;
    });
}

export interface SearchQueryParts {
  search?: string;
  author?: string;
  type?: SearchType;
  category?: string;
  /** Raw user input ("a, b") or an already split list. */
  tags?: string | string[];
}

export interface BuiltSearchQuery {
  /** The `q` value to put in the URL. Round-trips through `SearchQuery`. */
  q: string;
  search: string;
  author: string;
  type: SearchType;
  category: string;
  tags: string[];
}

/**
 * Assembles the single `q` string that both this app and the search API parse
 * back into filters. Returns the normalized parts too, because the caller has
 * to validate the tag count and the total length before navigating.
 */
export function buildSearchQuery({
  search = "",
  author = "",
  type = SearchType.ALL,
  category = "",
  tags = []
}: SearchQueryParts): BuiltSearchQuery {
  const normalizedSearch = search.trim().replace(/\s+/g, " ");
  const normalizedAuthor = normalizeSearchAuthor(author);
  const normalizedCategory = normalizeSearchCategory(category);
  const normalizedTags = normalizeSearchTags(Array.isArray(tags) ? tags.join(",") : tags);

  const parts = [normalizedSearch];

  if (normalizedAuthor) {
    parts.push(`author:${normalizedAuthor}`);
  }

  if (type) {
    parts.push(`type:${type}`);
  }

  if (normalizedCategory) {
    parts.push(`category:${normalizedCategory}`);
  }

  if (normalizedTags.length > 0) {
    // No space after the commas: a tag token ends at the first space, so
    // anything past one stops filtering and becomes required free text.
    parts.push(`tag:${normalizedTags.join(",")}`);
  }

  return {
    // Dropping the empty free text here is what keeps a filter-only query from
    // starting with a space.
    q: parts.filter((part) => part !== "").join(" "),
    search: normalizedSearch,
    author: normalizedAuthor,
    type,
    category: normalizedCategory,
    tags: normalizedTags
  };
}

export class SearchQuery {
  public query: string = "";
  public search: string = "";
  public author: string = "";
  public type: SearchType = SearchType.ALL;
  public category: string = "";
  public tags: string[] = [];

  constructor(_query: string) {
    this.query = _query;
    this.search = _query;

    this.grabAuthor();
    this.grabType();
    this.grabCategory();
    this.grabTags();
    this.grabSearch();
  }

  private grab = (re: RegExp): string => {
    // @ts-ignore
    const matches = [...this.query.matchAll(re)];
    if (matches.length > 0) {
      return matches[0][VALUE].trim();
    }

    return "";
  };

  private grabAuthor = () => {
    this.author = this.grab(author_re);
  };

  private grabType = () => {
    const type = this.grab(type_re) as SearchType;
    if (Object.values(SearchType).includes(type)) {
      this.type = type as SearchType;
    }
  };

  private grabCategory = () => {
    this.category = this.grab(category_re);
  };

  private grabTags = () => {
    // Every tag: token counts, not just the first one. The API joins all of its
    // own tag: matches before splitting on commas, so reading only the first
    // token here under-reports the tags a query really applies and let a query
    // past the MAX_SEARCH_TAGS guard that the API then rejects with a 400.
    // A trailing comma ("tag:a,") must not yield an empty tag either - it would
    // be shown back as a phantom tag and counted against the same cap.
    const seen = new Set<string>();

    this.tags = [...this.query.matchAll(tag_re)]
      .flatMap((match) => match[VALUE].split(","))
      .map((tag) => tag.trim())
      .filter((tag) => {
        if (tag === "" || seen.has(tag)) {
          return false;
        }

        seen.add(tag);
        return true;
      });
  };

  private grabSearch = () => {
    [author_re, type_re, category_re, tag_re].forEach((r) => {
      // Put the captured boundary back, or removing a mid-query token would
      // run the words either side of it together.
      this.search = this.search.replace(r, "$1");
    });

    while (this.search.indexOf("  ") !== -1) {
      this.search = this.search.replace("  ", " ");
    }

    this.search = this.search.trim();
  };
}
