import { describe, expect, it } from "vitest";
import { resolveContentActivityType } from "./use-comment";

describe("resolveContentActivityType", () => {
  it("earns post activity for a new top-level post", () => {
    expect(resolveContentActivityType({ parentAuthor: "" })).toBe(100);
  });

  it("earns comment activity for a new reply", () => {
    expect(resolveContentActivityType({ parentAuthor: "alice" })).toBe(110);
  });

  it("earns nothing when a post is edited", () => {
    expect(resolveContentActivityType({ parentAuthor: "", isUpdate: true })).toBeNull();
  });

  it("earns nothing when a reply is edited", () => {
    expect(resolveContentActivityType({ parentAuthor: "alice", isUpdate: true })).toBeNull();
  });

  it("still earns when isUpdate is explicitly false", () => {
    expect(resolveContentActivityType({ parentAuthor: "", isUpdate: false })).toBe(100);
  });
});
