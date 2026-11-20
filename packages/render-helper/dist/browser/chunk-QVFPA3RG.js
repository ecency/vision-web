import { decodeHTML, decodeHTMLAttribute, decodeHTMLStrict } from 'entities';

// src/helper.ts
var LEADING_ZEROS_DEC = /&#0+(?=[0-9])/g;
var LEADING_ZEROS_HEX = /&#x0+(?=[0-9a-f])/gi;
var OVERLONG_NUMERIC_REF = /&#(?:x[0-9a-f]{256,}|[0-9]{309,});?/gi;
function guardNumericRefs(value) {
  return value.replace(LEADING_ZEROS_DEC, "&#").replace(LEADING_ZEROS_HEX, (m) => m.slice(0, 3)).replace(OVERLONG_NUMERIC_REF, "\uFFFD");
}
function decodeEntities(value) {
  const safe = guardNumericRefs(value);
  try {
    return decodeHTML(safe);
  } catch {
    return safe;
  }
}
function decodeAttributeEntities(value) {
  const safe = guardNumericRefs(value);
  try {
    return decodeHTMLAttribute(safe);
  } catch {
    return safe;
  }
}
function decodeImageSrc(src) {
  return decodeDomImageSrc(decodeEntities(src));
}
function decodeDomImageSrc(src) {
  try {
    return decodeURIComponent(src).trim();
  } catch {
    return src.trim();
  }
}
var COMPLETE_REFERENCE = /&(?:#\d{1,7}|#x[\da-f]{1,6}|[a-z][a-z\d]{1,31});/gi;
var IMAGE_EXT_G = /\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/gi;
var TRAILING_PUNCTUATION = ".,;:!)]}*_~";
function imageUrlEnd(token) {
  let contentEnd = token.length;
  if (!/[?#]/.test(token)) {
    while (contentEnd > 0 && TRAILING_PUNCTUATION.includes(token[contentEnd - 1])) contentEnd--;
  } else {
    let open = 0;
    let unmatchedTail = 0;
    for (let i = 0; i < token.length; i++) {
      if (token[i] === "(") {
        open++;
        unmatchedTail = 0;
      } else if (token[i] === ")") {
        if (open > 0) {
          open--;
          unmatchedTail = 0;
        } else {
          unmatchedTail++;
        }
      } else {
        unmatchedTail = 0;
      }
    }
    contentEnd -= unmatchedTail;
  }
  IMAGE_EXT_G.lastIndex = 0;
  let m;
  while ((m = IMAGE_EXT_G.exec(token)) !== null) {
    const at = m.index + m[0].length;
    if (at > contentEnd) continue;
    if (at < contentEnd && (/[a-z\d]/i.test(token[at]) || token[at] === "." && /[a-z]/i.test(token[at + 1] ?? ""))) continue;
    return contentEnd;
  }
  return -1;
}
function decodeCompleteReferences(value) {
  return value.replace(COMPLETE_REFERENCE, (reference) => {
    try {
      return decodeHTMLStrict(guardNumericRefs(reference));
    } catch {
      return reference;
    }
  });
}
function hasAmpSentinel(body) {
  return /[\uE000\uE001]|%EE%80%8[01]|&#x0*e00[01];|&#0*5734[45];/i.test(body);
}
var MD_ESCAPE_RE = /\\([\\!"#$%&'()*+,./:;<=>?@[\]^_`{|}~-])/g;
function decodeRawBodyImageSrc(src, destination = false, ampEscapes = true) {
  const unescaped = destination ? src.replace(MD_ESCAPE_RE, (_m, c) => c === "&" && ampEscapes ? "&amp;" : c) : src.replace(/\\&/g, "&amp;");
  return decodeDomImageSrc(decodeCompleteReferences(unescaped));
}
function escapeAttrValue(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");
}
function isSpaceChar(c) {
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
}
function isAsciiLetter(c) {
  return c >= 65 && c <= 90 || c >= 97 && c <= 122;
}
function isTagNameChar(c) {
  return isAsciiLetter(c) || c >= 48 && c <= 57;
}
function isAttrNameChar(c) {
  return isAsciiLetter(c) || c >= 48 && c <= 57 || c === 45 || c === 95 || c === 58 || c === 46;
}
function removeDuplicateAttributes(html) {
  const n = html.length;
  const lastGt = html.lastIndexOf(">");
  const scanBudget = 4 * n + 4096;
  let wasted = 0;
  let out = "";
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (lt > lastGt) {
      out += html.slice(lt);
      break;
    }
    if (lt + 1 >= n || !isAsciiLetter(html.charCodeAt(lt + 1))) {
      out += "<";
      i = lt + 1;
      continue;
    }
    let p = lt + 1;
    while (p < n && isTagNameChar(html.charCodeAt(p))) p++;
    const tagName = html.slice(lt + 1, p);
    if (p >= n || !isSpaceChar(html.charCodeAt(p))) {
      out += "<";
      i = lt + 1;
      continue;
    }
    const attrs = [];
    const seen = /* @__PURE__ */ new Set();
    let q = p;
    while (q < n) {
      while (q < n && isSpaceChar(html.charCodeAt(q))) q++;
      if (q >= n) break;
      const ch = html.charCodeAt(q);
      if (ch === 62) break;
      if (ch === 47 && q + 1 < n && html.charCodeAt(q + 1) === 62) break;
      const nameStart = q;
      while (q < n && isAttrNameChar(html.charCodeAt(q))) q++;
      if (q === nameStart) {
        q++;
        continue;
      }
      const attrName = html.slice(nameStart, q);
      let r = q;
      while (r < n && isSpaceChar(html.charCodeAt(r))) r++;
      let valueEnd = q;
      let rawValue = null;
      if (r < n && html.charCodeAt(r) === 61) {
        r++;
        while (r < n && isSpaceChar(html.charCodeAt(r))) r++;
        if (r < n) {
          const v = html.charCodeAt(r);
          if (v === 34 || v === 39) {
            const quote = html[r];
            const end = html.indexOf(quote, r + 1);
            if (end < 0) {
              const gt = html.indexOf(">", r + 1);
              valueEnd = gt < 0 ? n : gt;
            } else {
              valueEnd = end + 1;
              rawValue = html.slice(r + 1, end);
            }
          } else {
            let s = r;
            while (s < n) {
              const k = html.charCodeAt(s);
              if (isSpaceChar(k) || k === 62) break;
              s++;
            }
            valueEnd = s;
            rawValue = html.slice(r, s);
          }
        } else {
          valueEnd = r;
        }
      }
      const fullAttr = html.slice(nameStart, valueEnd);
      q = valueEnd;
      const key = attrName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        const value = rawValue === null ? null : escapeAttrValue(decodeAttributeEntities(rawValue.replace(/\r\n?|[\n\t]/g, " ")));
        attrs.push(
          value === null || value === rawValue ? key + fullAttr.slice(attrName.length) : `${key}="${value}"`
        );
      }
    }
    let selfClose = false;
    if (q < n && html.charCodeAt(q) === 47) {
      selfClose = true;
      q++;
    }
    if (q >= n || html.charCodeAt(q) !== 62) {
      wasted += q - lt;
      if (wasted > scanBudget) {
        out += html.slice(lt);
        break;
      }
      out += "<";
      i = lt + 1;
      continue;
    }
    q++;
    const attrsJoined = attrs.length > 0 ? " " + attrs.join(" ") : "";
    out += "<" + tagName + attrsJoined + (selfClose ? " /" : "") + ">";
    i = q;
  }
  return out;
}
function hashBody(body) {
  const s = typeof body === "string" ? body : "";
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}.${(h >>> 0).toString(36)}`;
}
var bodyHashes = /* @__PURE__ */ new WeakMap();
function entryBodyHash(entry) {
  const body = entry.body;
  if (typeof body !== "string" || typeof entry !== "object" || entry === null) {
    return hashBody(body);
  }
  const stored = bodyHashes.get(entry);
  if (stored && stored.body === body) {
    return stored.hash;
  }
  const hash = hashBody(body);
  bodyHashes.set(entry, { body, hash });
  return hash;
}
function makeEntryCacheKey(entry) {
  return `${entry.author}-${entry.permlink}-${entry.last_update}-${entry.updated}-${entryBodyHash(entry)}`;
}
function stripHtmlTags(s) {
  const n = s.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt < 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, lt);
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) {
      out += s.slice(lt);
      break;
    }
    if (gt === lt + 1) {
      out += s.slice(lt, gt + 1);
      i = gt + 1;
      continue;
    }
    i = gt + 1;
  }
  return out;
}
function trimTrailingSlash(s) {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
  return s.slice(0, end);
}
function stripQueryString(s) {
  const q = s.indexOf("?");
  return q >= 0 && q < s.length - 1 ? s.slice(0, q) : s;
}
function isHtmlWhitespace(c) {
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
}
function moveBlockClosingTagOutOfParagraph(html, blockTags) {
  const n = html.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const pStart = html.indexOf("</p>", i);
    if (pStart < 0) {
      out += html.slice(i);
      break;
    }
    if (pStart === i || html.charCodeAt(pStart - 1) !== 62) {
      out += html.slice(i, pStart + 4);
      i = pStart + 4;
      continue;
    }
    const closingStart = html.lastIndexOf("</", pStart - 2);
    if (closingStart < i) {
      out += html.slice(i, pStart + 4);
      i = pStart + 4;
      continue;
    }
    const tagName = html.slice(closingStart + 2, pStart - 1).toLowerCase();
    if (!blockTags.has(tagName)) {
      out += html.slice(i, pStart + 4);
      i = pStart + 4;
      continue;
    }
    let k = closingStart;
    while (k > i && isHtmlWhitespace(html.charCodeAt(k - 1))) k--;
    if (k - 4 >= i && html.slice(k - 4, k).toLowerCase() === "<br>") {
      k -= 4;
      while (k > i && isHtmlWhitespace(html.charCodeAt(k - 1))) k--;
    }
    out += html.slice(i, k) + "</p>" + html.slice(closingStart, pStart);
    i = pStart + 4;
  }
  return out;
}
function extractYtStartTime(url) {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const m = /^(?:(\d{1,7})h)?(?:(\d{1,7})m)?(?:(\d{1,7})s?)?$/i.exec(params.get("t") || "");
    if (m && (m[1] || m[2] || m[3])) {
      const seconds = +(m[1] || 0) * 3600 + +(m[2] || 0) * 60 + +(m[3] || 0);
      if (seconds <= 9999999) return "" + seconds;
    }
    const start = params.get("start") || "";
    return /^\d{1,7}$/.test(start) ? "" + +start : "";
  } catch (error) {
    return "";
  }
}
function youtubeVideoLinkClass(matchedUrl) {
  const base = "markdown-video-link markdown-video-link-youtube";
  return /youtube\.com\/shorts\//i.test(matchedUrl) ? `${base} markdown-video-link-youtube-portrait` : base;
}
function sanitizePermlink(permlink) {
  if (!permlink || typeof permlink !== "string") {
    return "";
  }
  const [withoutQuery] = permlink.split("?");
  const [cleaned] = withoutQuery.split("#");
  return cleaned;
}
function isValidPermlink(permlink) {
  const sanitized = sanitizePermlink(permlink);
  if (!sanitized) {
    return false;
  }
  const isImage = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(sanitized);
  const isCleanFormat = /^[a-z0-9-]+$/.test(sanitized);
  return isCleanFormat && !isImage;
}
var LABEL_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
function isValidUsername(username) {
  if (!username || typeof username !== "string") return false;
  if (username.length > 16) return false;
  const labels = username.split(".");
  return labels.every((label) => {
    return label.length >= 3 && label.length <= 16 && /^[a-z]/.test(label) && // must start with a letter
    LABEL_REGEX.test(label) && // a-z0-9, hyphens, no start/end hyphen
    !label.includes("..");
  });
}

export { decodeAttributeEntities, decodeCompleteReferences, decodeDomImageSrc, decodeEntities, decodeImageSrc, decodeRawBodyImageSrc, extractYtStartTime, hasAmpSentinel, imageUrlEnd, isValidPermlink, isValidUsername, makeEntryCacheKey, moveBlockClosingTagOutOfParagraph, removeDuplicateAttributes, sanitizePermlink, stripHtmlTags, stripQueryString, trimTrailingSlash, youtubeVideoLinkClass };
//# sourceMappingURL=chunk-QVFPA3RG.js.map
//# sourceMappingURL=chunk-QVFPA3RG.js.map