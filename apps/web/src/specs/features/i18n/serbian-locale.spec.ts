import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as ls from "@/utils/local-storage";

// The global setup stubs i18next; this spec needs the real lookup, which
// canonicalises language codes before it searches the bundles.
vi.mock("i18next", async () => vi.importActual("i18next"));

type Json = { g: Record<string, string> };
const localesDir = path.resolve(__dirname, "../../../features/i18n/locales");
const readLocale = (code: string): Json =>
  JSON.parse(readFileSync(path.join(localesDir, `${code}.json`), "utf8"));
const english = readLocale("en-US");

// A g.* key whose translation differs from English, so a hit on the en-US
// fallback cannot pass for the locale's own string.
function ownKey(code: string): [string, string] {
  const json = readLocale(code);
  const entry = Object.entries(json.g).find(
    ([key, value]) => typeof value === "string" && english.g[key] !== value
  );
  if (!entry) throw new Error(`${code} has no g.* string that differs from en-US`);
  return entry;
}

let i18n: typeof import("i18next").default;
let langOptions: { code: string; name: string }[];
let loadLocale: (lang: string) => Promise<void>;

/*
  #2081: i18next canonicalises "sr-CS" to "sr-RS" and looks up sr-RS, sr,
  en-US, so a bundle registered only as "sr-CS" was never found and Serbian
  rendered English. The app still stores and offers "sr-CS".
*/
describe("Serbian locale (#2081)", () => {
  beforeAll(async () => {
    // A saved Serbian preference, as an existing visitor has it.
    ls.set("lang", "sr-CS");
    const mod = await import("@/features/i18n");
    await mod.initI18next();
    i18n = (await import("i18next")).default;
    langOptions = mod.langOptions;
    loadLocale = mod.loadLocale;
  });

  it("a saved sr-CS preference renders Serbian", () => {
    expect(i18n.language).toBe("sr-CS");
    expect(i18n.t("g.login")).toBe(readLocale("sr-CS").g.login);
    expect(i18n.t("g.login")).not.toBe(english.g.login);
  });

  it("keeps the picker entry for Serbian", () => {
    expect(langOptions.find((o) => o.code === "sr-CS")?.name).toBe("Srpski");
  });

  it("every offered locale resolves its own strings by the code the app stores", async () => {
    for (const { code } of langOptions) {
      if (code === "en-US") continue;
      await loadLocale(code);
      await i18n.changeLanguage(code);
      const [key, value] = ownKey(code);
      expect(i18n.t(`g.${key}`), `${code} g.${key}`).toBe(value);
    }
  });
});
