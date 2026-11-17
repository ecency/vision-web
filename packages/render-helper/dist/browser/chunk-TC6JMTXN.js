import { markdown2Html } from './chunk-K56H3RQA.js';
import { entryMemoGet, MEMO_MISS, entryMemoSet } from './chunk-2SC5I7QY.js';
import { decodeImageSrc, createDoc, makeEntryCacheKey, decodeDomImageSrc, decodeAttributeEntities, hasAmpSentinel, decodeRawBodyImageSrc, imageUrlEnd, decodeEntities, stripHtmlTags, decodeCompleteReferences } from './chunk-VLNYO6UX.js';
import { proxifyImageSrc } from './chunk-LT2KELO7.js';
import { regexMatches } from './chunk-SH6RGNOF.js';
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
function findOpenTagEnd(lower, openAt) {
  let quote = "";
  for (let i = openAt + 1; i < lower.length; i++) {
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
  let spellings = { text, lower: text.toLowerCase() };
  const { block: blockMask, code: codeMask } = markLines(spellings.lower);
  spellings = blankMasked(spellings, codeMask);
  spellings = blankSpans(spellings, "<!--", "-->", false, null);
  spellings = blankSpans(spellings, "<style", "</style", true, null);
  spellings = blankSpans(spellings, "<script", "<\/script", true, null);
  spellings = blankSpans(spellings, "<pre", "</pre", true, blockMask);
  spellings = blankSpans(spellings, "<code", "</code", true, blockMask);
  return spellings.text;
}
var MD_IMAGE_RE = /!\[[^[\]]*\]\(\s*([^)\s]{1,2048})(?:\s+["'][^"']*["'])?\s*\)/;
var MD_IMAGE_PRESENT_RE = /!\[[^[\]]*\]\(\s*[^\s)]/;
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
  return findFirstImageCandidate(prepareBody(body), includeBareUrls).candidate?.url ?? null;
}
function promotesToImage(label, href) {
  const deAmp = (value) => value.replace(/&amp;/g, "&");
  const serialized = decodeCompleteReferences(label.trim()).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return deAmp(decodeCompleteReferences(href.trim())) === deAmp(serialized);
}
var CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
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
function firstBodyImageRawUrl(body) {
  const prepared = prepareBody(body);
  const candidate = findFirstImageCandidate(prepared, true).candidate;
  if (!candidate) return null;
  if (candidate.html) return decodeDomImageSrc(decodeAttributeEntities(candidate.url));
  const ampEscapes = !hasAmpSentinel(body);
  if (candidate.destination) {
    const url2 = decodeRawBodyImageSrc(candidate.url, true, ampEscapes);
    return CONTROL_CHAR_RE.test(url2) ? null : url2;
  }
  if (markLines(asciiLower(codeBlanked(body))).block[candidate.pos]) return htmlTextImageUrl(body, candidate.pos);
  const url = withoutTrailingPunctuation(candidate.url, body.slice(candidate.pos + candidate.url.length, candidate.pos + candidate.url.length + 4));
  return imageUrlEnd(url) === -1 ? null : decodeRawBodyImageSrc(url, false, ampEscapes);
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
  const lower = cleaned.toLowerCase();
  const parts = [];
  let from = 0;
  let at = findTag(lower, "<a", 0, OPEN_TAG_NAME_END);
  while (at !== -1) {
    const gt = findOpenTagEnd(lower, at);
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
  const mdMatch = cleaned.match(MD_IMAGE_RE);
  const htmlMatch = cleaned.match(HTML_IMAGE_RE);
  if (mdMatch) {
    const url = mdMatch[1];
    if (!url || !SAFE_URL_RE.test(url) || url.includes("(")) {
      return AMBIGUOUS;
    }
  }
  const priorRegion = mdMatch ? cleaned.slice(0, mdMatch.index ?? 0) : cleaned;
  if (MD_IMAGE_PRESENT_RE.test(priorRegion)) {
    return AMBIGUOUS;
  }
  const candidates = [];
  if (mdMatch) candidates.push({ url: mdMatch[1], pos: mdMatch.index ?? 0, destination: true });
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
function fastBodyImage(body, width, height, format) {
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
  return proxifyImageSrc(decodeEntities(src), width, height, format);
}
function getImage(entry, width = 0, height = 0, format = "match", fastMode = false) {
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
  if (fastMode) {
    return fastBodyImage(entry.body, width, height, format);
  }
  const fast = findFirstImageUrl(entry.body);
  if (fast) {
    return proxifyFound(fast, width, height, format);
  }
  const html = markdown2Html(entry);
  const doc = createDoc(html);
  if (!doc) {
    return null;
  }
  const imgEls = doc.getElementsByTagName("img");
  if (imgEls.length >= 1) {
    const src = imgEls[0].getAttribute("src");
    if (!src) {
      return null;
    }
    return proxifyFound(src, width, height, format);
  }
  return null;
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
function getEntryImageRawUrl(obj) {
  if (typeof obj === "string") {
    return firstBodyImageRawUrl(obj);
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
  if (meta && typeof meta.image === "string" && meta.image.length > 0) {
    return decodeImageSrc(meta.image);
  }
  if (meta && meta.image && !!meta.image.length && typeof meta.image[0] === "string" && meta.image[0].length > 0) {
    return decodeImageSrc(meta.image[0]);
  }
  return firstBodyImageRawUrl(obj.body);
}
function catchPostImage(obj, width = 0, height = 0, format = "match", options = {}) {
  const fastMode = options.fast === true;
  if (typeof obj === "string") {
    if (fastMode) {
      return fastBodyImage(obj, width, height, format);
    }
    const fast = findFirstImageUrl(obj);
    if (fast) {
      return proxifyFound(fast, width, height, format);
    }
    const html = markdown2Html(obj);
    const doc = createDoc(html);
    if (!doc) {
      return null;
    }
    const imgEls = doc.getElementsByTagName("img");
    if (imgEls.length >= 1) {
      const src = imgEls[0].getAttribute("src");
      if (!src) {
        return null;
      }
      return proxifyFound(src, width, height, format);
    }
    return null;
  }
  const key = `${makeEntryCacheKey(obj)}-${width}x${height}-${format}${fastMode ? "-fast" : ""}`;
  const meta = metaFingerprint(obj.json_metadata);
  const item = entryMemoGet(key, obj.body, meta);
  if (item !== MEMO_MISS) {
    return item;
  }
  const res = getImage(obj, width, height, format, fastMode);
  entryMemoSet(key, obj.body, meta, res);
  return res;
}

export { catchPostImage, getEntryCardImageRawUrl, getEntryImageRawUrl };
//# sourceMappingURL=chunk-TC6JMTXN.js.map
//# sourceMappingURL=chunk-TC6JMTXN.js.map