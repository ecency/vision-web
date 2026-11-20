import { sanitizeHtml } from './chunk-CUJE3JDO.js';
import { stripAuthorMarkers } from './chunk-FAKJ3NFL.js';
import { traverse } from './chunk-PPU366T7.js';
import { createRenderNonce, xmldomNodeFilter } from './chunk-YYHKRTAC.js';
import { ENTITY_REGEX, PLACEHOLDER_DELIMITERS, PRIVATE_DELIMITERS_FROM, PRIVATE_DELIMITERS_TO } from './chunk-AS65CVY3.js';
import { regexMatches } from './chunk-SH6RGNOF.js';
import { XMLDOMSerializer, DOMParser } from './chunk-DBKALPTB.js';
import { hasAmpSentinel, removeDuplicateAttributes, decodeCompleteReferences, decodeEntities, moveBlockClosingTagOutOfParagraph } from './chunk-QVFPA3RG.js';
import { Remarkable, utils } from 'remarkable';
import { linkify } from 'remarkable/linkify';
import * as htmlparser2 from 'htmlparser2';
import * as domSerializerModule from 'dom-serializer';

var domSerializer = domSerializerModule.default || domSerializerModule;
var URL_RUN = /https?:\/\/(?:[^\s<>"'`()]|\([^\s<>"'`()]*\)|\()+/gi;
var AMP_PAIR = "\uE000\uE001";
var AMP_PAIR_G = /\uE000\uE001/g;
var AMP_PAIR_HREF = /\uE000\uE001|%EE%80%80%EE%80%81/g;
var ampEscapes = false;
function pairedSource(src) {
  const paired = src.replace(
    BACKSLASH_RUN,
    (run) => run.endsWith("&") && run.length % 2 === 0 ? run.slice(0, -2) + AMP_PAIR : run
  );
  return paired.includes(AMP_PAIR) ? paired : null;
}
var BACKSLASH_RUN = /\\+&?/g;
function wrapRule(ruler, name, wrap) {
  const rule = ruler.__rules__.find((r) => r.name === name);
  if (rule) ruler.at(name, wrap(rule.fn));
}
function withPairedSource(rule) {
  return (state, silent) => {
    if (!ampEscapes || state.ampInside) return rule(state, silent);
    if (state.ampPaired === void 0) state.ampPaired = pairedSource(state.src);
    const paired = state.ampPaired;
    if (paired === null) return rule(state, silent);
    const src = state.src;
    state.src = paired;
    state.ampInside = true;
    state.ampOriginal = src;
    try {
      return rule(state, silent);
    } finally {
      state.src = src;
      state.ampInside = false;
      state.ampOriginal = void 0;
    }
  };
}
function withOriginalSource(rule) {
  return (state, silent) => {
    if (!state.ampInside || state.ampOriginal === void 0) return rule(state, silent);
    const paired = state.src;
    state.src = state.ampOriginal;
    try {
      return rule(state, silent);
    } finally {
      state.src = paired;
    }
  };
}
function withPairedReferences(rule) {
  return (state) => {
    if (!ampEscapes) return rule(state);
    const originals = /* @__PURE__ */ new Map();
    for (const token of state.tokens) {
      if (token.type !== "inline" || !token.content) continue;
      const paired = pairedSource(token.content);
      if (paired === null) continue;
      originals.set(token, { original: token.content, paired });
      token.content = paired;
    }
    try {
      return rule(state);
    } finally {
      for (const [token, { original, paired }] of originals) {
        token.content = token.content === paired ? original : token.content?.replace(AMP_PAIR_G, "\\&");
      }
    }
  };
}
var MAX_HIGHLIGHT_LENGTH = 2e4;
var escapeCode = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
var hrefAmp = (value) => value.replace(AMP_PAIR_HREF, "&");
var literalAmp = (value) => value.replace(AMP_PAIR_G, "&");
var sourceAmp = (value) => value.replace(AMP_PAIR_G, "\\&");
function restorePairedAmpersands(token) {
  if (token.content === void 0 || !token.content.includes(AMP_PAIR)) return;
  token.content = token.type === "code" || token.type === "htmltag" ? sourceAmp(token.content) : literalAmp(token.content);
}
function decodeDestinations(state) {
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    for (const token of block.children) {
      if (token.type === "image" && token.src) token.src = decodeCompleteReferences(token.src);
      else if (token.type === "link_open" && token.href) token.href = decodeCompleteReferences(token.href);
      if (!ampEscapes) continue;
      if (token.src) token.src = hrefAmp(token.src);
      if (token.href) token.href = hrefAmp(token.href);
      if (token.alt) token.alt = literalAmp(token.alt);
      if (token.title) token.title = literalAmp(token.title);
      restorePairedAmpersands(token);
    }
  }
  return true;
}
var uriNormalized = (url) => {
  try {
    url = decodeURI(url);
  } catch {
  }
  return encodeURI(url);
};
function undecodedAngleDestination(value, raw, unswap) {
  try {
    if (value !== uriNormalized(utils.replaceEntities(utils.unescapeMd(raw)))) return void 0;
    return uriNormalized(utils.unescapeMd(unswap(raw)));
  } catch {
    return void 0;
  }
}
function angleDestination(src, pos, max) {
  if (src.charCodeAt(pos) !== 60) return null;
  for (let at = pos + 1; at < max; at++) {
    const code = src.charCodeAt(at);
    if (code === 10) return null;
    if (code === 62) return src.slice(pos + 1, at);
    if (code === 92 && at + 1 < max) at++;
  }
  return null;
}
var skipSpaces = (src, pos, max) => {
  while (pos < max && (src.charCodeAt(pos) === 32 || src.charCodeAt(pos) === 10)) pos++;
  return pos;
};
function linkLabelEnd(state, start) {
  const oldPos = state.pos;
  const oldFlag = state.isInLabel;
  state.pos = start + 1;
  state.isInLabel = true;
  let level = 1;
  let end = -1;
  while (state.pos < state.posMax) {
    const code = state.src.charCodeAt(state.pos);
    if (code === 91) level++;
    else if (code === 93 && --level === 0) {
      end = state.pos;
      break;
    }
    state.parser.skipToken(state);
  }
  state.pos = oldPos;
  state.isInLabel = oldFlag;
  return end;
}
function withAngleDestinations(rule, unswap) {
  return (state, silent) => {
    const start = state.pos;
    const before = state.tokens.length;
    const ok = rule(state, silent);
    if (!ok || silent) return ok;
    const label = state.src.charCodeAt(start) === 33 ? start + 1 : start;
    const labelEnd = linkLabelEnd(state, label);
    if (labelEnd < 0 || state.src.charCodeAt(labelEnd + 1) !== 40) return ok;
    const raw = angleDestination(state.src, skipSpaces(state.src, labelEnd + 2, state.posMax), state.posMax);
    if (raw === null) return ok;
    const token = state.tokens.slice(before).find((t) => t.type === "link_open" || t.type === "image");
    if (!token) return ok;
    const field = token.type === "image" ? "src" : "href";
    const undecoded = undecodedAngleDestination(token[field], raw, unswap);
    if (undecoded !== void 0) token[field] = undecoded;
    return ok;
  };
}
function withAngleReferences(rule, unswap) {
  return (state) => {
    const parser = state.inline;
    const skipToken = parser.skipToken;
    let seen = [];
    let seenSet = /* @__PURE__ */ new Set();
    parser.skipToken = function(inline) {
      if (!seenSet.has(inline)) {
        seenSet.add(inline);
        seen.push(inline);
      }
      return skipToken.call(this, inline);
    };
    const known = new Set(Object.keys(state.env.references ?? {}));
    const tokens = state.tokens;
    let result;
    try {
      result = rule({ ...state, tokens: [] });
      for (let i = 1; i < tokens.length - 1; i++) {
        if (tokens[i].type !== "inline" || tokens[i - 1].type !== "paragraph_open" || tokens[i + 1].type !== "paragraph_close") continue;
        const before = tokens[i].content ?? "";
        seen = [];
        seenSet = /* @__PURE__ */ new Set();
        result = rule({ ...state, tokens: [tokens[i - 1], tokens[i], tokens[i + 1]] });
        const references = state.env.references;
        if (!references || before.charCodeAt(0) !== 91) continue;
        readDefinitions(before, before.length - (tokens[i].content ?? "").length, seen, references, known, unswap);
      }
    } finally {
      parser.skipToken = skipToken;
    }
    return result;
  };
}
function destinationEnd(src, pos, max) {
  if (src.charCodeAt(pos) === 60) {
    const raw = angleDestination(src, pos, max);
    return raw === null ? -1 : pos + raw.length + 2;
  }
  const start = pos;
  let level = 0;
  while (pos < max) {
    const code = src.charCodeAt(pos);
    if (code === 32 || code < 32 || code === 127) break;
    if (code === 92 && pos + 1 < max) {
      pos += 2;
      continue;
    }
    if (code === 40 && ++level > 1) break;
    if (code === 41 && --level < 0) break;
    pos++;
  }
  return pos === start ? -1 : pos;
}
function titleEnd(src, pos, max) {
  let marker = src.charCodeAt(pos);
  if (marker !== 34 && marker !== 39 && marker !== 40) return -1;
  if (marker === 40) marker = 41;
  for (let at = pos + 1; at < max; at++) {
    const code = src.charCodeAt(at);
    if (code === marker) return at + 1;
    if (code === 92 && at + 1 < max) at++;
  }
  return -1;
}
function definitionEnd(src, labelEnd) {
  const max = src.length;
  if (src.charCodeAt(labelEnd + 1) !== 58) return -1;
  const end = destinationEnd(src, skipSpaces(src, labelEnd + 2, max), max);
  if (end === -1) return -1;
  let pos = skipSpaces(src, end + 1, max);
  pos = pos < max && end !== pos ? titleEnd(src, pos, max) : -1;
  if (pos === -1) pos = end;
  while (pos < max && src.charCodeAt(pos) === 32) pos++;
  return pos < max && src.charCodeAt(pos) !== 10 ? -1 : pos;
}
function readDefinitions(before, consumed, seen, references, known, unswap) {
  const stateAt = /* @__PURE__ */ new Map();
  for (const inline of seen) stateAt.set(before.length - inline.src.length, inline);
  let at = 0;
  while (at < consumed) {
    const inline = stateAt.get(at);
    const labelEnd = inline ? at + linkLabelEnd(inline, 0) : before.startsWith("[]", at) ? at + 1 : -1;
    if (labelEnd < at) return;
    const end = definitionEnd(before, labelEnd);
    if (end === -1) return;
    const key = before.slice(at + 1, labelEnd).trim().replace(/\s+/g, " ").toUpperCase();
    if (!known.has(key)) {
      known.add(key);
      const raw = angleDestination(before, skipSpaces(before, labelEnd + 2, before.length), before.length);
      if (raw !== null && references[key]) {
        const undecoded = undecodedAngleDestination(references[key].href, raw, unswap);
        if (undecoded !== void 0) references[key].href = undecoded;
      }
    }
    at = end;
    while (at < before.length && /\s/.test(before[at])) at++;
  }
}
function placeholderDelimiter(input) {
  if (input.includes("&")) input += decodeEntities(input);
  const free = PLACEHOLDER_DELIMITERS.find((d) => !input.includes(d));
  if (free) return free;
  const used = new Uint8Array(PRIVATE_DELIMITERS_TO - PRIVATE_DELIMITERS_FROM + 1);
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= PRIVATE_DELIMITERS_FROM && code <= PRIVATE_DELIMITERS_TO) used[code - PRIVATE_DELIMITERS_FROM] = 1;
  }
  const at = used.indexOf(0);
  if (at !== -1) return String.fromCharCode(PRIVATE_DELIMITERS_FROM + at);
  const size = used.length;
  const pairs = /* @__PURE__ */ new Set();
  for (let i = 0; i + 1 < input.length; i++) {
    const first = input.charCodeAt(i) - PRIVATE_DELIMITERS_FROM;
    const second = input.charCodeAt(i + 1) - PRIVATE_DELIMITERS_FROM;
    if (first >= 0 && first < size && second >= 0 && second < size) pairs.add(first * size + second);
  }
  let pair = 0;
  while (pairs.has(pair)) pair++;
  return String.fromCharCode(PRIVATE_DELIMITERS_FROM + Math.floor(pair / size), PRIVATE_DELIMITERS_FROM + pair % size);
}
function expandTabsLikeRemarkable(src) {
  if (!src.includes("	")) return src;
  const normalized = src.replace(/\u00a0/g, " ").replace(/\r[\n\u0085]|[\u2424\u2028\u0085]/g, "\n");
  const widths = [];
  let lineStart = 0;
  let lastTabPos = 0;
  for (let offset = 0; offset < normalized.length; offset++) {
    const code = normalized.charCodeAt(offset);
    if (code === 10) {
      lineStart = offset + 1;
      lastTabPos = 0;
    } else if (code === 9) {
      widths.push("    ".slice((offset - lineStart - lastTabPos) % 4));
      lastTabPos = offset - lineStart + 1;
    }
  }
  let k = 0;
  return src.replace(/\t/g, () => widths[k++]);
}
function restoreCodeEntities(unswap) {
  const restore = (token) => {
    if (token.type !== "code" && token.type !== "fence") return;
    if (token.content) token.content = unswap(token.content);
    if (token.params) token.params = unswap(token.params);
  };
  return (state) => {
    for (const token of state.tokens) {
      restore(token);
      if (token.type === "inline" && token.children) token.children.forEach(restore);
    }
    return true;
  };
}
var lolightPromise = null;
var lolightModule = null;
async function loadLolight() {
  if (typeof window !== "undefined") {
    return null;
  }
  if (lolightModule) {
    return lolightModule;
  }
  if (!lolightPromise) {
    lolightPromise = import('lolight').then((mod) => {
      lolightModule = mod.default || mod;
      return lolightModule;
    }).catch(() => {
      lolightModule = null;
      return null;
    });
  }
  return lolightPromise;
}
function getLolightInstance() {
  return lolightModule;
}
if (typeof window === "undefined") {
  loadLolight().catch(() => {
  });
}
var BLOCK_TAGS_ALTERNATION = "center|div|table|figure|section|article|aside|header|footer|nav|main";
var BLOCK_TAGS_SET = new Set(BLOCK_TAGS_ALTERNATION.split("|"));
function fixBlockLevelTagsInParagraphs(html) {
  const openingPattern = new RegExp(`<p>(<(?:${BLOCK_TAGS_ALTERNATION})(?:\\s[^>]*)?>)<\\/p>`, "gi");
  html = html.replace(openingPattern, "$1");
  const closingPattern = new RegExp(`<p>(<\\/(?:${BLOCK_TAGS_ALTERNATION})>)<\\/p>`, "gi");
  html = html.replace(closingPattern, "$1");
  const startPattern = new RegExp(`<p>(<(?:${BLOCK_TAGS_ALTERNATION})(?:\\s[^>]*)?>)(?:<br>)?\\s*`, "gi");
  html = html.replace(startPattern, "$1<p>");
  html = moveBlockClosingTagOutOfParagraph(html, BLOCK_TAGS_SET);
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<p><br>\s*<\/p>/g, "");
  return html;
}
function stripDocumentWrapper(html) {
  return html.replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, "").replace(/^<\?xml[^?]*\?>/, "").replace(/^<!DOCTYPE[^>]*>/i, "").replace(/<\/?html(?=[\s/>])[^>]*>/g, "").replace(/<head(?=[\s/>])[^>]*>[\s\S]*?<\/head>/g, "").replace('<body id="root">', "").replace("</body>", "").trim();
}
function markdownToHTML(input, forApp, parentDomain = "ecency.com", seoContext, renderOptions) {
  input = input.replace(new RegExp("https://leofinance.io/threads/view/", "g"), "/@");
  input = input.replace(new RegExp("https://leofinance.io/posts/", "g"), "/@");
  input = input.replace(new RegExp("https://leofinance.io/threads/", "g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/threads/view/", "g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/posts/", "g"), "/@");
  input = input.replace(new RegExp("https://inleo.io/threads/", "g"), "/@");
  const md = new Remarkable({
    html: true,
    breaks: true,
    typographer: false,
    // Returning '' hands the block back to remarkable, which escapes it as
    // plain code. A raw `str` used to be returned, and token text was written
    // unescaped, so markup in a string literal (`"<i>hi</i>"`) rendered as
    // markup inside the code block.
    highlight: function(str) {
      if (str.length > MAX_HIGHLIGHT_LENGTH) {
        return "";
      }
      const lolightInstance = getLolightInstance();
      if (!lolightInstance) {
        return "";
      }
      try {
        const tokens = lolightInstance.tok(str);
        return tokens.map(
          (token) => `<span class="ll-${token[0]}">${escapeCode(token[1])}</span>`
        ).join("");
      } catch (err) {
        console.error(err);
      }
      return "";
    }
  }).use(linkify);
  md.core.ruler.before("linkify", "decode_destinations", decodeDestinations, {});
  wrapRule(md.inline.ruler, "links", (rule) => withAngleDestinations(rule, (text) => unswap(text)));
  wrapRule(md.inline.ruler, "links", withPairedSource);
  wrapRule(md.inline.ruler, "autolink", withOriginalSource);
  wrapRule(md.core.ruler, "references", (rule) => withAngleReferences(rule, (text) => unswap(text)));
  wrapRule(md.core.ruler, "references", withPairedReferences);
  md.core.ruler.enable([
    "abbr"
  ]);
  md.block.ruler.enable([
    "footnote",
    "deflist"
  ]);
  md.inline.ruler.enable([
    "footnote_inline",
    "ins",
    "mark",
    "sub",
    "sup"
  ]);
  const serializer = new XMLDOMSerializer();
  if (!input) {
    return "";
  }
  let output = "";
  ampEscapes = input.includes("\\&") && !hasAmpSentinel(input);
  const entities = forApp ? input.match(ENTITY_REGEX) : null;
  const entityPlaceholders = [];
  const delimiter = entities ? placeholderDelimiter(input) : null;
  const placeholderRe = delimiter ? new RegExp(`${delimiter}(0|[1-9]\\d*)${delimiter}`, "g") : null;
  const unswap = (text) => placeholderRe ? text.replace(placeholderRe, (placeholder, index) => entityPlaceholders[+index] ?? placeholder) : text;
  if (entities && delimiter) {
    input = expandTabsLikeRemarkable(input);
    const indexOf = /* @__PURE__ */ new Map();
    for (const entity of entities) {
      if (!indexOf.has(entity)) {
        indexOf.set(entity, entityPlaceholders.length);
        entityPlaceholders.push(entity);
      }
    }
    const escaped = (text, at) => {
      let k = at - 1;
      while (k >= 0 && text.charCodeAt(k) === 92) k--;
      return (at - 1 - k) % 2 === 1;
    };
    const swap = (text) => text.replace(ENTITY_REGEX, (entity, ...rest) => {
      const at = rest[rest.length - 2];
      return escaped(text, at) ? entity : `${delimiter}${indexOf.get(entity)}${delimiter}`;
    });
    let protectedInput = "";
    let last = 0;
    for (const m of regexMatches(input, URL_RUN)) {
      const at = m.index ?? 0;
      protectedInput += swap(input.slice(last, at)) + m[0];
      last = at + m[0].length;
    }
    input = protectedInput + swap(input.slice(last));
    md.core.ruler.before("linkify", "restore_code_entities", restoreCodeEntities(unswap), {});
  }
  const untransformed = { ...renderOptions, untransformed: true };
  const nonce = createRenderNonce();
  try {
    output = md.render(input);
    if (ampEscapes) output = sourceAmp(output);
    output = fixBlockLevelTagsInParagraphs(output);
    const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(output)}</body>`, "text/html");
    stripAuthorMarkers(doc);
    traverse(doc, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions);
    output = serializer.serializeToString(doc, xmldomNodeFilter(nonce));
  } catch (error) {
    try {
      const preSanitized = sanitizeHtml(output, { ...renderOptions, beforeTransform: true });
      const dom = htmlparser2.parseDocument(preSanitized, {
        // lenient options - don't throw on malformed HTML
        lowerCaseTags: false,
        lowerCaseAttributeNames: false
      });
      const repairedHtml = domSerializer(dom.children);
      const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(repairedHtml)}</body>`, "text/html");
      stripAuthorMarkers(doc);
      traverse(doc, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions);
      output = serializer.serializeToString(doc, xmldomNodeFilter(nonce));
    } catch (fallbackError) {
      output = sanitizeHtml(output || (ampEscapes ? sourceAmp(md.render(input)) : md.render(input)), untransformed);
    }
  }
  if (output && entityPlaceholders.length > 0) {
    output = unswap(output);
  }
  output = stripDocumentWrapper(output);
  return sanitizeHtml(output, { ...renderOptions, renderNonce: nonce });
}

export { markdownToHTML, stripDocumentWrapper };
//# sourceMappingURL=chunk-2WKZYA3X.js.map
//# sourceMappingURL=chunk-2WKZYA3X.js.map