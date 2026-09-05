import { describe, expect, it } from "vitest";
import { buildCurationRecommendOp, buildCurationUnrecommendOp } from "./ecency";

type CustomJson = {
  id: string;
  json: string;
  required_auths: string[];
  required_posting_auths: string[];
};

describe("buildCurationRecommendOp", () => {
  it("builds a posting-auth custom_json with the ecency_curation id", () => {
    const op = buildCurationRecommendOp("alice", "bob", "a-post", "underrated");
    expect(op[0]).toBe("custom_json");
    const payload = op[1] as CustomJson;
    expect(payload.id).toBe("ecency_curation");
    expect(payload.required_auths).toEqual([]);
    expect(payload.required_posting_auths).toEqual(["alice"]);
    expect(JSON.parse(payload.json)).toEqual({
      v: 1,
      op: "recommend",
      author: "bob",
      permlink: "a-post",
      reason: "underrated"
    });
  });

  it("defaults the reason to quality", () => {
    const payload = buildCurationRecommendOp("alice", "bob", "a-post")[1] as CustomJson;
    expect(JSON.parse(payload.json).reason).toBe("quality");
  });

  it("keeps the json well under the chain limit (under 200 bytes for long names)", () => {
    const payload = buildCurationRecommendOp(
      "a-sixteen-char-n",
      "another-sixteen-",
      "x".repeat(60),
      "newcomer"
    )[1] as CustomJson;
    expect(new TextEncoder().encode(payload.json).length).toBeLessThan(200);
  });

  it("rejects a missing permlink, author or recommender", () => {
    expect(() => buildCurationRecommendOp("alice", "bob", "")).toThrow();
    expect(() => buildCurationRecommendOp("alice", "", "a-post")).toThrow();
    expect(() => buildCurationRecommendOp("", "bob", "a-post")).toThrow();
  });

  it("rejects a reason outside the four values", () => {
    expect(() =>
      buildCurationRecommendOp("alice", "bob", "a-post", "spam" as unknown as "other")
    ).toThrow(/Unknown reason/);
  });
});

describe("buildCurationUnrecommendOp", () => {
  it("builds the unrecommend op without a reason", () => {
    const payload = buildCurationUnrecommendOp("alice", "bob", "a-post")[1] as CustomJson;
    expect(payload.id).toBe("ecency_curation");
    expect(payload.required_auths).toEqual([]);
    expect(payload.required_posting_auths).toEqual(["alice"]);
    const json = JSON.parse(payload.json);
    expect(json).toEqual({ v: 1, op: "unrecommend", author: "bob", permlink: "a-post" });
    expect(json).not.toHaveProperty("reason");
  });

  it("rejects a missing parameter", () => {
    expect(() => buildCurationUnrecommendOp("alice", "bob", "")).toThrow();
  });
});
