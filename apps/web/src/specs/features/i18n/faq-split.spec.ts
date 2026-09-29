// @vitest-environment node
import fs from "fs";
import path from "path";
import { vi } from "vitest";
// The global setup replaces i18next with a key-echoing stub; this spec needs
// the real instance to prove the merge-back.
vi.unmock("i18next");
import i18n from "i18next";
import loader, { splitFaq, isFaqQuery, splitRaidstead, isRaidsteadQuery, RAIDSTEAD_CORE_KEYS } from "@/features/i18n/faq-split";
import { ensureRaidsteadLoaded, isRaidsteadLoaded } from "@/features/i18n/raidstead";
import { initI18next, loadLocale } from "@/features/i18n";
import { ensureFaqLoaded, getEnglishFaqResources, isFaqLoaded, primeEnglishFaq } from "@/features/i18n/faq";

const LOCALE = path.resolve(__dirname, "../../../features/i18n/locales/en-US.json");
const enUs = JSON.parse(fs.readFileSync(LOCALE, "utf8"));

/**
 * The FAQ articles leave the eager en-US bundle through the webpack loader and
 * come back on demand (#1598). The loader is a plain function, so its split is
 * checked here against the real locale file; the runtime half is checked
 * against the real i18next instance.
 */
describe("faq-split loader", () => {
  const { core, faq } = splitFaq(enUs);

  it("moves every article and nothing else", () => {
    const articles = Object.keys(enUs.static.faq).filter((k) => /-(header|body)$/.test(k));
    expect(articles.length).toBeGreaterThan(200);
    expect(Object.keys(faq.static.faq).sort()).toEqual(articles.sort());
    expect(Object.keys(core.static.faq).some((k) => /-(header|body)$/.test(k))).toBe(false);
  });

  it("keeps the small FAQ keys every page may use in the core bundle", () => {
    for (const k of ["page-title", "page-sub-title", "search", "search-not-found", "search-placeholder", "search-link-copied", "toggle-icon-info", "about-ecency", "working", "about-blockchain", "features"]) {
      expect(core.static.faq[k]).toBe(enUs.static.faq[k]);
    }
  });

  it("leaves every other namespace untouched and the union equals the source", () => {
    const { static: _s, ...restCore } = core;
    const { static: _o, ...restOrig } = enUs;
    expect(restCore).toEqual(restOrig);
    expect(core.static.about).toEqual(enUs.static.about);
    expect(core.static.mobile).toEqual(enUs.static.mobile);
    expect({ ...core.static.faq, ...faq.static.faq }).toEqual(enUs.static.faq);
  });

  it("is worth doing: the articles are a large share of what would ship eagerly", () => {
    const size = (o: unknown) => JSON.stringify(o).length;
    // the Raidstead game's strings leave the eager bundle too (below)
    const eager = size(enUs) - size(splitRaidstead(enUs).game);
    expect(size(faq)).toBeGreaterThan(eager * 0.2);
  });

  it("serves the core for the plain import and the articles for ?faq", () => {
    const source = JSON.stringify(enUs);
    const plain = loader.call({ resourceQuery: "" }, source);
    const query = loader.call({ resourceQuery: "?faq" }, source);
    const evalModule = (code: string) => {
      const mod = { exports: {} as { static: { faq: Record<string, string> }; g?: unknown } };
      // eslint-disable-next-line no-new-func
      new Function("module", code)(mod);
      return mod.exports;
    };
    expect(evalModule(plain).static.faq["what-is-ecency-header"]).toBeUndefined();
    expect(evalModule(plain).static.faq["page-title"]).toBe(enUs.static.faq["page-title"]);
    expect(evalModule(query).static.faq["what-is-ecency-header"]).toBe(enUs.static.faq["what-is-ecency-header"]);
    expect(evalModule(query).g).toBeUndefined();
    expect(isFaqQuery("?faq")).toBe(true);
    expect(isFaqQuery("?other=1&faq")).toBe(true);
    expect(isFaqQuery("?faqs")).toBe(false);
    expect(isFaqQuery(undefined)).toBe(false);
  });
});

