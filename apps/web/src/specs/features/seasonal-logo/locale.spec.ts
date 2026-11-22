import { describe, expect, it } from "vitest";
import { readLocale } from "@/features/seasonal-logo/locale";

describe("seasonal logo locale", () => {
  it("reads the region and language of the browser's first language", () => {
    expect(readLocale(["en-US", "de"])).toEqual({ region: "US", language: "en" });
    expect(readLocale(["zh-Hant-TW"])).toEqual({ region: "TW", language: "zh" });
    expect(readLocale(["pt_BR"])).toEqual({ region: "BR", language: "pt" });
  });

  it("takes a region from a later language when the first has none", () => {
    expect(readLocale(["ms", "en-SG"])).toEqual({ region: "SG", language: "ms" });
  });

  it("reads the legacy code for Indonesian, and nothing from nothing", () => {
    expect(readLocale(["in"])).toEqual({ region: null, language: "id" });
    expect(readLocale([])).toEqual({ region: null, language: null });
    expect(readLocale(undefined)).toEqual({ region: null, language: null });
  });

  it("ignores a numeric region such as es-419", () => {
    expect(readLocale(["es-419"])).toEqual({ region: null, language: "es" });
  });
});
