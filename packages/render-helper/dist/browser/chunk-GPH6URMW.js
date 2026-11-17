// src/consts/allowed-attributes.const.ts
var ALLOWED_ATTRIBUTES = {
  "a": [
    "href",
    "target",
    "rel",
    "data-permlink",
    "data-tag",
    "data-author",
    "data-href",
    "data-community",
    "data-filter",
    "data-embed-src",
    "data-youtube",
    "data-start-time",
    "data-video-href",
    "data-proposal",
    "data-is-inline",
    "class",
    "title",
    "data-id",
    "id"
  ],
  "img": [
    "src",
    "srcset",
    "sizes",
    "alt",
    "class",
    "loading",
    "fetchpriority",
    "decoding",
    "itemprop"
  ],
  // Responsive image content-negotiation wrapper emitted for web/self-hosted
  // (forApp === false). Without these entries `xss` silently collapses the
  // <picture>/<source> to a bare <img>. `source` attrs are further constrained
  // in sanitize-html (srcset must be a proxy /p/ URL; type must be avif/webp;
  // a type-less <source> is dropped post-pass).
  "picture": [],
  "source": ["type", "srcset", "sizes"],
  "span": ["class", "id", "data-align"],
  "iframe": ["src", "class", "frameborder", "allowfullscreen", "webkitallowfullscreen", "mozallowfullscreen", "sandbox"],
  "video": ["src", "controls", "poster"],
  "audio": ["src", "controls", "preload"],
  "div": ["class", "id", "data-align"],
  "strong": [],
  "b": [],
  "i": [],
  "strike": [],
  "em": [],
  "code": [],
  "pre": [],
  "blockquote": ["class"],
  "sup": [],
  "sub": [],
  "h1": ["dir", "id", "data-align"],
  "h2": ["dir", "id", "data-align"],
  "h3": ["dir", "id", "data-align"],
  "h4": ["dir", "id", "data-align"],
  "h5": ["dir", "id", "data-align"],
  "h6": ["dir", "id", "data-align"],
  "p": ["dir", "id", "data-align"],
  "center": [],
  "ul": [],
  "ol": [],
  "li": [],
  "table": [],
  "thead": [],
  "tbody": [],
  "tr": [],
  "td": [],
  "th": [],
  "hr": [],
  "br": [],
  "del": [],
  "ins": []
};
var RENDER_HELPER_DATA_ATTRIBUTES = /* @__PURE__ */ new Set([
  "data-author",
  "data-community",
  "data-embed-src",
  "data-filter",
  "data-href",
  "data-is-inline",
  "data-permlink",
  "data-proposal",
  "data-start-time",
  "data-tag",
  "data-video-href",
  "data-youtube"
]);
function stripMarkdownClasses(value) {
  const tokens = value.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((token) => !/markdown-/i.test(token));
  return kept.length === tokens.length ? value : kept.join(" ");
}
var AUTHOR_CLASSES = /* @__PURE__ */ new Set([
  "pull-right",
  "pull-left",
  "text-justify",
  "text-rtl",
  "text-center",
  "text-right",
  "videoWrapper",
  "phishy",
  // A pasted tweet embed's blockquote, centred by the entry stylesheet.
  "twitter-tweet"
]);
var AUTHOR_CLASS_RE = /^ecency-text-color-[0-9a-f]{6}$/;
var MARKDOWN_STAGE_CLASSES = /* @__PURE__ */ new Set([
  "footnote-backref",
  "footnote-item",
  "footnote-ref",
  "footnotes",
  "footnotes-list",
  "footnotes-sep"
]);
var MARKDOWN_STAGE_CLASS_RE = /^(?:ll-[a-z]+|language-[A-Za-z0-9_+#.-]+)$/;
function authorClasses(value) {
  const tokens = value.replace(/[\u0000-\u001f\u007f]/g, " ").split(/\s+/).filter(Boolean);
  const kept = tokens.filter(
    (token) => !/markdown-/i.test(token) && (AUTHOR_CLASSES.has(token) || AUTHOR_CLASS_RE.test(token) || MARKDOWN_STAGE_CLASSES.has(token) || MARKDOWN_STAGE_CLASS_RE.test(token))
  );
  return kept.length === tokens.length && !/[\u0000-\u001f\u007f]/.test(value) ? value : kept.join(" ");
}
var AUTHOR_ID_PREFIX = "user-content-";
function namespacedId(id) {
  return AUTHOR_ID_PREFIX + id;
}
var IFRAME_SANDBOX_GRANTS = /* @__PURE__ */ new Set([
  "allow-scripts",
  "allow-same-origin",
  "allow-popups"
]);

export { ALLOWED_ATTRIBUTES, AUTHOR_ID_PREFIX, IFRAME_SANDBOX_GRANTS, RENDER_HELPER_DATA_ATTRIBUTES, authorClasses, namespacedId, stripMarkdownClasses };
//# sourceMappingURL=chunk-GPH6URMW.js.map
//# sourceMappingURL=chunk-GPH6URMW.js.map