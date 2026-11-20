import { isStrictTag } from './chunk-YYHKRTAC.js';
import { parsePixelDimension, authorPixelSize } from './chunk-LUI6MD5L.js';
import { ALLOWED_ATTRIBUTES, authorClasses, IFRAME_SANDBOX_GRANTS, RENDER_HELPER_DATA_ATTRIBUTES, stripMarkdownClasses, namespacedId } from './chunk-GPH6URMW.js';
import { isAllowedEmbedSrc, canonicalEmbedSrc } from './chunk-MYDFHHMT.js';
import { ID_WHITELIST } from './chunk-5HL7IVFO.js';
import { getProxyBase, proxifyImageSrc } from './chunk-LT2KELO7.js';
import { regexMatches } from './chunk-SH6RGNOF.js';
import { trimTrailingSlash, decodeAttributeEntities } from './chunk-QVFPA3RG.js';
import xss from 'xss';

var EMBED_SRC_DATA_ATTRS = /* @__PURE__ */ new Set(["data-embed-src", "data-video-href"]);
var isSafeNavValue = (value) => {
  const trimmed = value.trim().replace(/[\t\n\r\f\v\0]/g, "").toLowerCase();
  if (!trimmed) return false;
  const isSafeScheme = /^(https?|mailto|hive|tel|web\+[a-z0-9.+-]+):/i.test(trimmed);
  const isRelative = /^(\/\/|\/[^/]?|#|\?|[a-z0-9._\-]+(\/|$))/i.test(trimmed);
  return isSafeScheme || isRelative;
};
var ASCII_WS = /[\t\n\f\r ]+/;
var srcsetCandidates = (srcset) => srcset.split(",").map((candidate) => candidate.split(ASCII_WS).filter(Boolean)).filter((parts) => parts.length > 0);
var isWellFormedSrcset = (srcset) => srcsetCandidates(srcset).every(
  (parts) => parts.length === 1 || parts.length === 2 && /^(?:\d+(?:\.\d+)?|\.\d+)[wx]$/i.test(parts[1])
);
var isProxyPSrcset = (srcset) => {
  const base = trimTrailingSlash(getProxyBase());
  const candidates = srcsetCandidates(srcset).map((parts) => parts[0]);
  return candidates.length > 0 && candidates.every((url) => url.startsWith(`${base}/p/`));
};
var escapeAttr = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var hasQuotedAttr = (attrs, wanted) => {
  for (const m of regexMatches(attrs, /\s([^\s"'>\/=]+)="[^"]*"/g)) {
    if (m[1].toLowerCase() === wanted) return true;
  }
  return false;
};
var IFRAME_TAG = /<iframe\b((?:[^>"']|"[^"]*"|'[^']*')*)>|<\/iframe\s*>/gi;
var IFRAME_START = /<iframe\b/gi;
var IFRAME_CLOSE = /<\/iframe\s*>/gi;
function dropRefusedIframes(html) {
  const find = (re, from) => {
    re.lastIndex = from;
    const m = re.exec(html);
    return m ? [m.index, re.lastIndex] : [-1, 0];
  };
  let out = "";
  let last = 0;
  let kept = 0;
  let inner = 0;
  let surplus = 0;
  let close = [-2, 0];
  let next = [-2, 0];
  IFRAME_TAG.lastIndex = 0;
  let tag;
  while ((tag = IFRAME_TAG.exec(html)) !== null) {
    if (kept > 0 && tag[1] !== void 0) {
      if (hasQuotedAttr(tag[1], "src")) inner++;
      continue;
    }
    if (tag[1] === void 0) {
      if (kept > 0) {
        kept = 0;
        surplus += inner;
        inner = 0;
        continue;
      }
      if (surplus > 0) {
        surplus--;
        continue;
      }
      out += html.slice(last, tag.index);
      last = IFRAME_TAG.lastIndex;
      continue;
    }
    if (hasQuotedAttr(tag[1], "src")) {
      kept = 1;
      continue;
    }
    out += html.slice(last, tag.index);
    last = IFRAME_TAG.lastIndex;
    if (close[0] !== -1 && close[0] < last) close = find(IFRAME_CLOSE, last);
    if (close[0] === -1) continue;
    if (next[0] !== -1 && next[0] < last) next = find(IFRAME_START, last);
    if (next[0] !== -1 && next[0] < close[0]) continue;
    const content = html.slice(last, close[0]);
    if (content.includes("<")) out += content;
    last = close[1];
    IFRAME_TAG.lastIndex = last;
  }
  return out + html.slice(last);
}
var isUrlAttribute = (tag, name) => name === "src" && tag !== "a" || name === "srcset" || name === "poster" || name === "data-href" || EMBED_SRC_DATA_ATTRS.has(name);
var RENDER_HELPER_RELS = /* @__PURE__ */ new Set(["nofollow ugc noopener", "noopener"]);
var xssSafeAttrValue = xss.safeAttrValue;
var HREF_SCHEMES = /* @__PURE__ */ new Set(["http", "https", "mailto", "tel", "hive", "steem", "esteem", "ecency"]);
var isHrefScheme = (scheme) => {
  const lower = scheme.toLowerCase();
  return HREF_SCHEMES.has(lower) || /^web\+[a-z0-9.+-]+$/.test(lower);
};
var QUOTED_ATTR = /\s([^\s"'>\/=]+)="([^"]*)"/g;
function enforceImageDimensionPair(html) {
  return html.replace(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
    QUOTED_ATTR.lastIndex = 0;
    const attrs = [];
    let match;
    while (match = QUOTED_ATTR.exec(tag)) {
      attrs.push({ name: match[1].toLowerCase(), value: decodeAttributeEntities(match[2]) });
    }
    const width = attrs.find((attr) => attr.name === "width")?.value;
    const height = attrs.find((attr) => attr.name === "height")?.value;
    const src = (attrs.find((attr) => attr.name === "src")?.value ?? "").trim();
    if (src && authorPixelSize(width, height)) return tag;
    QUOTED_ATTR.lastIndex = 0;
    return tag.replace(
      QUOTED_ATTR,
      (full, name) => name.toLowerCase() === "width" || name.toLowerCase() === "height" ? "" : full
    );
  });
}
function sanitizeHtml(html, options) {
  const preserveImageDimensions = !!options?.preserveImageDimensions;
  const untransformed = !!options?.untransformed;
  const beforeTransform = !!options?.beforeTransform;
  const renderNonce = options?.renderNonce;
  const enforce = untransformed || !!renderNonce;
  const proxyBase = `${trimTrailingSlash(getProxyBase())}/`;
  const whiteList = preserveImageDimensions ? {
    ...ALLOWED_ATTRIBUTES,
    img: [...ALLOWED_ATTRIBUTES.img ?? [], "width", "height"]
  } : ALLOWED_ATTRIBUTES;
  let trusted = false;
  const declaredIds = /* @__PURE__ */ new Set();
  const declaredFragment = (fragment) => {
    let candidates = [fragment];
    try {
      candidates = [fragment, decodeURIComponent(fragment)];
    } catch {
    }
    return candidates.find((id) => declaredIds.has(id) && ID_WHITELIST.test(id)) ?? null;
  };
  for (const m of regexMatches(html, /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    declaredIds.add(decodeAttributeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim()));
  }
  const cleaned = xss(html, {
    whiteList,
    onTag: (_tag, rawTag) => {
      trusted = !!renderNonce && rawTag.indexOf(renderNonce) !== -1 && isStrictTag(rawTag);
      return void 0;
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["style"],
    css: false,
    // block style attrs entirely for safety
    onTagAttr: (tag, name, value, isWhiteAttr) => {
      const decoded = decodeAttributeEntities(value.trim());
      const decodedLower = decoded.toLowerCase();
      if (name.startsWith("on")) return "";
      let hrefSchemeAllowed = false;
      if (name === "href") {
        const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(
          decoded.replace(/^[\s\u0000-\u0020\ufffd]+/, "").replace(/[\t\n\r]/g, "")
        );
        if (scheme && !isHrefScheme(scheme[1])) return isWhiteAttr ? "href" : "";
        hrefSchemeAllowed = !!scheme && /^(?:tel|mailto|web\+[a-z0-9.+-]+)$/i.test(scheme[1]);
      }
      if (tag === "img" && name === "src" && !/^https?:\/\//.test(decodedLower)) return "";
      if ((tag === "img" || tag === "source") && name === "srcset" && !beforeTransform && !isWellFormedSrcset(decoded)) return "";
      if (tag === "img" && name === "srcset") {
        const candidates = srcsetCandidates(decoded).map((parts) => parts[0]);
        if (candidates.some((url) => !/^https?:\/\//i.test(url))) return "";
      }
      if (tag === "source" && name === "srcset" && !isProxyPSrcset(decoded)) return "";
      if (tag === "source" && name === "type" && decodedLower !== "image/avif" && decodedLower !== "image/webp") return "";
      if ((tag === "video" || tag === "audio") && ["src", "poster"].includes(name) && !/^https?:\/\//.test(decodedLower)) return "";
      if (tag === "audio" && name === "preload" && decodedLower !== "metadata" && decodedLower !== "none") return "";
      if (tag === "img" && ["dynsrc", "lowsrc"].includes(name)) return "";
      if (tag === "img" && (name === "width" || name === "height")) {
        if (!preserveImageDimensions || parsePixelDimension(decoded) == null) return "";
      }
      if (tag === "span" && name === "class" && decoded.toLowerCase().trim() === "wr") return "";
      if (isWhiteAttr && name === "class" && !trusted) {
        const kept = authorClasses(decoded);
        return kept ? `class="${escapeAttr(kept)}"` : "";
      }
      if (!beforeTransform && (tag === "iframe" && name === "src" || EMBED_SRC_DATA_ATTRS.has(name)) && /[\t\n\r]/.test(decoded)) return "";
      if (tag === "iframe" && name === "src" && !beforeTransform && !isAllowedEmbedSrc(decoded)) {
        const canonical = canonicalEmbedSrc(decoded);
        return isAllowedEmbedSrc(canonical) ? `src="${escapeAttr(canonical)}"` : "";
      }
      if (tag === "iframe" && name === "sandbox") {
        const tokens = decodedLower.split(/\s+/).filter(Boolean);
        const kept = tokens.filter((token) => IFRAME_SANDBOX_GRANTS.has(token));
        if (kept.length !== tokens.length) return `sandbox="${kept.join(" ")}"`;
      }
      if (enforce) {
        if (tag === "img" && name === "src" && !decoded.startsWith(proxyBase)) {
          const proxied = proxifyImageSrc(decoded, 0, 0, "match", { forceProxy: true });
          return proxied ? `src="${escapeAttr(proxied)}"` : "";
        }
        if (tag === "img" && name === "srcset" && srcsetCandidates(decoded).some((parts) => !parts[0].startsWith(proxyBase))) return "";
        if (tag === "video" && name === "poster" && !decoded.startsWith(proxyBase)) {
          const proxied = /^https?:\/\//i.test(decoded) ? proxifyImageSrc(decoded, 0, 0, "match", { forceProxy: true }) : "";
          return proxied ? `poster="${escapeAttr(proxied)}"` : "";
        }
      }
      if (enforce) {
        if (isWhiteAttr && name === "class" && /[&\u0000-\u001f\u007f]/.test(value)) {
          const kept = decoded.replace(/[\u0000-\u001f\u007f]/g, " ").split(/\s+/).filter((token) => token && !/markdown/i.test(token)).join(" ");
          return kept ? `class="${escapeAttr(kept)}"` : "";
        }
        if (tag === "a" && name === "rel" && !RENDER_HELPER_RELS.has(decodedLower.replace(/\s+/g, " "))) return "";
        if (tag === "a" && name === "target" && decodedLower !== "_blank") return "";
      }
      if (enforce && !trusted) {
        if (tag === "a" && (name === "target" || name === "rel")) return "";
        const navigable = tag === "a" && name === "href" ? decoded.replace(/^[\u0000- �]+/, "").replace(/[\t\n\r]/g, "").replace(/\\/g, "/") : "";
        if (navigable && /^(?:https?:)?\/\//i.test(navigable)) {
          return `href="${escapeAttr(navigable)}" rel="nofollow ugc noopener"`;
        }
        if (RENDER_HELPER_DATA_ATTRIBUTES.has(name)) return "";
        if (isWhiteAttr && name === "class") {
          const kept = stripMarkdownClasses(decoded);
          if (kept !== decoded) return kept ? `class="${escapeAttr(kept)}"` : "";
        }
      }
      if (EMBED_SRC_DATA_ATTRS.has(name) && !isAllowedEmbedSrc(decoded)) return "";
      if (name === "data-href" && !isSafeNavValue(decoded)) return "";
      if (name === "id") {
        if (!ID_WHITELIST.test(decoded)) return "";
        if (isWhiteAttr && !beforeTransform && !untransformed) return `id="${escapeAttr(namespacedId(decoded))}"`;
      }
      if (isWhiteAttr && !beforeTransform && !untransformed && tag === "a" && (name === "href" || name === "data-href") && decoded.startsWith("#")) {
        const target = declaredFragment(decoded.slice(1));
        if (target !== null) return `${name}="#${escapeAttr(namespacedId(target))}"`;
      }
      if (isWhiteAttr && name === "href") {
        return hrefSchemeAllowed || xssSafeAttrValue(tag, name, decoded, void 0) ? `href="${escapeAttr(decoded)}"` : "href";
      }
      if (!beforeTransform && isWhiteAttr && isUrlAttribute(tag, name)) {
        return `${name}="${escapeAttr(decoded)}"`;
      }
      return void 0;
    }
  });
  const withoutBareSource = cleaned.replace(
    /<source\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
    (t) => /\btype\s*=\s*["'](?:image\/avif|image\/webp)["']/i.test(t) ? t : ""
  );
  let withoutBareIframe = withoutBareSource;
  if (!beforeTransform) {
    let previous;
    do {
      previous = withoutBareIframe;
      withoutBareIframe = dropRefusedIframes(withoutBareIframe);
    } while (withoutBareIframe !== previous);
  }
  return preserveImageDimensions ? enforceImageDimensionPair(withoutBareIframe) : withoutBareIframe;
}

export { sanitizeHtml };
//# sourceMappingURL=chunk-RSO7K4ZG.js.map
//# sourceMappingURL=chunk-RSO7K4ZG.js.map