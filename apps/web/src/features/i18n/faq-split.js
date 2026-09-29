// Splits the FAQ articles out of the eagerly bundled en-US locale.
//
// `static.faq.*-header` / `*-body` are the FAQ articles: 262 keys, ~17 KB
// gzipped, about a quarter of en-US.json, and only the FAQ surfaces render
// them. Without this every route shipped them in first-load JS (#1598).
//
// This is a webpack loader (see next.config.js) applied to
// `features/i18n/locales/en-US.json`:
//   - `require("./locales/en-US.json")`      -> the locale WITHOUT the articles
//   - `import("./locales/en-US.json?faq")`   -> ONLY the articles
// The JSON on disk stays whole, so Crowdin keeps one source file and the other
// locales (already loaded on demand as whole files) need no change.
//
// The Raidstead game's strings leave the same way (`?raidstead`): only its
// route renders them, so they load with the game. The few keys other pages
// use (page metadata, the Perks card, the loading line) stay in the core.
//
// Plain CommonJS: webpack loads it at build time, and the spec imports it.
const FAQ_CONTENT_KEY = /-(header|body)$/;
const RAIDSTEAD_CORE_KEYS = ["page-title", "page-description", "perk-card-title", "perk-card-description", "loading"];

function splitFaq(locale) {
  const faq = (locale.static && locale.static.faq) || {};
  const coreFaq = {};
  const contentFaq = {};
  for (const key of Object.keys(faq)) {
    (FAQ_CONTENT_KEY.test(key) ? contentFaq : coreFaq)[key] = faq[key];
  }
  const core = { ...locale, static: { ...locale.static, faq: coreFaq } };
  return { core, faq: { static: { faq: contentFaq } } };
}

function splitRaidstead(locale) {
  const all = locale.raidstead || {};
  const coreGame = {};
  const game = {};
  for (const key of Object.keys(all)) {
    (RAIDSTEAD_CORE_KEYS.includes(key) ? coreGame : game)[key] = all[key];
  }
  return { core: { ...locale, raidstead: coreGame }, game: { raidstead: game } };
}

function isFaqQuery(resourceQuery) {
  return typeof resourceQuery === "string" && /(^|[?&])faq(=|&|$)/.test(resourceQuery);
}

function isRaidsteadQuery(resourceQuery) {
  return typeof resourceQuery === "string" && /(^|[?&])raidstead(=|&|$)/.test(resourceQuery);
}

function loader(source) {
  const { core: withoutFaq, faq } = splitFaq(JSON.parse(source));
  const { core, game } = splitRaidstead(withoutFaq);
  const out = isFaqQuery(this.resourceQuery) ? faq : isRaidsteadQuery(this.resourceQuery) ? game : core;
  return `module.exports = ${JSON.stringify(out)};`;
}

module.exports = loader;
module.exports.splitFaq = splitFaq;
module.exports.isFaqQuery = isFaqQuery;
module.exports.FAQ_CONTENT_KEY = FAQ_CONTENT_KEY;
module.exports.splitRaidstead = splitRaidstead;
module.exports.isRaidsteadQuery = isRaidsteadQuery;
module.exports.RAIDSTEAD_CORE_KEYS = RAIDSTEAD_CORE_KEYS;
