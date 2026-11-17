import { traverse } from './chunk-6TSYCJNV.js';
import { sanitizeHtml } from './chunk-OPUVENT7.js';
import { stripAuthorMarkers } from './chunk-FAKJ3NFL.js';
import { createRenderNonce, xmldomNodeFilter } from './chunk-YYHKRTAC.js';
import { hasAmpSentinel, removeDuplicateAttributes, decodeCompleteReferences, moveBlockClosingTagOutOfParagraph } from './chunk-VLNYO6UX.js';
import { XMLDOMSerializer, DOMParser } from './chunk-LAYY6CL4.js';
import { ENTITY_REGEX } from './chunk-3IFARPWV.js';
import { regexMatches } from './chunk-SH6RGNOF.js';
import { Remarkable } from 'remarkable';
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
var QUOTE = -1;
var isSpace = (line, at) => line.charCodeAt(at) === 32;
function readContainers(line, from = 0, fromColumn = 0, carriedIndent = 0) {
  const containers = [];
  let at = from;
  let column = fromColumn;
  for (let first = true; ; first = false) {
    let indent = first ? carriedIndent : 0;
    const spacesFrom = indent;
    while (indent < 4 && isSpace(line, at + indent - spacesFrom)) indent++;
    if (indent > 3) break;
    const markerAt = at + indent - spacesFrom;
    const c = line[markerAt];
    if (c === ">") {
      containers.push(QUOTE);
      at = markerAt + 1;
      column += indent - spacesFrom + 1;
      if (isSpace(line, at)) {
        at++;
        column++;
      }
      continue;
    }
    let markerLength = 0;
    if (c === "-" || c === "*" || c === "+") {
      markerLength = 1;
    } else {
      let d = markerAt;
      while (d - markerAt < 9 && line.charCodeAt(d) >= 48 && line.charCodeAt(d) <= 57) d++;
      if (d > markerAt && (line[d] === "." || line[d] === ")")) markerLength = d - markerAt + 1;
    }
    if (markerLength === 0) break;
    const afterMarker = column + indent - spacesFrom + markerLength;
    let gapColumns = 0;
    let gapChars = 0;
    while (gapColumns < 5) {
      const g = line[markerAt + markerLength + gapChars];
      if (g === " ") gapColumns++;
      else if (g === "	") gapColumns += 4 - (afterMarker + gapColumns) % 4;
      else break;
      gapChars++;
    }
    if (gapChars === 0) break;
    const wide = gapColumns >= 5;
    const width = indent + markerLength + (wide ? 1 : gapColumns);
    containers.push(width);
    at = markerAt + markerLength + (wide ? 1 : gapChars);
    column += width - spacesFrom;
  }
  return { containers, at };
}
function insideContainers(line, containers, blank) {
  return insideContainersAt(line, containers, blank).at;
}
function insideContainersAt(line, containers, blank) {
  let at = 0;
  let column = 0;
  let carry = 0;
  for (let k = 0; k < containers.length; k++) {
    const container = containers[k];
    const prefix = { at: -1, column, carry, matched: k, prefixAt: at };
    if (container === QUOTE) {
      let indent = 0;
      while (indent < 4 && isSpace(line, at + indent)) indent++;
      if (indent > 3 || line[at + indent] !== ">") return prefix;
      at += indent + 1;
      column += indent + 1;
      carry = 0;
      if (isSpace(line, at)) {
        at++;
        column++;
      }
    } else {
      if (blank) return { at: line.length, column, carry: 0, matched: containers.length, prefixAt: line.length };
      let needed = container - carry;
      carry = 0;
      while (needed > 0) {
        if (isSpace(line, at)) {
          at++;
          column++;
          needed--;
        } else if (line[at] === "	") {
          const width = 4 - column % 4;
          at++;
          column += width;
          needed -= width;
        } else {
          return prefix;
        }
      }
      carry = -needed;
    }
  }
  return { at, column, carry, matched: containers.length, prefixAt: at };
}
function fenceAt(line, at) {
  let indent = 0;
  while (indent < 4 && isSpace(line, at + indent)) indent++;
  if (indent > 3) return null;
  const start = at + indent;
  const char = line[start];
  if (char !== "`" && char !== "~") return null;
  let end = start;
  while (line[end] === char) end++;
  return end - start >= 3 ? { char, length: end - start, end } : null;
}
function codeRanges(src) {
  const ranges = [];
  const runs = [];
  let item = null;
  let pos = 0;
  while (pos < src.length) {
    const eol = src.indexOf("\n", pos);
    const lineEnd = eol === -1 ? src.length : eol;
    const line = src.slice(pos, lineEnd);
    const blank = line.trim() === "";
    let containers = [];
    let open = null;
    const read = readContainers(line);
    if (read.containers.length > 0) {
      containers = read.containers;
      open = fenceAt(line, read.at);
      item = containers.some((c) => c !== QUOTE) ? containers : null;
    } else if (!blank) {
      if (item) {
        let inside = insideContainersAt(line, item, false);
        if (inside.at === -1 && inside.matched > 0) {
          item = item.slice(0, inside.matched);
          inside = { ...inside, at: inside.prefixAt };
        }
        if (inside.at === -1) {
          item = null;
        } else {
          const nested = readContainers(line, inside.at, inside.column, inside.carry);
          if (nested.containers.length > 0) {
            containers = [...item, ...nested.containers];
            open = fenceAt(line, nested.at);
            if (nested.containers.some((c) => c !== QUOTE)) item = containers;
          } else if (open = fenceAt(line, inside.at)) {
            containers = item;
          }
        }
      }
      if (!open) open = fenceAt(line, 0);
    }
    if (open) {
      const fence = open;
      let end = src.length;
      let p = lineEnd + 1;
      while (p < src.length) {
        const e = src.indexOf("\n", p);
        const le = e === -1 ? src.length : e;
        const next = src.slice(p, le);
        const at = insideContainers(next, containers, next.trim() === "");
        if (at === -1) {
          end = p - 1;
          break;
        }
        const close = fenceAt(next, at);
        if (close && close.char === fence.char && close.length >= fence.length && next.slice(close.end).trim() === "") {
          end = le;
          break;
        }
        p = le + 1;
      }
      ranges.push([pos, end]);
      pos = end + 1;
      continue;
    }
    for (let i = pos; i < lineEnd; i++) {
      if (src.charCodeAt(i) !== 96) continue;
      let j = i;
      while (j < lineEnd && src.charCodeAt(j) === 96) j++;
      runs.push([i, j - i]);
      i = j - 1;
    }
    pos = lineEnd + 1;
  }
  const nextSame = new Array(runs.length).fill(-1);
  const lastOfLength = /* @__PURE__ */ new Map();
  for (let k = runs.length - 1; k >= 0; k--) {
    nextSame[k] = lastOfLength.get(runs[k][1]) ?? -1;
    lastOfLength.set(runs[k][1], k);
  }
  for (let k = 0; k < runs.length; k++) {
    const close = nextSame[k];
    if (close === -1) continue;
    ranges.push([runs[k][0], runs[close][0] + runs[close][1]]);
    k = close;
  }
  return ranges.sort((a, b) => a[0] - b[0]);
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
  wrapRule(md.inline.ruler, "links", withPairedSource);
  wrapRule(md.inline.ruler, "autolink", withOriginalSource);
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
  const entities = input.match(ENTITY_REGEX);
  const entityPlaceholders = [];
  if (entities && forApp) {
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
      return escaped(text, at) ? entity : `\u200B${indexOf.get(entity)}\u200B`;
    });
    const protect = (text) => {
      let out = "";
      let last2 = 0;
      for (const m of regexMatches(text, URL_RUN)) {
        const at = m.index ?? 0;
        out += swap(text.slice(last2, at)) + m[0];
        last2 = at + m[0].length;
      }
      return out + swap(text.slice(last2));
    };
    let protectedInput = "";
    let last = 0;
    for (const [start, end] of codeRanges(input)) {
      if (start < last) continue;
      protectedInput += protect(input.slice(last, start)) + input.slice(start, end);
      last = end;
    }
    input = protectedInput + protect(input.slice(last));
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
  if (forApp && output && entityPlaceholders.length > 0) {
    const placeholderRe = /\u200B(0|[1-9]\d*)\u200B/g;
    let restored = "";
    let last = 0;
    let match;
    while ((match = placeholderRe.exec(output)) !== null) {
      const entity = entityPlaceholders[+match[1]];
      if (entity === void 0) {
        placeholderRe.lastIndex = match.index + 1;
        continue;
      }
      restored += output.slice(last, match.index) + entity;
      last = placeholderRe.lastIndex;
    }
    output = restored + output.slice(last);
  }
  output = stripDocumentWrapper(output);
  return sanitizeHtml(output, { ...renderOptions, renderNonce: nonce });
}

export { markdownToHTML, stripDocumentWrapper };
//# sourceMappingURL=chunk-6W573T3G.js.map
//# sourceMappingURL=chunk-6W573T3G.js.map