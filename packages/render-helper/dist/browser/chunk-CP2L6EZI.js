import { cleanReply } from './chunk-RM7HKPKJ.js';
import { proxifyImageSrc, getProxyBase } from './chunk-LT2KELO7.js';
import { regexMatches } from './chunk-SH6RGNOF.js';
import { entryMemoGet, MEMO_MISS, entryMemoSet } from './chunk-2SC5I7QY.js';
import { decodeImageSrc, makeEntryCacheKey, internalizeLeoLinks, hasAmpSentinel, decodeDomImageSrc, decodeAttributeEntities, decodeRawBodyImageSrc, decodeCompleteReferences, withoutLoneSurrogates, imageUrlEnd, decodeEntities, stripHtmlTags, plainDestination, unescapeDestination } from './chunk-6SZO54KO.js';
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
var HTML_IMAGE_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;
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
        marks[i] = 1;
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
function firstStandalone(scan, classify) {
  for (const hit of standaloneMatches(scan, classify)) return hit;
  return null;
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
function findFirstImageUrl(body, includeBareUrls = false) {
  return findFirstImageCandidate(prepareBody(parserInput(body)), includeBareUrls).candidate?.url ?? null;
}
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
  return urlEnd === -1 ? null : decodeDomImageSrc(token.slice(0, urlEnd));
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
  const candidate = findFirstImageCandidate(prepared, true).candidate;
  if (!candidate) return null;
  if (candidate.html) return decodeDomImageSrc(decodeAttributeEntities(candidate.url));
  const ampEscapes = !hasAmpSentinel(body);
  if (candidate.destination) {
    const url2 = decodeRawBodyImageSrc(candidate.url, true, ampEscapes);
    return CONTROL_CHAR_RE.test(url2) ? null : url2;
  }
  if (markLines(asciiLower(codeBlanked(body))).block[candidate.pos]) return htmlTextImageUrl(body, candidate.pos);
  const after = body.slice(candidate.pos + candidate.url.length, candidate.pos + candidate.url.length + 4);
  const loneAt = loneSurrogateAt(candidate.url);
  const token = loneAt === -1 ? candidate.url : candidate.url.slice(0, loneAt);
  const tokenUrl = () => {
    const url2 = withoutTrailingPunctuation(token, loneAt === -1 ? after : "");
    return imageUrlEnd(url2) === -1 ? null : decodeRawBodyImageSrc(url2, false, ampEscapes);
  };
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
  return imageUrlEnd(url) === -1 ? null : decodeDomImageSrc(url);
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
  if (!cleaned) return { cleaned, image: EMPTY_SCAN, video: EMPTY_SCAN };
  const imageText = blankUnequalAnchors(cleaned, false);
  const videoText = blankUnequalAnchors(cleaned, true);
  return {
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
  return { url: `https://img.youtube.com/vi/${best.url.split("?")[0]}/hqdefault.jpg`, pos: best.pos };
}
var NONE = { candidate: null, ambiguous: false };
var AMBIGUOUS = { candidate: null, ambiguous: true };
function findFirstImageCandidate(prepared, includeBareUrls = false) {
  const { cleaned } = prepared;
  if (!cleaned) return NONE;
  const mdMatch = firstUnescapedImage(cleaned, MD_IMAGE_RE_G);
  const htmlMatch = cleaned.match(HTML_IMAGE_RE);
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
  if (firstUnescapedImage(priorRegion, MD_IMAGE_PRESENT_RE)) {
    return AMBIGUOUS;
  }
  const candidates = [];
  if (mdMatch && mdUrl) candidates.push({ url: mdUrl, pos: mdMatch.index ?? 0, destination: true });
  if (htmlMatch && htmlMatch[1] && SAFE_URL_RE.test(htmlMatch[1])) {
    candidates.push({ url: htmlMatch[1], pos: htmlMatch.index ?? 0, html: true });
  }
  if (includeBareUrls) {
    const bareMatch = firstStandalone(prepared.image, imageToken);
    if (bareMatch && SAFE_URL_RE.test(bareMatch.url)) {
      candidates.push(bareMatch);
    }
    for (const m of regexMatches(cleaned, MD_LINK_RE)) {
      const idx = m.index ?? 0;
      if (idx > 0 && cleaned[idx - 1] === "!") continue;
      const href = m[2];
      if (href && isImageHref(href) && promotesToImage(m[1], href)) {
        candidates.push({ url: href, pos: idx, destination: true });
        break;
      }
    }
  }
  if (candidates.length === 0) return NONE;
  candidates.sort((a, b) => a.pos - b.pos);
  return { candidate: candidates[0], ambiguous: false };
}
function fastBodyImage(raw, width, height, format) {
  const body = parserInput(raw);
  const prepared = prepareBody(body);
  const strict = findFirstImageCandidate(prepared, false);
  if (strict.candidate) {
    return proxifyFound(strict.candidate.url, width, height, format);
  }
  if (strict.ambiguous) {
    return null;
  }
  const bare = findFirstImageCandidate(prepared, true).candidate;
  const poster = findFirstVideoPoster(prepared);
  if (bare && !bare.html && !bare.destination && loneSurrogateAt(bare.url) !== -1 && !(poster && poster.pos < bare.pos)) return null;
  if (poster && (!bare || poster.pos < bare.pos)) {
    return proxifyFound(proxifyImageSrc(poster.url, 0, 0, "match"), width, height, format);
  }
  return bare ? proxifyFound(bare.url, width, height, format) : null;
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
function proxifyFound(src, width, height, format) {
  const entityDecoded = decodeEntities(src);
  const proxied = proxifyImageSrc(decodeDomImageSrc(entityDecoded), width, height, format);
  return proxied.startsWith(`${getProxyBase()}/p/`) ? proxied : proxifyImageSrc(entityDecoded, width, height, format);
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
  const fast = findFirstImageUrl(entry.body);
  if (fast) {
    return proxifyFound(fast, width, height, format);
  }
  const src = renderFirstImage(entry);
  return src ? proxifyFound(src, width, height, format) : null;
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
  const found = findFirstImageCandidate(prepared, true);
  if (found.ambiguous) {
    return null;
  }
  const poster = findFirstVideoPoster(prepared);
  if (poster && (!found.candidate || poster.pos < found.candidate.pos)) {
    return { url: poster.url, poster: true };
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
    const fast = findFirstImageUrl(obj);
    if (fast) {
      return proxifyFound(fast, width, height, format);
    }
    const src = renderFirstImage(obj);
    return src ? proxifyFound(src, width, height, format) : null;
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
//# sourceMappingURL=chunk-CP2L6EZI.js.map
//# sourceMappingURL=chunk-CP2L6EZI.js.map