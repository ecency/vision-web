import { describe, expect, it } from "vitest";
import enUS from "@/features/i18n/locales/en-US.json";

// #2034: only HBD in savings earns interest, at a rate the witnesses set and
// change; HIVE in savings earns none. The answer points at the wallet's rate.
describe("FAQ: what does Savings mean", () => {
  const body = (enUS as { static: { faq: Record<string, string> } }).static.faq["what-savings mean-body"];

  it("states no fixed interest rate", () => {
    expect(body).toBeTruthy();
    expect(body).not.toMatch(/\d+(\.\d+)?\s*%/);
    expect(body).not.toMatch(/\bAPR\b/);
  });

  it("says HBD earns interest and HIVE does not", () => {
    expect(body).not.toMatch(/Hive or HBD|HIVE or HBD/i);
    expect(body).toMatch(/HBD[^.]*interest/);
    expect(body).toMatch(/HIVE[^.]*(does not|doesn't|no) [^.]*interest|HIVE[^.]*earns nothing/);
  });
});
