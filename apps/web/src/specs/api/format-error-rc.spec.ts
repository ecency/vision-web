import { formatError } from "@/api/format-error";
import { ErrorTypes } from "@/enums";

/**
 * The exact rejection a 10 HP account received when publishing an oversized
 * post. Kept verbatim so the classifier is tested against a real chain error
 * rather than a hand-written approximation of one.
 */
const REAL_RC_REJECTION = {
  error: "server_error",
  error_description:
    "Account: spacecop has 21319011516 RC, needs 23338899909 RC. Please wait to transact or power up HIVE.",
  response: {
    name: "RPCError",
    jse_shortmsg:
      "Account: spacecop has 21319011516 RC, needs 23338899909 RC. Please wait to transact or power up HIVE.",
    jse_info: {
      code: 4100100,
      extension: { assertion_expression: "has_mana" },
      message: "payer has not enough RC mana for transaction",
      name: "not_enough_rc_exception"
    }
  }
};

describe("formatError classification of a real out-of-RC rejection", () => {
  // Regression: the publish page destructured only the message from
  // formatError and dropped the type, so the toast rendered without
  // INSUFFICIENT_RESOURCE_CREDITS and never offered the account boost.
  it("returns the insufficient-resource-credits type, not a generic one", () => {
    const [, type] = formatError(REAL_RC_REJECTION);

    expect(type).toBe(ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS);
  });

  it("returns a message alongside the type", () => {
    const [message, type] = formatError(REAL_RC_REJECTION);

    expect(message).toBeTruthy();
    expect(type).toBe(ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS);
  });

  it("classifies the bare chain phrasing too", () => {
    const [, type] = formatError(
      new Error("Account: someone has 1 RC, needs 2 RC. Please wait to transact or power up HIVE.")
    );

    expect(type).toBe(ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS);
  });

  it("does not mistake an unrelated failure for an RC problem", () => {
    const [, type] = formatError(new Error("Missing Active Authority"));

    expect(type).not.toBe(ErrorTypes.INSUFFICIENT_RESOURCE_CREDITS);
  });
});
