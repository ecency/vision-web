import { describe, expect, it } from "vitest";
import {
  accountNameByteLength,
  isQueryableAccountName,
} from "./account-name-query";

describe("accountNameByteLength", () => {
  // The counts hived reports in the assert are byte counts. These are the values
  // that actually reached production, with the number the node reported for each.
  it("counts bytes rather than characters", () => {
    expect(accountNameByteLength("aliveandthriving,")).toBe(17);
    expect(accountNameByteLength("sebastián.bilbao")).toBe(17);
    expect(accountNameByteLength("вцпк33ппп43")).toBe(18);
    expect(accountNameByteLength("instinto•asesino")).toBe(18);
  });

  it("differs from .length exactly where a character check would pass", () => {
    expect("sebastián.bilbao".length).toBeLessThanOrEqual(16);
    expect("вцпк33ппп43".length).toBeLessThanOrEqual(16);
    expect(accountNameByteLength("sebastián.bilbao")).toBeGreaterThan(16);
    expect(accountNameByteLength("вцпк33ппп43")).toBeGreaterThan(16);
  });
});

describe("isQueryableAccountName", () => {
  it("accepts a real account name and a prefix of one", () => {
    expect(isQueryableAccountName("good-karma")).toBe(true);
    expect(isQueryableAccountName("go")).toBe(true);
    expect(isQueryableAccountName("aliveandthriving")).toBe(true); // exactly 16
  });

  it("rejects the values that produced the assert in production", () => {
    for (const value of [
      "aliveandthriving,",
      "minismallholding!",
      "isaacmartiubeda(64)",
      "iamraincrystal,man",
      "sebastián.bilbao",
      "вцпк33ппп43",
    ]) {
      expect(isQueryableAccountName(value)).toBe(false);
    }
  });

  it("rejects empty and missing values", () => {
    expect(isQueryableAccountName("")).toBe(false);
    expect(isQueryableAccountName(undefined)).toBe(false);
    expect(isQueryableAccountName(null)).toBe(false);
  });

  // It is a length gate, not name validation. A prefix search is allowed to ask
  // about something that is not a legal name; the node answers that with no matches.
  it("does not try to validate the name itself", () => {
    expect(isQueryableAccountName("Not-A-Name")).toBe(true);
    expect(isQueryableAccountName("...")).toBe(true);
  });
});
