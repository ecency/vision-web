import { describe, it, expect } from "vitest";
import { isValidAccountName, normalizeAccountName } from "@/utils/hive-account-name";

describe("normalizeAccountName", () => {
  it("strips a leading @, spaces and casing so the chain gets a bare name", () => {
    expect(normalizeAccountName("@melinda010100")).toBe("melinda010100");
    expect(normalizeAccountName("  @@Trustee ")).toBe("trustee");
    expect(normalizeAccountName("%40Alice")).toBe("alice");
    expect(normalizeAccountName(undefined)).toBe("");
  });

  it("keeps an @ or %40 inside the name so it cannot become another account", () => {
    expect(normalizeAccountName("alice%40bob")).toBe("alice%40bob");
    expect(normalizeAccountName("alice@bob")).toBe("alice@bob");
  });
});

describe("isValidAccountName", () => {
  it("accepts names typed with @ and every shape the chain allows", () => {
    expect(isValidAccountName("@melinda010100")).toBe(true);
    expect(isValidAccountName("good.name")).toBe(true);
    expect(isValidAccountName("a-b")).toBe(true);
    expect(isValidAccountName("a".repeat(16))).toBe(true);
  });

  it("rejects names the chain would refuse", () => {
    expect(isValidAccountName("")).toBe(false);
    expect(isValidAccountName("ab")).toBe(false);
    expect(isValidAccountName("1abc")).toBe(false);
    expect(isValidAccountName("bad_name")).toBe(false);
    expect(isValidAccountName("abc-")).toBe(false);
    expect(isValidAccountName("abc.de")).toBe(false);
    expect(isValidAccountName("a".repeat(17))).toBe(false);
    expect(isValidAccountName("alice%40bob")).toBe(false);
    expect(isValidAccountName("alice@bob")).toBe(false);
  });
});
