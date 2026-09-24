import { describe, expect, it } from "vitest";
import { isHiveNotFoundError } from "@/utils/hive-not-found-error";

// Messages as a Hive node returns them (captured from api.hive.blog).
const NOT_FOUND = [
  "Assert Exception:Post ecency/no-such-post does not exist",
  "Assert Exception:Account nosuchaccount does not exist",
  'Assert Exception:[{"nosuchaccount": "account does not exist"}]',
  "Assert Exception:Tag nosuchtag does not exist",
  "Assert Exception:invalid tag `Foo`",
  "Assert Exception:given community name is not valid"
];

const FAILURES = [
  "HTTP 503 from https://api.example",
  "HTTP 429 Rate Limited",
  "fetch failed",
  "All nodes failed",
  "Unable to parse endpoint data",
  "The operation was aborted due to timeout",
  // Mentions a post but is not the node's not-found assert.
  "Post ecency/x does not exist in local cache"
];

describe("isHiveNotFoundError", () => {
  it.each(NOT_FOUND)("is a not-found answer: %s", (message) => {
    expect(isHiveNotFoundError(new Error(message))).toBe(true);
  });

  it.each(FAILURES)("is not a not-found answer: %s", (message) => {
    expect(isHiveNotFoundError(new Error(message))).toBe(false);
  });

  it("tolerates non-errors", () => {
    expect(isHiveNotFoundError(undefined)).toBe(false);
    expect(isHiveNotFoundError("Assert Exception:Post a/b does not exist")).toBe(false);
    expect(isHiveNotFoundError({})).toBe(false);
  });
});
