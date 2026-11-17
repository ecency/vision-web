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
var IFRAME_SANDBOX_GRANTS = /* @__PURE__ */ new Set([
  "allow-scripts",
  "allow-same-origin",
  "allow-popups"
]);

export { ALLOWED_ATTRIBUTES, IFRAME_SANDBOX_GRANTS, RENDER_HELPER_DATA_ATTRIBUTES, stripMarkdownClasses };
//# sourceMappingURL=chunk-XGVZLBT6.js.map
//# sourceMappingURL=chunk-XGVZLBT6.js.map