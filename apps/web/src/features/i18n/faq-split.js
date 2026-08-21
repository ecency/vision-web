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
// Plain CommonJS: webpack loads it at build time, and the spec imports it.
const FAQ_CONTENT_KEY = /-(header|body)$/;

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

function isFaqQuery(resourceQuery) {
  return typeof resourceQuery === "string" && /(^|[?&])faq(=|&|$)/.test(resourceQuery);
}

function loader(source) {
  const { core, faq } = splitFaq(JSON.parse(source));
  const out = isFaqQuery(this.resourceQuery) ? faq : core;
  return `module.exports = ${JSON.stringify(out)};`;
}

module.exports = loader;
module.exports.splitFaq = splitFaq;
module.exports.isFaqQuery = isFaqQuery;
module.exports.FAQ_CONTENT_KEY = FAQ_CONTENT_KEY;
