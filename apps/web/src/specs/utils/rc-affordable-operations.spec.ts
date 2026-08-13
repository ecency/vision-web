import { rcAffordableOperations } from "@/utils/rc-affordable-operations";

// Real numbers from rc_api.get_rc_stats, 2026-08-13.
const COMMENT_COST = 1_224_266_459;

describe("rcAffordableOperations", () => {
  it("rounds down rather than up", () => {
    // Regression: this used Math.ceil, so a user holding 1.2x the cost of one
    // comment was told they had 2, then hit "not enough RC" on the first post.
    expect(rcAffordableOperations(COMMENT_COST * 1.2, COMMENT_COST)).toBe(1);
    expect(rcAffordableOperations(COMMENT_COST * 2.4, COMMENT_COST)).toBe(2);
    expect(rcAffordableOperations(COMMENT_COST * 2.99, COMMENT_COST)).toBe(2);
  });

  it("reports 0 when the user cannot afford a single operation", () => {
    // Math.ceil could never return 0 for any positive mana, so the widget
    // always promised at least one operation.
    expect(rcAffordableOperations(COMMENT_COST * 0.1, COMMENT_COST)).toBe(0);
    expect(rcAffordableOperations(1, COMMENT_COST)).toBe(0);
    expect(rcAffordableOperations(COMMENT_COST - 1, COMMENT_COST)).toBe(0);
  });

  it("is exact on whole multiples", () => {
    expect(rcAffordableOperations(COMMENT_COST, COMMENT_COST)).toBe(1);
    expect(rcAffordableOperations(COMMENT_COST * 5, COMMENT_COST)).toBe(5);
  });

  it("returns 0 for empty, negative or unusable input", () => {
    expect(rcAffordableOperations(0, COMMENT_COST)).toBe(0);
    expect(rcAffordableOperations(-1, COMMENT_COST)).toBe(0);
    expect(rcAffordableOperations(COMMENT_COST, 0)).toBe(0);
    expect(rcAffordableOperations(COMMENT_COST, -5)).toBe(0);
    expect(rcAffordableOperations(NaN, COMMENT_COST)).toBe(0);
    expect(rcAffordableOperations(COMMENT_COST, NaN)).toBe(0);
    expect(rcAffordableOperations(Infinity, COMMENT_COST)).toBe(0);
  });
});
