import { isShortfallStillRelevant, resolveRcShortfall } from "@/app/publish/_utils/rc-shortfall";

/**
 * The verbatim rejection a 10 HP account received when publishing an oversized
 * post. Kept exactly as the chain returned it, because the classifier keys on
 * the wording.
 */
const RC_REJECTION = {
  error: "server_error",
  error_description:
    "Account: spacecop has 21319011516 RC, needs 23338899909 RC. Please wait to transact or power up HIVE.",
  response: {
    name: "RPCError",
    jse_shortmsg:
      "Account: spacecop has 21319011516 RC, needs 23338899909 RC. Please wait to transact or power up HIVE."
  }
};

describe("resolveRcShortfall", () => {
  // Regression: the publish page destructured only the message from
  // formatError and dropped the type, so an out-of-RC failure produced a bare
  // message with no top-up affordance. This is the forwarding that was missing.
  it("recognises an out-of-RC rejection and returns a shortfall", () => {
    expect(resolveRcShortfall(RC_REJECTION, "spacecop")).not.toBeNull();
  });

  it("binds the shortfall to the account that failed, not whoever is active", () => {
    const shortfall = resolveRcShortfall(RC_REJECTION, "spacecop");

    expect(shortfall?.username).toBe("spacecop");
  });

  it("carries a message to display", () => {
    expect(resolveRcShortfall(RC_REJECTION, "spacecop")?.message).toBeTruthy();
  });

  it("returns null for failures that are not about RC", () => {
    expect(resolveRcShortfall(new Error("Missing Active Authority"), "spacecop")).toBeNull();
    expect(resolveRcShortfall(new Error("something else broke"), "spacecop")).toBeNull();
  });

  it("returns null when there is no signed-in account to bind to", () => {
    expect(resolveRcShortfall(RC_REJECTION, undefined)).toBeNull();
    expect(resolveRcShortfall(RC_REJECTION, "")).toBeNull();
  });
});

describe("isShortfallStillRelevant", () => {
  const shortfall = { message: "out of rc", username: "spacecop" };

  it("keeps the alert while the account that failed is still active", () => {
    expect(isShortfallStillRelevant(shortfall, "spacecop")).toBe(true);
  });

  it("drops it once a different account becomes active", () => {
    expect(isShortfallStillRelevant(shortfall, "someone-else")).toBe(false);
  });

  it("drops it when signing out", () => {
    expect(isShortfallStillRelevant(shortfall, undefined)).toBe(false);
  });

  it("is false when there is nothing to show", () => {
    expect(isShortfallStillRelevant(null, "spacecop")).toBe(false);
  });
});