describe("FAQ articles on demand", () => {
  beforeAll(async () => {
    // Without the webpack loader the app's init registers the whole file;
    // reset the bundle to what the production build ships (the core).
    await initI18next();
    const { core } = splitFaq(enUs);
    i18n.removeResourceBundle("en-US", "translation");
    i18n.addResourceBundle("en-US", "translation", core);
  });

  it("starts without the articles and reports them missing", () => {
    expect(isFaqLoaded("en-US")).toBe(false);
    expect(i18n.t("static.faq.what-is-ecency-header")).toBe("static.faq.what-is-ecency-header");
  });

  it("merges the articles back into the translation namespace without touching other keys", async () => {
    await ensureFaqLoaded("en-US");
    expect(isFaqLoaded("en-US")).toBe(true);
    expect(i18n.t("static.faq.what-is-ecency-header")).toBe(enUs.static.faq["what-is-ecency-header"]);
    expect(i18n.t("static.faq.page-title")).toBe(enUs.static.faq["page-title"]);
    expect(i18n.t("g.copy")).toBe(enUs.g.copy);
  });

  it("exposes only the English articles for the server to hand to the client", () => {
    const res = getEnglishFaqResources();
    expect(Object.keys(res.static.faq).every((k) => /-(header|body)$/.test(k))).toBe(true);
    expect(res.static.faq["what-is-ecency-body"]).toBe(enUs.static.faq["what-is-ecency-body"]);
  });

  it("loads the English articles alongside another language, for per-key fallback", async () => {
    i18n.removeResourceBundle("en-US", "translation");
    i18n.addResourceBundle("en-US", "translation", splitFaq(enUs).core);
    await ensureFaqLoaded("es-ES");
    expect(isFaqLoaded("es-ES")).toBe(true);
    expect(isFaqLoaded("en-US")).toBe(true);
    expect(i18n.getResourceBundle("en-US", "translation").static.faq["what-is-ecency-body"]).toBe(
      enUs.static.faq["what-is-ecency-body"]
    );
  });

  it("primes the English articles synchronously and idempotently", () => {
    i18n.removeResourceBundle("en-US", "translation");
    i18n.addResourceBundle("en-US", "translation", splitFaq(enUs).core);
    expect(isFaqLoaded("en-US")).toBe(false);
    primeEnglishFaq({ static: { faq: { "what-is-ecency-header": "First" } } });
    primeEnglishFaq({ static: { faq: { "what-is-ecency-header": "ignored" } } });
    expect(i18n.t("static.faq.what-is-ecency-header")).toBe("First");
    expect(i18n.t("static.faq.page-title")).toBe(enUs.static.faq["page-title"]);
  });

  it("never leaves another language half-loaded: loadLocale still fetches the whole file", async () => {
    // A partial bundle must not pass loadLocale's guard.
    i18n.addResourceBundle("es-ES", "translation", { static: { faq: { "what-is-ecency-header": "partial" } } }, true, true);
    await loadLocale("es-ES");
    expect(i18n.getResourceBundle("es-ES", "translation").g).toBeDefined();
    expect(i18n.getResourceBundle("es-ES", "translation").static.faq["what-is-ecency-body"]).toBeTruthy();
  });
});

describe("raidstead split", () => {
  const { core, game } = splitRaidstead(enUs);

  it("keeps only the keys other pages use in the core", () => {
    expect(Object.keys(core.raidstead).sort()).toEqual([...RAIDSTEAD_CORE_KEYS].sort());
    expect({ ...core.raidstead, ...game.raidstead }).toEqual(enUs.raidstead);
    const { raidstead: _r, ...restCore } = core;
    const { raidstead: _o, ...restOrig } = enUs;
    expect(restCore).toEqual(restOrig);
  });

  it("serves the game strings for ?raidstead and neither split leaks into the other", () => {
    const source = JSON.stringify(enUs);
    const evalModule = (code: string) => {
      const mod = { exports: {} as Record<string, any> };
      // eslint-disable-next-line no-new-func
      new Function("module", code)(mod);
      return mod.exports;
    };
    const plain = evalModule(loader.call({ resourceQuery: "" }, source));
    const query = evalModule(loader.call({ resourceQuery: "?raidstead" }, source));
    expect(plain.raidstead.intro).toBeUndefined();
    expect(plain.raidstead["page-title"]).toBe(enUs.raidstead["page-title"]);
    expect(plain.static.faq["what-is-ecency-header"]).toBeUndefined();
    expect(query.raidstead.intro).toBe(enUs.raidstead.intro);
    expect(query.g).toBeUndefined();
    expect(isRaidsteadQuery("?raidstead")).toBe(true);
    expect(isRaidsteadQuery("?faq")).toBe(false);
  });

  it("merges the game strings back when the game loads", async () => {
    await initI18next();
    i18n.removeResourceBundle("en-US", "translation");
    i18n.addResourceBundle("en-US", "translation", splitRaidstead(splitFaq(enUs).core).core);
    expect(isRaidsteadLoaded("en-US")).toBe(false);
    await ensureRaidsteadLoaded("en-US");
    expect(isRaidsteadLoaded("en-US")).toBe(true);
    expect(i18n.t("raidstead.intro")).toBe(enUs.raidstead.intro);
    expect(i18n.t("raidstead.page-title")).toBe(enUs.raidstead["page-title"]);
    expect(i18n.t("g.copy")).toBe(enUs.g.copy);
  });
});
