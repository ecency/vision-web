import { cleanReply } from './chunk-RM7HKPKJ.js';
import { MAX_PROXIED_URL_LENGTH, proxifyImageSrc, getProxyBase } from './chunk-6323QD2U.js';
import { regexMatches } from './chunk-SH6RGNOF.js';
import { entryMemoGet, MEMO_MISS, entryMemoSet } from './chunk-2SC5I7QY.js';
import { decodeImageSrc, makeEntryCacheKey, internalizeLeoLinks, hasAmpSentinel, decodeDomImageSrc, decodeEntities, stripHtmlTags, plainDestination, withoutLoneSurrogates, unescapeDestination, imageUrlEnd, decodeCompleteReferences, decodeAttributeEntities, rawBodySource } from './chunk-EHL62ZCR.js';
import { decodeHTMLStrict } from 'entities';

var BACKTICK_FENCE_RE = /```[\s\S]*?```/g;
var TILDE_FENCE_RE = /~~~[\s\S]*?~~~/g;
var INLINE_CODE_RE = /`[^`\n]*`/g;
var OPEN_TAG_NAME_END = /[\t\f\r />]/;
var CLOSE_TAG_NAME_END = /[\s>]/;
function isWholeTagName(lower, idx, end) {
  const next = lower[idx];
  return next === void 0 || end.test(next);
}
function findTag(lower, tag, from, end) {
  let at = lower.indexOf(tag, from);
  while (at !== -1 && !isWholeTagName(lower, at + tag.length, end)) {
    at = lower.indexOf(tag, at + tag.length);
  }
  return at;
}
function findOpenTagEnd(lower, openAt, budget) {
  let quote = "";
  for (let i = openAt + 1; i < lower.length; i++) {
    if (budget && --budget.left < 0) return -1;
    const c = lower[i];
    if (c === "\n") return NaN;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return lower[i - 1] === "/" ? NaN : i;
    }
  }
  return -1;
}
var HTML_BLOCK_TAGS = /* @__PURE__ */ new Set([
  "article",
  "aside",
  "button",
  "blockquote",
  "body",
  "canvas",
  "caption",
  "col",
  "colgroup",
  "dd",
  "div",
  "dl",
  "dt",
  "embed",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "iframe",
  "li",
  "map",
  "object",
  "ol",
  "output",
  "p",
  "pre",
  "progress",
  "script",
  "section",
  "style",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "tr",
  "thead",
  "ul",
  "video"
]);
var HTML_BLOCK_LINE_RE = /^ {0,3}<(?:[!?]|([a-z]{1,15})[\s/>]|\/([a-z]{1,15})[\s>])/;
var BLOCKQUOTE_PREFIX_RE = /^ {0,3}> ?/;
var LIST_PREFIX_RE = /^(?:[-*+]|\d{1,9}[.)]) +/;
function markLines(lower) {
  const block = new Uint8Array(lower.length);
  const code = new Uint8Array(lower.length);
  let inBlock = false;
  let listIndent = 0;
  let nestedItem = false;
  let lineStart = 0;
  while (lineStart <= lower.length) {
    let lineEnd = lower.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = lower.length;
    let line = lower.slice(lineStart, lineEnd);
    if (inBlock) {
      if (line.trim() === "") {
        inBlock = false;
        listIndent = 0;
        nestedItem = false;
      } else {
        block.fill(1, lineStart, lineEnd);
      }
      lineStart = lineEnd + 1;
      continue;
    }
    let stripped = 0;
    let sawList = false;
    let lastWasList = false;
    let inlineRemainder = false;
    for (; ; ) {
      const bq = BLOCKQUOTE_PREFIX_RE.exec(line);
      if (bq) {
        line = line.slice(bq[0].length);
        stripped += bq[0].length;
        lastWasList = false;
        inlineRemainder = false;
        continue;
      }
      const lm = LIST_PREFIX_RE.exec(line);
      if (lm) {
        line = line.slice(lm[0].length);
        stripped += lm[0].length;
        if (lastWasList) inlineRemainder = true;
        sawList = true;
        lastWasList = true;
        continue;
      }
      break;
    }
    if (sawList) {
      listIndent = stripped;
      nestedItem = inlineRemainder;
    } else if (listIndent > 0 && line.trim() !== "") {
      let indent = 0;
      while (indent < listIndent && line[indent] === " ") indent++;
      if (indent >= Math.min(listIndent, 2)) {
        line = line.slice(indent);
        inlineRemainder = nestedItem;
      } else {
        listIndent = 0;
        nestedItem = false;
      }
    }
    const blank = line.trim() === "";
    if (blank) {
      inBlock = false;
      listIndent = 0;
      nestedItem = false;
    } else if (inlineRemainder) {
      inBlock = false;
    } else if (!inBlock && /^(?: {4}|\t)/.test(line)) {
      code.fill(1, lineStart, lineEnd);
    } else if (!inBlock) {
      const m = HTML_BLOCK_LINE_RE.exec(line);
      if (m) {
        const tag = m[1] ?? m[2];
        inBlock = tag === void 0 || HTML_BLOCK_TAGS.has(tag);
      }
    }
    if (inBlock && !blank) block.fill(1, lineStart, lineEnd);
    lineStart = lineEnd + 1;
  }
  return { block, code };
}
var blankChars = (s) => s.replace(/[^\n]/g, " ");
function blankMatches(text, re) {
  return text.replace(re, blankChars);
}
function blankSpans(input, open, close, tagNames, blockMask) {
  const { text, lower } = input;
  const findOpen = (from2) => {
    if (!tagNames) return lower.indexOf(open, from2);
    let at = findTag(lower, open, from2, OPEN_TAG_NAME_END);
    while (at !== -1 && (Number.isNaN(findOpenTagEnd(lower, at)) || blockMask !== null && !blockMask[at])) {
      at = findTag(lower, open, at + open.length, OPEN_TAG_NAME_END);
    }
    return at;
  };
  const findClose = (from2) => tagNames ? findTag(lower, close, from2, CLOSE_TAG_NAME_END) : lower.indexOf(close, from2);
  let start = findOpen(0);
  if (start === -1) return input;
  const textParts = [];
  const lowerParts = [];
  let from = 0;
  while (start !== -1) {
    const end = findClose(start + open.length);
    let to;
    if (end === -1) {
      to = text.length;
    } else if (tagNames) {
      const gt = lower.indexOf(">", end + close.length);
      to = gt === -1 ? text.length : gt + 1;
    } else {
      to = end + close.length;
    }
    const blanked = blankChars(lower.slice(start, to));
    textParts.push(text.slice(from, start), blanked);
    lowerParts.push(lower.slice(from, start), blanked);
    from = to;
    start = to >= text.length ? -1 : findOpen(to);
  }
  textParts.push(text.slice(from));
  lowerParts.push(lower.slice(from));
  return { text: textParts.join(""), lower: lowerParts.join("") };
}
function blankMasked(input, mask) {
  let text = "";
  let lower = "";
  let from = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    let j = i;
    while (j < mask.length && mask[j]) j++;
    text += input.text.slice(from, i) + blankChars(input.text.slice(i, j));
    lower += input.lower.slice(from, i) + blankChars(input.lower.slice(i, j));
    from = j;
    i = j;
  }
  if (from === 0) return input;
  return { text: text + input.text.slice(from), lower: lower + input.lower.slice(from) };
}
function stripHiddenRegions(text) {
  let spellings = { text, lower: asciiLower(text) };
  const { block: blockMask, code: codeMask } = markLines(spellings.lower);
  spellings = blankMasked(spellings, codeMask);
  spellings = blankSpans(spellings, "<!--", "-->", false, null);
  spellings = blankSpans(spellings, "<style", "</style", true, null);
  spellings = blankSpans(spellings, "<script", "<\/script", true, null);
  spellings = blankSpans(spellings, "<pre", "</pre", true, blockMask);
  spellings = blankSpans(spellings, "<code", "</code", true, blockMask);
  return spellings.text;
}
var MD_IMAGE_RE = /!\[(?:[^[\]\n\\]|\\[^\n]|\\(?=\n)|\n(?! *\n)|\[(?:[^[\]\n\\]|\\[^\n]|\\(?=\n)|\n(?! *\n)|\[(?:[^[\]\n\\]|\\[^\n]|\\(?=\n)|\n(?! *\n))*\])*\])*\]\( *(?:\n *)?(?:<((?:[^<>\n\\]|\\[^\n]){1,2048})>|((?:[^)\\\u0000-\u0020\u007f]|\\[\s\S]){1,2048}))(?:(?= |\n) *(?:\n *)?(?:"(?:[^"\n]|\n(?! *\n))*"|'(?:[^'\n]|\n(?! *\n))*'))? *(?:\n *)?\)/;
function escapedAt(text, pos) {
  let k = pos - 1;
  while (k >= 0 && text.charCodeAt(k) === 92) k--;
  return (pos - 1 - k) % 2 === 1;
}
var STRAY_PCT_RE = /%(?![\da-f]{2})/i;
function angleAsPlain(raw, ampEscapes) {
  return plainDestination(withoutLoneSurrogates(unescapeDestination(raw, ampEscapes)));
}
var PARSER_REWRITTEN_RE = /[\u00a0\t\r\u2424\u2028\u0085]/;
var PARSER_NEWLINES_RE = /\r[\n\u0085]|[\u2424\u2028\u0085]/g;
function parserInput(raw) {
  const body = internalizeLeoLinks(cleanReply(raw));
  if (!PARSER_REWRITTEN_RE.test(body)) return body;
  let str = body.replace(/\u00a0/g, " ").replace(PARSER_NEWLINES_RE, "\n");
  if (str.indexOf("	") >= 0) {
    let lineStart = 0;
    let lastTabPos = 0;
    const source = str;
    str = source.replace(/[\n\t]/g, (match, offset) => {
      if (source.charCodeAt(offset) === 10) {
        lineStart = offset + 1;
        lastTabPos = 0;
        return match;
      }
      const spaces = "    ".slice((offset - lineStart - lastTabPos) % 4);
      lastTabPos = offset - lineStart + 1;
      return spaces;
    });
  }
  return str;
}
var BLOCK_START_LINE_RE = /\n *(?:#{1,6}(?=[ \n]|$)|>|[-*+](?=[ \n]|$)|\d+[.)](?=[ \n]|$)|`{3,}|~{3,}|<[!?]|(?:[-*_] *){3,}(?=\n|$)|=+ *(?=\n|$)|[-:][-:| ]*(?=\n|$)|[:~] |\[\^[^\]\n]*\]:|\|)/;
var HTML_LINE_TAG_RE = /\n {0,3}<\/?([A-Za-z][A-Za-z0-9-]*)/g;
function opensBlockInside(text) {
  if (BLOCK_START_LINE_RE.test(text)) return true;
  for (const m of regexMatches(text, HTML_LINE_TAG_RE)) {
    if (HTML_BLOCK_TAGS.has(m[1].toLowerCase())) return true;
  }
  return false;
}
var MD_IMAGE_PRESENT_RE = /!\[[^[\]]*(?:\]\(\s*[^\s)]|\[)/g;
function firstUnescapedImage(text, re) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!escapedAt(text, m.index) || escapedLabelHoldsUrl(m[0])) return m;
    re.lastIndex = m.index + 2;
  }
  return null;
}
function escapedLabelHoldsUrl(match) {
  const close = match.lastIndexOf("](");
  return match.slice(0, close === -1 ? match.length : close).includes("://");
}
var MD_IMAGE_RE_G = new RegExp(MD_IMAGE_RE.source, "g");
var MD_IMAGE_HEAD_RE = new RegExp(MD_IMAGE_RE.source.slice(0, MD_IMAGE_RE.source.indexOf("\\]\\(") + 4), "y");
function knownLabelCloses(cleaned) {
  const closes = /* @__PURE__ */ new Set();
  const untrusted = [];
  for (const m of regexMatches(cleaned, MD_IMAGE_RE_G)) {
    if (escapedAt(cleaned, m.index ?? 0)) continue;
    MD_IMAGE_HEAD_RE.lastIndex = m.index ?? 0;
    if (MD_IMAGE_HEAD_RE.exec(cleaned)) closes.add(MD_IMAGE_HEAD_RE.lastIndex - 2);
  }
  for (const m of regexMatches(cleaned, MD_LINK_RE)) {
    const open = m.index ?? 0;
    const close = open + 1 + m[1].length;
    if (escapedAt(cleaned, open) || escapedAt(cleaned, close)) continue;
    if (
      // The pattern is looser than the parser: a blank line ends the
      // paragraph, `[x][y](url)` is a reference link followed by text, an
      // angle destination must end the destination, and a `(` in a plain one
      // may be one the parser balances further on.
      /\n[ \t]*\n/.test(m[0]) || cleaned[open - 1] === "]" || /[<>]/.test(m[2]) && !/^<[^<>]*>$/.test(m[2]) || !m[2].startsWith("<") && m[2].includes("(")
    ) {
      untrusted.push([close + 2, open + m[0].length]);
      continue;
    }
    closes.add(close);
  }
  return { closes, untrusted };
}
function labelCloseBefore(text, idx) {
  let k = idx - 1;
  if (text[k] === "<") k--;
  while (k >= 0 && text[k] === " ") k--;
  if (text[k] === "\n") {
    k--;
    while (k >= 0 && text[k] === " ") k--;
  }
  return text[k] === "(" && text[k - 1] === "]" ? k - 1 : -1;
}
var DROPPED_IMAGE_RE = /!\[[^[\]\n\\`<>]*\]\((https?:\/\/[^\s()<>[\]\\`&"']+)\)/y;
function droppedImageEnd(text, pos) {
  DROPPED_IMAGE_RE.lastIndex = pos;
  const m = DROPPED_IMAGE_RE.exec(text);
  if (!m || m[1].length <= MAX_PROXIED_URL_LENGTH || m[1].startsWith(`${getProxyBase()}/`)) return -1;
  const url = m[1];
  if (url.includes("%")) {
    const escapes = url.match(PERCENT_ESCAPE_G)?.length ?? 0;
    if (url.length - 3 * escapes <= MAX_PROXIED_URL_LENGTH) return -1;
  }
  return DROPPED_IMAGE_RE.lastIndex;
}
var DROPPED_IMAGE_G = new RegExp(DROPPED_IMAGE_RE.source, "g");
var PERCENT_ESCAPE_G = /%[\da-f]{2}/gi;
function onlyDroppedBefore(text, pos) {
  return !text.slice(0, pos).replace(DROPPED_IMAGE_G, "").trim();
}
function hasUndecidedImage(text, seen) {
  const re = MD_IMAGE_PRESENT_RE;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (escapedAt(text, m.index) && !escapedLabelHoldsUrl(m[0])) {
      re.lastIndex = m.index + 2;
      continue;
    }
    const end = droppedImageEnd(text, m.index);
    if (end === -1) return true;
    seen.dropped = true;
    re.lastIndex = end;
  }
  return false;
}
var IMG_OPEN_RE = /<img\b/gi;
var ATTRIBUTE_NAME_RE = /[A-Za-z_:][\w.:-]*/y;
var ATTRIBUTE_VALUE_RE = /"([^"]*)"|'([^']*)'|[^\s"'=<>`]+/y;
var TAG_END_RE = /\/?>/y;
var BLOCK_START_CHARS = "-*_=#>+|<`~:[0123456789";
function tagBreaksParagraph(text, from, to, footnotes) {
  let multiline = false;
  for (let k = from; k < to; k++) {
    const c = text[k];
    if (c !== "\n" && !(c === "\r" && text[k + 1] !== "\n")) continue;
    multiline = true;
    let j = k + 1;
    while (j < to && (text[j] === " " || text[j] === "	")) j++;
    if (j >= to || text[j] === "\n" || text[j] === "\r" || BLOCK_START_CHARS.includes(text[j])) return true;
    k = j - 1;
  }
  if (!multiline) return false;
  if (footnotes) return true;
  let lineStart = from;
  while (lineStart > 0 && text[lineStart - 1] !== "\n" && text[lineStart - 1] !== "\r") lineStart--;
  return /[#|[]/.test(text.slice(lineStart, from));
}
var SPACE_CHARS = " 	\n\r\f";
function skipSpaces(text, i) {
  while (i < text.length && SPACE_CHARS.includes(text[i])) i++;
  return i;
}
function matchHtmlImage(text, marksOf) {
  const footnotes = text.includes("[^");
  IMG_OPEN_RE.lastIndex = 0;
  let m;
  let tagMarks = null;
  while ((m = IMG_OPEN_RE.exec(text)) !== null) {
    const start = m.index;
    tagMarks ?? (tagMarks = marksOf());
    if (tagMarks[start] === 1) return { index: start, src: "", dashed: false, undecided: true };
    let i = start + 4;
    let found = null;
    let srcSeen = false;
    for (; ; ) {
      const spaced = skipSpaces(text, i);
      TAG_END_RE.lastIndex = spaced;
      if (TAG_END_RE.exec(text)) {
        i = TAG_END_RE.lastIndex;
        break;
      }
      ATTRIBUTE_NAME_RE.lastIndex = spaced;
      const named = spaced > i ? ATTRIBUTE_NAME_RE.exec(text) : null;
      if (!named) return null;
      i = ATTRIBUTE_NAME_RE.lastIndex;
      let value;
      const eq = skipSpaces(text, i);
      if (text[eq] === "=") {
        ATTRIBUTE_VALUE_RE.lastIndex = skipSpaces(text, eq + 1);
        const v = ATTRIBUTE_VALUE_RE.exec(text);
        if (v) {
          i = ATTRIBUTE_VALUE_RE.lastIndex;
          value = v[1] ?? v[2];
        }
      }
      const name = asciiLower(named[0]);
      if (name === "src") {
        if (!srcSeen && !found && value) found = { index: start, src: value, dashed: false };
        srcSeen = true;
      } else if (!found && !srcSeen && value && name.endsWith("src") && /\W/.test(name[name.length - 4])) {
        found = { index: start, src: value, dashed: true };
      }
    }
    if (tagBreaksParagraph(text, start, i, footnotes)) return null;
    if (found) return found;
    IMG_OPEN_RE.lastIndex = i;
  }
  return null;
}
var URL_TOKEN_RE = /https?:\/\/(?:[^\s<>"'()[\]&]|&(?!lt;|gt;))+/gi;
var YOUTUBE_ID_RE = /^[^"&?/\s]{11}$/;
function imageToken(token) {
  const end = imageUrlEnd(token);
  if (end === -1) return null;
  const url = token.slice(0, end);
  return SAFE_URL_RE.test(url) ? url : null;
}
function youtubeIdOf(url) {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const isShort = host === "youtu.be";
  const isFull = host === "youtube.com" || host.endsWith(".youtube.com");
  if (!isShort && !isFull) return null;
  const rest = url.slice(m[0].length);
  const hashAt = rest.indexOf("#");
  const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt);
  const qAt = beforeHash.indexOf("?");
  const path = qAt === -1 ? beforeHash : beforeHash.slice(0, qAt);
  const query = qAt === -1 ? "" : beforeHash.slice(qAt + 1);
  const candidate = (value) => {
    const id = value === void 0 ? "" : value.slice(0, 11);
    return YOUTUBE_ID_RE.test(id) ? id : null;
  };
  if (isFull && query) {
    for (const part of query.split("&")) {
      if (part.startsWith("v=")) {
        const id = candidate(part.slice(2));
        if (id) return id;
      }
    }
  }
  const segments = path.split("/").filter((seg) => seg.length > 0);
  if (isShort) return candidate(segments[0]);
  if (segments.length >= 2 && ["v", "e", "embed", "shorts"].includes(segments[0].toLowerCase())) {
    return candidate(segments[1]);
  }
  if (segments.length >= 3) return candidate(segments[segments.length - 1]);
  return null;
}
function isAutolinkAt(text, idx) {
  return /^https?:\/\//i.test(text.slice(idx, idx + 8));
}
function markInsideTags(text) {
  const marks = new Uint8Array(text.length);
  let inTag = false;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inTag) {
      if (c === "<" && i + 1 < text.length && /[A-Za-z/!?]/.test(text[i + 1]) && !isAutolinkAt(text, i + 1)) {
        inTag = true;
        marks[i] = 2;
      }
      continue;
    }
    marks[i] = 1;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      inTag = false;
    }
  }
  return marks;
}
function isStandalone(scan, idx) {
  if (scan.inTag[idx]) return false;
  if (idx === 0) return true;
  const text = scan.text;
  const prev = text[idx - 1];
  if (/[\w/.:%?&=#[-]/.test(prev)) return false;
  const prev2 = idx > 1 ? text[idx - 2] : "";
  if (prev === "(" && prev2 === "]") return false;
  return true;
}
function* standaloneMatches(scan, classify) {
  for (const m of regexMatches(scan.text, URL_TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (!isStandalone(scan, idx)) continue;
    const value = classify(m[0]);
    if (value !== null) yield { url: value, pos: idx };
  }
}
var HREF_ATTR_RE = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
function hasGluedAttribute(tag) {
  let quote = "";
  for (let i = 0; i < tag.length; i++) {
    const c = tag[i];
    if (quote) {
      if (c === quote) {
        quote = "";
        const next = tag[i + 1];
        if (next !== void 0 && /[A-Za-z]/.test(next)) return true;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    }
  }
  return false;
}
var MD_LINK_RE = /\[([^[\]]*)\]\(\s*([^)\s[]+)(?:\s+["'][^"']*["'])?\s*\)/g;
var SAFE_URL_RE = /^https?:\/\//i;
var IMG_EXT_RE = /\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/i;
var isImageHref = (href) => SAFE_URL_RE.test(href) && IMG_EXT_RE.test(href) && imageUrlEnd(href) !== -1;
function promotesToImage(label, href) {
  const deAmp = (value) => value.replace(/&amp;/g, "&");
  const serialized = decodeCompleteReferences(label.trim()).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return deAmp(decodeCompleteReferences(href.trim())) === deAmp(serialized);
}
var CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
var AUTOLINK_ALNUM = /[\p{L}\p{Nd}\p{M}]/u;
var AUTOLINK_EMOJI = /[\u2700-\u27bf\udde6-\uddff\ud800-\udbff\udc00-\udfff\ufe0e\ufe0f\u0300-\u036f\ufe20-\ufe23\u20d0-\u20f0\ud83c\udffb-\udfff\u200d\u3299\u3297\u303d\u3030\u24c2\ud83c\udd70-\udd71\udd7e-\udd7f\udd8e\udd91-\udd9a\udde6-\uddff\ude01-\ude02\ude1a\ude2f\ude32-\ude3a\ude50-\ude51\u203c\u2049\u25aa-\u25ab\u25b6\u25c0\u25fb-\u25fe\u00a9\u00ae\u2122\u2139\udc04\u2600-\u26FF\u2b05\u2b06\u2b07\u2b1b\u2b1c\u2b50\u2b55\u231a\u231b\u2328\u23cf\u23e9-\u23f3\u23f8-\u23fa\udccf\u2935\u2934\u2190-\u21ff]/;
var AUTOLINK_PUNCT = "-+&@#/%=~_()|'$*[]{}?!:,.;^\u2713";
var AUTOLINK_END = "-+&@#/%=~_()|'$*[]{}\u2713";
var autolinkWordChar = (c) => AUTOLINK_ALNUM.test(c) || AUTOLINK_EMOJI.test(c);
var AUTOLINK_CLOSE = { ")": "(", "]": "[", "}": "{" };
function autolinkUrlEnd(text) {
  const scheme = /^https?:\/\//i.exec(text);
  if (!scheme) return 0;
  const hostStart = scheme[0].length;
  let end = hostStart;
  let pos = hostStart;
  while (pos < text.length && autolinkWordChar(text[pos])) {
    let k = pos;
    let lastWord = pos;
    while (k < text.length && (autolinkWordChar(text[k]) || text[k] === "-" || text[k] === "_")) {
      if (autolinkWordChar(text[k])) lastWord = k;
      k++;
    }
    end = lastWord + 1;
    if (text[end] !== "." || !autolinkWordChar(text[end + 1] ?? "")) break;
    pos = end + 1;
  }
  if (end === hostStart) return 0;
  const port = /^:[0-9]+/.exec(text.slice(end));
  if (port) end += port[0].length;
  if (end < text.length && "/?#".includes(text[end])) {
    let last = end + 1;
    for (let i = end + 1; i < text.length; i++) {
      const c = text[i];
      const word = autolinkWordChar(c);
      if (!word && !AUTOLINK_PUNCT.includes(c)) break;
      if (word || AUTOLINK_END.includes(c)) last = i + 1;
    }
    end = last;
  }
  if (text[end - 1] === "?") end--;
  const open = AUTOLINK_CLOSE[text[end - 1]];
  if (open) {
    let depth = 0;
    for (let i = 0; i < end - 1; i++) {
      if (text[i] === open) depth++;
      else if (text[i] === text[end - 1]) depth = Math.max(depth - 1, 0);
    }
    if (depth === 0) return end - 1;
  }
  let tld = -1;
  let dotOk = false;
  for (let i = hostStart; i < end; i++) {
    const c = text[i];
    if (c === ".") {
      dotOk = i > hostStart && text[i - 1] !== ".";
    } else if (c === "-" || autolinkWordChar(c)) {
      if (dotOk) tld = i + 1;
    } else {
      break;
    }
  }
  if (tld !== -1 && tld < end && !/[-.A-Za-z0-9:/?#]/.test(text[tld])) return tld;
  return end;
}
function withoutTrailingPunctuation(url, after) {
  if (after.startsWith(")") || /^<\/a[\s>]/i.test(after)) return url;
  let end = url.length;
  while (end > 0) {
    const c = url[end - 1];
    if (c === ";" && /&#?[a-z\d]+$/i.test(url.slice(Math.max(0, end - 34), end - 1))) break;
    if (!".,;:!?".includes(c)) break;
    end--;
  }
  return url.slice(0, end);
}
var HTML_TEXT_URL_RE = /^https?:\/\/(?:[^\s<>"'&]|&(?!lt;|gt;))+/i;
function decodeHtmlText(text) {
  return text.replace(/&(?:#\d{1,7};?|#[xX][\da-fA-F]{1,6};?|([A-Za-z][A-Za-z\d]{0,31});?)/g, (ref, name) => {
    if (name === void 0) return decodeEntities(ref);
    const whole = decodeHTMLStrict(`&${name};`);
    return whole === `&${name};` ? ref : whole;
  });
}
var asciiLower = (text) => text.replace(/[A-Z]+/g, (run) => run.toLowerCase());
function htmlTextImageUrl(body, pos) {
  let end = pos;
  while (end < body.length && !/[\s<]/.test(body[end])) end++;
  const token = HTML_TEXT_URL_RE.exec(decodeHtmlText(body.slice(pos, end)))?.[0];
  if (!token) return null;
  const urlEnd = imageUrlEnd(token);
  return urlEnd === -1 ? null : token.slice(0, urlEnd);
}
function firstBodyImageRawUrl(raw) {
  const body = parserInput(raw);
  return bodyImageRawUrl(body, prepareBody(body));
}
function markdownTextSpan(body, pos) {
  let end = pos;
  while (end < body.length && !/[\s<[]/.test(body[end])) end++;
  return body.slice(pos, end);
}
function loneSurrogateAt(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 55296 && c <= 56319) {
      const next = text.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) {
        i++;
        continue;
      }
      return i;
    }
    if (c >= 56320 && c <= 57343) return i;
  }
  return -1;
}
function definitionDestinationAt(body, pos) {
  let k = pos - 1;
  const skipBlanks = () => {
    while (k >= 0 && (body[k] === " " || body[k] === "	")) k--;
  };
  skipBlanks();
  if (body[k] === "\n") {
    k--;
    skipBlanks();
  }
  return k >= 1 && body[k] === ":" && body[k - 1] === "]";
}
function strayHashBefore(body, pos) {
  const line = decodeCompleteReferences(body.slice(body.lastIndexOf("\n", pos - 1) + 1, pos).replace(/^ {0,3}#{1,6}(?=[ \t])/, ""));
  for (let i = line.indexOf("#"); i !== -1; i = line.indexOf("#", i + 1)) {
    const prev = line[i - 1];
    const next = line[i + 1];
    if (prev !== void 0 && autolinkWordChar(prev)) continue;
    if (next !== void 0 && (autolinkWordChar(next) || next === "_")) continue;
    return true;
  }
  return false;
}
function bodyImageRawUrl(body, prepared) {
  const candidate = findFirstImageCandidate(prepared).candidate;
  if (!candidate) return null;
  const poster = findFirstVideoPoster(prepared);
  if (poster && poster.pos < candidate.pos) return null;
  const source = candidateSource(body, candidate);
  if (source === null) return null;
  const url = decodeDomImageSrc(source);
  if (url.length > MAX_PROXIED_URL_LENGTH) return null;
  if (onProxy(source.trim()) && url !== source.trim()) return null;
  return candidate.destination && CONTROL_CHAR_RE.test(url) ? null : url;
}
function candidateSource(body, candidate) {
  if (candidate.html) return decodeAttributeEntities(candidate.url);
  const ampEscapes = !hasAmpSentinel(body);
  if (candidate.destination) return rawBodySource(candidate.url, true, ampEscapes);
  if (markLines(asciiLower(codeBlanked(body))).block[candidate.pos]) return htmlTextImageUrl(body, candidate.pos);
  const after = body.slice(candidate.pos + candidate.url.length, candidate.pos + candidate.url.length + 4);
  if (after.startsWith(";") && /&#?[a-z\d]+$/i.test(candidate.url)) return null;
  const loneAt = loneSurrogateAt(candidate.url);
  const token = loneAt === -1 ? candidate.url : candidate.url.slice(0, loneAt);
  const tokenUrl = () => {
    const url2 = withoutTrailingPunctuation(token, loneAt === -1 ? after : "");
    return imageUrlEnd(url2) === -1 ? null : rawBodySource(url2, false, ampEscapes);
  };
  if (body[candidate.pos - 1] === "<" && after.startsWith(">")) {
    return loneAt !== -1 || token.includes("&") ? null : token;
  }
  if (/^<\/a[\s>]/i.test(after) || definitionDestinationAt(body, candidate.pos)) return tokenUrl();
  const raw = markdownTextSpan(body, candidate.pos);
  let span = decodeCompleteReferences(raw.replace(/\\&/g, "&amp;"));
  span = withoutLoneSurrogates(span);
  let k = candidate.pos - 1;
  while (k >= 0 && (body[k] === " " || body[k] === "	")) k--;
  const before = k < 0 ? "\n" : body[k];
  const plain = (k === candidate.pos - 1 ? before === "\n" || before === "(" : before !== "@") && !strayHashBefore(body, candidate.pos);
  if (!/[()]/.test(span) || /[*~_|^]|==|\+\+/.test(span) || !plain) return tokenUrl();
  const url = span.slice(0, autolinkUrlEnd(span));
  return imageUrlEnd(url) === -1 ? null : url;
}
function codeBlanked(body) {
  return blankMatches(blankMatches(blankMatches(body, BACKTICK_FENCE_RE), TILDE_FENCE_RE), INLINE_CODE_RE);
}
function stripCodeRegions(body) {
  let text = blankMatches(body, BACKTICK_FENCE_RE);
  text = blankMatches(text, TILDE_FENCE_RE);
  text = blankMatches(text, INLINE_CODE_RE);
  return stripHiddenRegions(text);
}
function blankUnequalAnchors(cleaned, textContent) {
  const lower = asciiLower(cleaned);
  const budget = { left: cleaned.length * 4 + 1024 };
  const parts = [];
  let from = 0;
  let at = findTag(lower, "<a", 0, OPEN_TAG_NAME_END);
  while (at !== -1) {
    const gt = findOpenTagEnd(lower, at, budget);
    if (Number.isNaN(gt) || gt === -1 || hasGluedAttribute(cleaned.slice(at, gt))) {
      at = findTag(lower, "<a", at + 2, OPEN_TAG_NAME_END);
      continue;
    }
    const closeAt = findTag(lower, "</a", gt + 1, CLOSE_TAG_NAME_END);
    const innerEnd = closeAt === -1 ? cleaned.length : closeAt;
    let spanEnd = cleaned.length;
    if (closeAt !== -1) {
      const closeGt = lower.indexOf(">", closeAt + 3);
      spanEnd = closeGt === -1 ? cleaned.length : closeGt + 1;
    }
    const hrefMatch = HREF_ATTR_RE.exec(cleaned.slice(at, gt));
    const href = hrefMatch ? hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "" : "";
    const inner = cleaned.slice(gt + 1, innerEnd);
    let text;
    if (textContent) {
      text = stripHtmlTags(inner);
    } else {
      const firstTag = inner.search(/<[A-Za-z/!]/);
      text = firstTag === -1 ? inner : inner.slice(0, firstTag);
    }
    if (!href || decodeEntities(text.trim()) !== decodeEntities(href.trim())) {
      parts.push(cleaned.slice(from, at), blankChars(cleaned.slice(at, spanEnd)));
      from = spanEnd;
    }
    at = spanEnd >= cleaned.length ? -1 : findTag(lower, "<a", spanEnd, OPEN_TAG_NAME_END);
  }
  if (parts.length === 0) return cleaned;
  parts.push(cleaned.slice(from));
  return parts.join("");
}
var EMPTY_SCAN = { text: "", inTag: new Uint8Array(0) };
function prepareBody(body) {
  const cleaned = body ? stripCodeRegions(body) : "";
  if (!cleaned) return { source: body, cleaned, image: EMPTY_SCAN, video: EMPTY_SCAN };
  const imageText = blankUnequalAnchors(cleaned, false);
  const videoText = blankUnequalAnchors(cleaned, true);
  return {
    source: body,
    cleaned,
    image: { text: imageText, inTag: markInsideTags(imageText) },
    video: { text: videoText, inTag: markInsideTags(videoText) }
  };
}
function findFirstVideoPoster(prepared) {
  const { cleaned } = prepared;
  if (!cleaned) return null;
  let best = null;
  for (const hit of standaloneMatches(prepared.video, youtubeIdOf)) {
    best = { url: hit.url, pos: hit.pos };
    break;
  }
  for (const m of regexMatches(cleaned, MD_LINK_RE)) {
    const idx = m.index ?? 0;
    if (idx > 0 && cleaned[idx - 1] === "!") continue;
    if (best && idx >= best.pos) break;
    const href = m[2];
    if (href && m[1].trim() === href) {
      const id = youtubeIdOf(href);
      if (id) {
        best = { url: id, pos: idx };
        break;
      }
    }
  }
  if (!best) return null;
  return {
    url: `https://img.youtube.com/vi/${best.url.split("?")[0]}/hqdefault.jpg`,
    pos: best.pos,
    uncertain: !posterShown(prepared, best.pos)
  };
}
function posterShown(prepared, pos) {
  const token = /^https?:\/\/[^\s<>"'`]+/i.exec(prepared.source.slice(pos, pos + 2100));
  const candidate = token ? { url: token[0], pos } : { url: "", pos};
  const { cleaned, source } = prepared;
  if (token && labelCloseBefore(cleaned, pos) !== -1) return false;
  let lineEnd = source.indexOf("\n", pos);
  if (lineEnd === -1) lineEnd = source.length;
  if (markLines(asciiLower(codeBlanked(source))).block[pos] && /!\[|<img\b/i.test(source.slice(pos, lineEnd))) return false;
  return bareShown(prepared, candidate) && !unreadBefore(prepared, knownLabelCloses(cleaned).closes, pos);
}
var LOOSE_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
var HIDING_TAG_RE = /<(\/?)(iframe|head|script|style|textarea|title|noscript|template|object|svg|select)\b/g;
var FENCE_LINE_RE = /^[ \t>*+\-\d.)]*(`{3,}|~{3,})/;
var SPACES_RE = /^ *$/;
function nextFenceState(state, line) {
  if (state === "unknown") return state;
  const m = FENCE_LINE_RE.exec(line);
  if (!m) return state;
  const prefix = m[0].slice(0, -m[1].length);
  if (state === null) {
    if (line.slice(m[0].length).includes("`")) return "unknown";
    return { run: m[1], prefix };
  }
  if (m[1][0] !== state.run[0] || m[1].length < state.run.length || line.slice(m[0].length).trim()) return state;
  if (prefix === state.prefix) return null;
  if (!state.prefix && SPACES_RE.test(prefix)) return prefix.length <= 3 ? null : state;
  return "unknown";
}
function fenceOpen(source, pos) {
  const eol = source.indexOf("\n", pos);
  let state = null;
  for (const line of source.slice(0, eol === -1 ? source.length : eol).split("\n")) state = nextFenceState(state, line);
  return state !== null;
}
function unreadBefore(prepared, closes, pos) {
  const { source, cleaned } = prepared;
  const scan = prepared.image;
  const prefix = cleaned.slice(0, pos);
  const lowerPrefix = asciiLower(prefix);
  if (/<img\b/.test(lowerPrefix)) return true;
  if (fenceOpen(source, pos)) return true;
  let open = 0;
  for (const m of regexMatches(lowerPrefix, HIDING_TAG_RE)) open += m[1] ? -1 : 1;
  if (open > 0) return true;
  if (lowerPrefix.lastIndexOf("<?") > lowerPrefix.lastIndexOf("?>")) return true;
  const lastAnchorClose = lowerPrefix.lastIndexOf("</a");
  const nested = nestedAnchors(lowerPrefix);
  let tagMarks = null;
  let tagOpen = null;
  for (const m of regexMatches(source, LOOSE_URL_RE)) {
    const idx = m.index ?? 0;
    if (idx >= pos) break;
    if (imageUrlEnd(m[0]) === -1) continue;
    if (scan.text.slice(idx, idx + 4).toLowerCase() !== "http" && cleaned.slice(idx, idx + 4).toLowerCase() === "http" && lastAnchorClose >= idx && !nested) {
      continue;
    }
    if (!tagMarks || !tagOpen) {
      tagMarks = markInsideTags(prefix);
      tagOpen = new Int32Array(prefix.length);
      let lt = -1;
      let nl = -1;
      for (let i = 0; i < prefix.length; i++) {
        if (prefix[i] === "<") lt = i;
        if (prefix[i] === "\n") nl = i;
        tagOpen[i] = lt > nl ? lt : -1;
      }
    }
    if (tagMarks[idx] && tagOpen[idx] !== -1) continue;
    const close = labelCloseBefore(cleaned, idx);
    if (close !== -1 && closes.has(close)) continue;
    return true;
  }
  return false;
}
function inTextContext(text) {
  if (text.includes("]:")) return true;
  let inDestination = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "]" && text[i + 1] === "(") {
      inDestination = true;
      i++;
    } else if (inDestination) {
      if (c === ")") inDestination = false;
      else if (/\s/.test(c) && /["'(]/.test(text[i + 1] ?? "")) return true;
    }
  }
  return inDestination;
}
function mdImageShown(prepared, pos) {
  if (prepared.image.inTag[pos]) return false;
  const text = prepared.cleaned;
  const blank = text.lastIndexOf("\n\n", pos);
  return !inTextContext(text.slice(blank === -1 ? 0 : blank, pos));
}
function inlineBacktick(source, from, to) {
  let state = null;
  let at = 0;
  for (const line of source.slice(0, to).split("\n")) {
    const before = state;
    state = nextFenceState(state, line);
    const lineStart = at;
    at += line.length + 1;
    if (lineStart < from) continue;
    if (before !== null || state !== null) continue;
    if (line.includes("`")) return true;
  }
  return false;
}
var URL_SYNTAX_RE = /[`|^]|\+\+|==|~~/;
function markdownBracketAt(source, at) {
  const head = source.slice(at, at + 2200);
  if (/^\[(?:[^[\]\n]|\[[^[\]\n]{0,100}\]){0,100}\]\([^\s()<>]*\)/.test(head)) return true;
  const m = /^\[([^[\]\n]{1,100})\](?:\[([^[\]\n]{0,100})\])?/.exec(head);
  if (!m) return false;
  const label = (m[2] ? m[2] : m[1]).trim();
  if (!label) return false;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const def = new RegExp(`(?:^|\\n[ \\t]*\\n)( {0,3}\\[${escaped}\\]:[ \\t]*\\S+[ \\t]*)(?:\\n|$)`, "i").exec(source);
  if (!def) return false;
  return !fenceOpen(source, def.index);
}
var rawTagMarks = /* @__PURE__ */ new WeakMap();
function rawTagsOf(prepared) {
  let marks = rawTagMarks.get(prepared);
  if (!marks) {
    marks = markInsideTags(prepared.cleaned);
    rawTagMarks.set(prepared, marks);
  }
  return marks;
}
function nestedAnchors(lower) {
  let depth = 0;
  for (const m of regexMatches(lower, /<(\/?)a\b/g)) {
    depth = m[1] ? Math.max(0, depth - 1) : depth + 1;
    if (depth > 1) return true;
  }
  return false;
}
function bareShown(prepared, candidate) {
  const { source, cleaned } = prepared;
  const pos = candidate.pos;
  if (prepared.image.inTag[pos] || rawTagsOf(prepared)[pos]) return false;
  let slashes = 0;
  while (source[pos - 1 - slashes] === "\\") slashes++;
  if (slashes % 2 === 1) return false;
  const blank = source.lastIndexOf("\n\n", pos);
  const paraStart = blank === -1 ? 0 : blank + 2;
  const para = source.slice(paraStart, pos);
  if (inTextContext(para)) return false;
  let depth = 0;
  for (let i = 0; i < para.length; i++) {
    const c = para[i];
    if (c === "\\") i++;
    else if (c === "[") depth++;
    else if (c === "]" && !prepared.image.inTag[paraStart + i]) depth = Math.max(0, depth - 1);
  }
  if (depth > 0) return false;
  if (inlineBacktick(source, paraStart, pos) || URL_SYNTAX_RE.test(candidate.url)) return false;
  if (source[pos - 1] === "<" && markLines(asciiLower(codeBlanked(source))).block[pos]) return false;
  const lowerPara = asciiLower(cleaned.slice(paraStart, pos));
  if (nestedAnchors(lowerPara)) return false;
  const lt = lowerPara.lastIndexOf("<a");
  if (lt !== -1 && /^<a\b/.test(lowerPara.slice(lt, lt + 3)) && lowerPara.slice(lt).includes("\n")) return false;
  const next = source[pos + candidate.url.length];
  if (next === "'") return false;
  if (next === "[" && !markdownBracketAt(source, pos + candidate.url.length)) return false;
  const closing = /^<\/([a-z][a-z\d]*)/i.exec(source.slice(pos + candidate.url.length, pos + candidate.url.length + 40));
  if (closing) {
    const lt2 = cleaned.lastIndexOf("<", pos);
    const opening = lt2 === -1 ? null : /^<([a-z][a-z\d]*)/i.exec(cleaned.slice(lt2, lt2 + 40));
    if (!opening || opening[1].toLowerCase() !== closing[1].toLowerCase()) return false;
  }
  if (next !== void 0 && "*_~".includes(next) && !para.includes(next)) return false;
  if (candidate.url.endsWith("\\")) return false;
  if (/&amp;(?:[a-z][a-z\d]*|#\d+|#x[\da-f]+);/i.test(candidate.url)) return false;
  const tag = cleaned.lastIndexOf("<", pos);
  if (decodeHtmlText(candidate.url) !== decodeCompleteReferences(candidate.url) && tag !== -1 && /^<a\b/i.test(cleaned.slice(tag, tag + 3))) {
    return false;
  }
  return true;
}
var NONE = { candidate: null, ambiguous: false };
var AMBIGUOUS = { candidate: null, ambiguous: true };
function findFirstImageCandidate(prepared) {
  const { cleaned } = prepared;
  if (!cleaned) return NONE;
  const mdMatch = firstUnescapedImage(cleaned, MD_IMAGE_RE_G);
  const htmlMatch = matchHtmlImage(cleaned, () => rawTagsOf(prepared));
  const mdUrl = mdMatch ? mdMatch[1] !== void 0 || mdMatch[2].includes("\\") ? angleAsPlain(mdMatch[1] ?? mdMatch[2], !hasAmpSentinel(cleaned)) : mdMatch[2] : void 0;
  if (mdMatch) {
    const url = mdUrl;
    if (!url || !SAFE_URL_RE.test(url) || mdMatch[1] === void 0 && url.includes("(") || opensBlockInside(mdMatch[0]) || // An escaped `!` before a link whose text holds a URL (#2181 review).
    escapedAt(cleaned, mdMatch.index) || // A backslash before whitespace escapes nothing in a plain destination.
    mdMatch[2] !== void 0 && /\\[\u0000-\u0020]/.test(mdMatch[2]) || // With a `%` that starts no escape, the render normalises the escaped
    // destination and decodes it once, which only the parser reads exactly
    // (#2179).
    mdMatch[2] !== void 0 && mdMatch[2].includes("\\") && STRAY_PCT_RE.test(mdMatch[2])) {
      return AMBIGUOUS;
    }
  }
  const priorRegion = mdMatch ? cleaned.slice(0, mdMatch.index ?? 0) : cleaned;
  const seen = { dropped: false };
  if (hasUndecidedImage(priorRegion, seen)) {
    return AMBIGUOUS;
  }
  const candidates = [];
  if (mdMatch && mdUrl) candidates.push({ url: mdUrl, pos: mdMatch.index ?? 0, destination: true, md: true });
  const dashSrc = !!htmlMatch && (htmlMatch.dashed || !!htmlMatch.undecided);
  if (dashSrc && !(mdMatch && mdUrl && (mdMatch.index ?? 0) < htmlMatch.index)) {
    return AMBIGUOUS;
  }
  if (htmlMatch && !dashSrc && SAFE_URL_RE.test(htmlMatch.src.trim())) {
    candidates.push({ url: htmlMatch.src, pos: htmlMatch.index, html: true });
  }
  const scan = prepared.image;
  const { closes, untrusted } = knownLabelCloses(cleaned);
  let undecidedAt = -1;
  let range = 0;
  for (const m of regexMatches(scan.text, URL_TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (scan.inTag[idx]) continue;
    const url = imageToken(m[0]);
    if (url === null) continue;
    while (range < untrusted.length && untrusted[range][1] <= idx) range++;
    if (range < untrusted.length && untrusted[range][0] <= idx) {
      undecidedAt = idx;
      break;
    }
    const close = labelCloseBefore(cleaned, idx);
    if (close !== -1) {
      if (closes.has(close)) continue;
      undecidedAt = idx;
      break;
    }
    if (!isStandalone(scan, idx) || !SAFE_URL_RE.test(url)) continue;
    candidates.push({ url, pos: idx });
    break;
  }
  for (const m of regexMatches(cleaned, MD_LINK_RE)) {
    const idx = m.index ?? 0;
    if (idx > 0 && cleaned[idx - 1] === "!") continue;
    const href = /^<[^<>]*>$/.test(m[2]) ? m[2].slice(1, -1) : m[2];
    if (href && isImageHref(href) && promotesToImage(m[1], href)) {
      candidates.push({ url: href, pos: idx, destination: true });
      break;
    }
  }
  if (undecidedAt !== -1 && candidates.every((c) => undecidedAt < c.pos)) {
    return AMBIGUOUS;
  }
  candidates.sort((a, b) => a.pos - b.pos);
  const first = candidates[0];
  if (seen.dropped && !(first?.md && onlyDroppedBefore(prepared.source, first.pos))) {
    return AMBIGUOUS;
  }
  if (!first) return NONE;
  if (unreadBefore(prepared, closes, first.pos)) return AMBIGUOUS;
  if (first.md && !mdImageShown(prepared, first.pos)) return AMBIGUOUS;
  if (!(first.html || first.md) && !bareShown(prepared, first)) return AMBIGUOUS;
  if (!(first.html || first.md)) {
    const lineEnd = prepared.cleaned.indexOf("\n", first.pos);
    const blockLine = markLines(asciiLower(codeBlanked(prepared.source))).block[first.pos];
    if (blockLine && candidates.some((c) => c !== first && (c.html || c.md) && (lineEnd === -1 || c.pos < lineEnd))) {
      return AMBIGUOUS;
    }
  }
  return { candidate: first, ambiguous: false };
}
function fastBodyImage(raw, width, height, format) {
  const body = parserInput(raw);
  const prepared = prepareBody(body);
  const found = findFirstImageCandidate(prepared);
  if (found.ambiguous) {
    return null;
  }
  const first = found.candidate;
  const poster = findFirstVideoPoster(prepared);
  if (poster && (!first || poster.pos < first.pos) && poster.uncertain) return null;
  if (first && (first.html || first.md) && !(poster && poster.pos < first.pos)) {
    const source2 = candidateSource(body, first);
    return source2 === null ? null : proxifySource(source2, width, height, format) || null;
  }
  if (first && !first.destination && loneSurrogateAt(first.url) !== -1 && !(poster && poster.pos < first.pos)) return null;
  if (poster && (!first || poster.pos < first.pos)) {
    return proxifySource(proxifyImageSrc(poster.url, 0, 0, "match"), width, height, format);
  }
  if (!first) return null;
  const source = candidateSource(body, first);
  return source === null ? null : proxifySource(source, width, height, format) || null;
}
function firstMetaUrl(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.find((url) => typeof url === "string" && url.trim().length > 0);
  }
  return void 0;
}
function metaFingerprint(jsonMetadata) {
  let meta;
  if (typeof jsonMetadata === "object") {
    meta = jsonMetadata;
  } else {
    try {
      meta = JSON.parse(jsonMetadata);
    } catch {
      meta = null;
    }
  }
  try {
    return JSON.stringify([meta?.thumbnails, meta?.image]);
  } catch {
    return {};
  }
}
function onProxy(src) {
  const base = getProxyBase();
  return src.startsWith(`${base}/p/`) || src.startsWith(`${base}/u/`) || src.startsWith(`${base}/`) && /^\d+x\d+\//.test(src.slice(base.length + 1));
}
function proxifySource(written, width, height, format) {
  const source = written.trim();
  if (!onProxy(source)) return proxifyImageSrc(decodeDomImageSrc(source), width, height, format, { forceProxy: true });
  if (!width && !height) return source;
  const proxied = proxifyImageSrc(decodeDomImageSrc(source), width, height, format);
  return proxied.startsWith(`${getProxyBase()}/p/`) ? proxied : proxifyImageSrc(source, width, height, format);
}
function regexTierImage(raw, width, height, format) {
  const body = parserInput(raw);
  const prepared = prepareBody(body);
  const found = findFirstImageCandidate(prepared).candidate;
  if (!found || !(found.html || found.md)) return null;
  const poster = findFirstVideoPoster(prepared);
  if (poster && poster.pos < found.pos) return null;
  const source = candidateSource(body, found);
  return source === null ? null : proxifySource(source, width, height, format);
}
function getImage(entry, width, height, format, renderFirstImage) {
  let meta;
  if (typeof entry.json_metadata === "object") {
    meta = entry.json_metadata;
  } else {
    try {
      meta = JSON.parse(entry.json_metadata);
    } catch (e) {
      meta = null;
    }
  }
  const thumbnail = firstMetaUrl(meta?.thumbnails);
  if (thumbnail) {
    const proxied = proxifyImageSrc(decodeEntities(thumbnail), width, height, format);
    if (proxied) {
      return proxied;
    }
  }
  if (meta && typeof meta.image === "string" && meta.image.length > 0) {
    return proxifyImageSrc(decodeEntities(meta.image), width, height, format);
  }
  if (meta && meta.image && !!meta.image.length && meta.image[0]) {
    if (typeof meta.image[0] === "string") {
      return proxifyImageSrc(decodeEntities(meta.image[0]), width, height, format);
    }
    return proxifyImageSrc(meta.image[0], width, height, format);
  }
  if (!renderFirstImage) {
    return fastBodyImage(entry.body, width, height, format);
  }
  const fast = regexTierImage(entry.body, width, height, format);
  if (fast) {
    return fast;
  }
  const src = renderFirstImage(entry);
  return src ? proxifySource(src, width, height, format) || src : null;
}
function getEntryCardImageRawUrl(obj) {
  if (typeof obj === "string") {
    return getEntryImageRawUrl(obj);
  }
  let meta;
  if (typeof obj.json_metadata === "object") {
    meta = obj.json_metadata;
  } else {
    try {
      meta = JSON.parse(obj.json_metadata);
    } catch (e) {
      meta = null;
    }
  }
  const thumbnail = firstMetaUrl(meta?.thumbnails);
  if (thumbnail) {
    return decodeImageSrc(thumbnail);
  }
  return getEntryImageRawUrl(obj);
}
function metaCoverRawUrl(obj) {
  let meta;
  if (typeof obj.json_metadata === "object") {
    meta = obj.json_metadata;
  } else {
    try {
      meta = JSON.parse(obj.json_metadata);
    } catch (e) {
      meta = null;
    }
  }
  if (meta && typeof meta.image === "string" && meta.image.length > 0) {
    return decodeImageSrc(meta.image);
  }
  if (meta && meta.image && !!meta.image.length && typeof meta.image[0] === "string" && meta.image[0].length > 0) {
    return decodeImageSrc(meta.image[0]);
  }
  return null;
}
function getEntryLcpImage(obj) {
  const cover = metaCoverRawUrl(obj);
  if (cover) {
    return { url: cover, poster: false };
  }
  const body = parserInput(obj.body);
  const prepared = prepareBody(body);
  const found = findFirstImageCandidate(prepared);
  if (found.ambiguous) {
    return null;
  }
  const poster = findFirstVideoPoster(prepared);
  if (poster && (!found.candidate || poster.pos < found.candidate.pos)) {
    return poster.uncertain ? null : { url: poster.url, poster: true };
  }
  const url = bodyImageRawUrl(body, prepared);
  return url ? { url, poster: false } : null;
}
function getEntryImageRawUrl(obj) {
  if (typeof obj === "string") {
    return firstBodyImageRawUrl(obj);
  }
  return metaCoverRawUrl(obj) ?? firstBodyImageRawUrl(obj.body);
}
function lookupPostImage(obj, width, height, format, renderFirstImage) {
  if (typeof obj === "string") {
    if (!renderFirstImage) {
      return fastBodyImage(obj, width, height, format);
    }
    const fast = regexTierImage(obj, width, height, format);
    if (fast) {
      return fast;
    }
    const src = renderFirstImage(obj);
    return src ? proxifySource(src, width, height, format) || src : null;
  }
  const key = `${makeEntryCacheKey(obj)}-${width}x${height}-${format}${renderFirstImage ? "" : "-fast"}`;
  const meta = metaFingerprint(obj.json_metadata);
  const item = entryMemoGet(key, obj.body, meta);
  if (item !== MEMO_MISS) {
    return item;
  }
  const res = getImage(obj, width, height, format, renderFirstImage);
  entryMemoSet(key, obj.body, meta, res);
  return res;
}
function getEntryCardImage(obj, width = 0, height = 0, format = "match") {
  return lookupPostImage(obj, width, height, format, null);
}

export { getEntryCardImage, getEntryCardImageRawUrl, getEntryImageRawUrl, getEntryLcpImage, lookupPostImage };
//# sourceMappingURL=chunk-EXMSUEK2.js.map
//# sourceMappingURL=chunk-EXMSUEK2.js.map