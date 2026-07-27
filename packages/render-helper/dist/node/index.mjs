import { DOMParser as DOMParser$1, XMLSerializer } from '@xmldom/xmldom';
import he2 from 'he';
import xss from 'xss';
import querystring from 'querystring';
import { LRUCache } from 'lru-cache';
import { Remarkable } from 'remarkable';
import { linkify as linkify$1 } from 'remarkable/linkify';
import * as htmlparser2 from 'htmlparser2';
import * as domSerializerModule from 'dom-serializer';

// src/consts/white-list.const.ts
var WHITE_LIST = [
  "ecency.com",
  "hive.blog",
  "peakd.com",
  "snapie.io",
  "hivesuite.app",
  "travelfeed.io",
  "dapplr.in",
  "leofinance.io",
  "inleo.io",
  "proofofbrain.io",
  "stemgeeks.net",
  "hiveblockexplorer.com",
  "proofofbrain.blog",
  "weedcash.network",
  "dapplr.in",
  "liketu.com",
  "bilpcoin.com",
  "inji.com"
];

// src/consts/section-list.const.ts
var SECTION_LIST = [
  "wallet",
  "feed",
  "followers",
  "following",
  "points",
  "communities",
  "posts",
  "blog",
  "comments",
  "replies",
  "settings",
  "engine",
  "permissions",
  "referrals",
  "payout",
  "activities",
  "spk",
  "trail"
];

// src/consts/regexes.const.ts
var IMG_REGEX = /(https?:\/\/.*\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw))(.*)/gim;
var IPFS_REGEX = /^https?:\/\/[^/]+\/(ip[fn]s)\/([^/?#]+)/gim;
var POST_REGEX = /^https?:\/\/([^/]+)\/([^/]+)\/(@[\w.\d-]+)\/(.+)$/i;
var CCC_REGEX = /^https?:\/\/(.*)\/ccc\/([\w.\d-]+)\/(.*)/i;
var MENTION_REGEX = /^https?:\/\/(.*)\/(@[\w.\d-]+)$/i;
var TOPIC_REGEX = /^https?:\/\/(.*)\/(trending|hot|created|promoted|muted|payout)\/(.*)$/i;
var INTERNAL_MENTION_REGEX = /^\/@[\w.\d-]+$/i;
var INTERNAL_TOPIC_REGEX = /^\/(trending|hot|created|promoted|muted|payout)\/(.*)$/i;
var INTERNAL_POST_TAG_REGEX = /^(.+?)\/(@[\w.\d-]+)\/(.*)$/i;
var INTERNAL_POST_REGEX = /^\/(@[\w.\d-]+)\/(.*)$/i;
var CUSTOM_COMMUNITY_REGEX = /^https?:\/\/(.*)\/c\/(hive-\d+)(.*)/i;
var YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
var YOUTUBE_EMBED_REGEX = /^(https?:)?\/\/www\.youtube\.com\/(embed|shorts)\/.*/i;
var VIMEO_REGEX = /(https?:\/\/)?(www\.)?(?:vimeo)\.com.*(?:videos|video|channels|)\/([\d]+)/i;
var VIMEO_EMBED_REGEX = /https:\/\/player\.vimeo\.com\/video\/([0-9]+)(?:$|[?#])/;
var BITCHUTE_REGEX = /^(?:https?:\/\/)?(?:www\.)?bitchute\.com\/(?:video|embed)\/([a-z0-9]+)/i;
var D_TUBE_REGEX = /(https?:\/\/d\.tube\/#!\/v\/)(\w+)\/(\w+)/g;
var D_TUBE_REGEX2 = /(https?:\/\/d\.tube\/v\/)(\w+)\/(\w+)/g;
var D_TUBE_EMBED_REGEX = /^https:\/\/emb\.d\.tube\/#!\/[^/?#]+\/[^/?#]+(?:$|[?#])/i;
var TWITCH_REGEX = /https?:\/\/(?:www\.)?twitch\.tv\/(?:(videos)\/)?([a-zA-Z0-9][\w]{3,24})/i;
var DAPPLR_REGEX = /^(https?:)?\/\/[a-z]*\.dapplr\.in\/file\/dapplr-videos\/.*/i;
var TRUVVL_REGEX = /^https?:\/\/embed\.truvvl\.com\/(@[\w.\d-]+)\/(.*)/i;
var LBRY_REGEX = /^(https?:)?\/\/lbry\.tv\/\$\/embed\/[^?#]+(?:$|[?#])/i;
var ODYSEE_REGEX = /^(https?:)?\/\/odysee\.com\/(?:\$|%24)\/embed\/[^?#]+(?:$|[?#])/i;
var ODYSEE_WATCH_REGEX = /^(?:https?:)?\/\/odysee\.com\/(@[^/?#\s:"'<>\\]+:[^/?#\s:"'<>\\]+\/[^/?#\s:"'<>\\]+:[^/?#\s:"'<>\\]+|[^@/?#\s:"'<>\\][^/?#\s:"'<>\\]*:[^/?#\s:"'<>\\]+)(?:$|[?#])/i;
var SKATEHIVE_IPFS_REGEX = /^https?:\/\/ipfs\.skatehive\.app\/ipfs\/([^/?#]+)/i;
var SKATEHYPE_EMBED_REGEX = /^(https?:)?\/\/(www\.)?skatehype\.com\/ifplay\.php\?v=\d+(?:$|[&#])/i;
var ARCH_REGEX = /^(https?:)?\/\/archive\.org\/embed\/[^/?#]+(?:$|[?#])/i;
var SPEAK_REGEX = /(?:https?:\/\/(?:(?:play\.)?3speak\.([a-z]+)\/watch\?v=)|(?:(?:play\.)?3speak\.([a-z]+)\/embed\?v=))([A-Za-z0-9_\-\.\/]+)(&.*)?/i;
var SPEAK_EMBED_REGEX = /^(https?:)?\/\/(?:play\.)?3speak\.([a-z]+)\/(?:embed|watch)\?.+$/i;
var SPEAK_AUDIO_REGEX = /https?:\/\/audio\.3speak\.tv\/play\?[^\s]+/i;
var SPEAK_AUDIO_EMBED_REGEX = /^https?:\/\/audio\.3speak\.tv\/play\?.+$/i;
var LIKETU_AUDIO_REGEX = /^https?:\/\/cdn\.liketu\.com\/.+\.(?:webm|mp3|m4a|ogg|wav)(?:\?.*)?$/i;
var TWITTER_REGEX = /(?:https?:\/\/(?:(?:twitter\.com\/(.*?)\/status\/(.*))))/gi;
var SPOTIFY_REGEX = /^https:\/\/open\.spotify\.com\/playlist\/(.*)?$/gi;
var RUMBLE_REGEX = /^https:\/\/rumble\.com\/embed\/([a-zA-Z0-9-]+)\/\?pub=\w+/;
var BRIGHTEON_REGEX = /^https?:\/\/(www\.)?brighteon\.com\/(?:embed\/)?(.*[0-9].*)/i;
var VIMM_EMBED_REGEX = /^https:\/\/www\.vimm\.tv\/[^?#]+(?:$|[?#])/i;
var SPOTIFY_EMBED_REGEX = /^https:\/\/open\.spotify\.com\/(embed|embed-podcast)\/(playlist|show|episode|track|album)\/([^/?#]+)(?:$|[?#])/i;
var SOUNDCLOUD_EMBED_REGEX = /^https:\/\/w\.soundcloud\.com\/player\/\?[^#]+$/i;
var TWITCH_EMBED_REGEX = /^(https?:)?\/\/player\.twitch\.tv\/(?:\?[^/]+)?$/i;
var BRAND_NEW_TUBE_REGEX = /^https:\/\/brandnewtube\.com\/embed\/[a-z0-9]+$/i;
var LOOM_REGEX = /^(https?:)?\/\/www\.loom\.com\/share\/([^/?#]+)(?:$|[?#])/i;
var LOOM_EMBED_REGEX = /^(https?:)?\/\/www\.loom\.com\/embed\/([^/?#]+)(?:$|[?#])/i;
var AUREAL_EMBED_REGEX = /^(https?:)?\/\/(www\.)?(?:aureal-embed)\.web\.app\/([0-9]+)(?:$|[?#])/i;
var ENTITY_REGEX = /&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-fA-F]{1,6});/ig;
var ID_WHITELIST = /^[A-Za-z][-A-Za-z0-9_]*$/;

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

// src/consts/embed-hosts.const.ts
var ALLOWED_EMBED_HOSTS = /* @__PURE__ */ new Set([
  // YouTube
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  // Vimeo
  "player.vimeo.com",
  // Twitch
  "player.twitch.tv",
  // DTube
  "emb.d.tube",
  // 3Speak (video + audio)
  "play.3speak.tv",
  "3speak.tv",
  "audio.3speak.tv",
  // Loom
  "www.loom.com",
  // Spotify
  "open.spotify.com",
  // SoundCloud
  "w.soundcloud.com",
  // BitChute
  "www.bitchute.com",
  "bitchute.com",
  // Rumble
  "www.rumble.com",
  "rumble.com",
  // Brighteon
  "www.brighteon.com",
  "brighteon.com",
  // VIMM
  "www.vimm.tv",
  // BrandNewTube
  "brandnewtube.com",
  // LBRY / Odysee
  "lbry.tv",
  "odysee.com",
  // Skatehive / Skatehype
  "ipfs.skatehive.app",
  "www.skatehype.com",
  "skatehype.com",
  // archive.org
  "archive.org",
  // Truvvl
  "embed.truvvl.com",
  // Aureal
  "aureal-embed.web.app",
  "www.aureal-embed.web.app"
  // Dapplr (player.*.dapplr.in / *.dapplr.in) — host suffix, handled below
]);
var ALLOWED_EMBED_HOST_SUFFIXES = [".dapplr.in"];
var EMBED_HOST_PATH_PATTERNS = {
  "www.youtube.com": /^\/embed\//,
  "youtube.com": /^\/embed\//,
  "www.youtube-nocookie.com": /^\/embed\//,
  "youtube-nocookie.com": /^\/embed\//,
  "player.vimeo.com": /^\/video\//,
  "player.twitch.tv": /^\/$/,
  // channel/video carried in the query string
  "emb.d.tube": /^\/$/,
  // dtube carries the ref in the #! fragment
  "play.3speak.tv": /^\/(watch|embed)/,
  "open.spotify.com": /^\/embed\//,
  "www.loom.com": /^\/embed\//,
  "www.bitchute.com": /^\/embed\//,
  "bitchute.com": /^\/embed\//,
  "www.rumble.com": /^\/embed\//,
  "rumble.com": /^\/embed\//,
  "www.brighteon.com": /^\/embed\//,
  "brighteon.com": /^\/embed\//,
  // Odysee's embed route is /$/embed/<claim path>. Both the literal `$` and its
  // percent-encoded spelling occur in the wild: the renderer emits the literal
  // form, while Odysee's own share dialog hands out fully-encoded URLs, and
  // `URL.pathname` does not decode either. ODYSEE_REGEX accepts both for the
  // same reason.
  "odysee.com": /^\/(?:\$|%24)\/embed\//
};
function isAllowedEmbedSrc(value) {
  if (!value) return false;
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  const hostAllowed = ALLOWED_EMBED_HOSTS.has(host) || ALLOWED_EMBED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (!hostAllowed) return false;
  const pathPattern = EMBED_HOST_PATH_PATTERNS[host];
  if (pathPattern && !pathPattern.test(url.pathname)) return false;
  return true;
}
function createParser() {
  return new DOMParser$1({
    onError(level, msg) {
    }
  });
}
var DOMParser = createParser();
function decodeImageSrc(src) {
  const entityDecoded = he2.decode(src);
  try {
    return decodeURIComponent(entityDecoded).trim();
  } catch {
    return entityDecoded.trim();
  }
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
  let out = "";
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    if (lt + 1 >= n || !isAsciiLetter(html.charCodeAt(lt + 1))) {
      out += "<";
      i = lt + 1;
      continue;
    }
    let p2 = lt + 1;
    while (p2 < n && isTagNameChar(html.charCodeAt(p2))) p2++;
    const tagName = html.slice(lt + 1, p2);
    if (p2 >= n || !isSpaceChar(html.charCodeAt(p2))) {
      out += "<";
      i = lt + 1;
      continue;
    }
    const attrs = [];
    const seen = /* @__PURE__ */ new Set();
    let q = p2;
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
            }
          } else {
            let s = r;
            while (s < n) {
              const k = html.charCodeAt(s);
              if (isSpaceChar(k) || k === 62) break;
              s++;
            }
            valueEnd = s;
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
        attrs.push(fullAttr);
      }
    }
    let selfClose = false;
    if (q < n && html.charCodeAt(q) === 47) {
      selfClose = true;
      q++;
    }
    if (q >= n || html.charCodeAt(q) !== 62) {
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
function createDoc(html) {
  if (html.trim() === "") {
    return null;
  }
  const cleanedHtml = removeDuplicateAttributes(html);
  try {
    return DOMParser.parseFromString(`<body>${cleanedHtml}</body>`, "text/html");
  } catch {
    return null;
  }
}
function makeEntryCacheKey(entry) {
  return `${entry.author}-${entry.permlink}-${entry.last_update}-${entry.updated}`;
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
    if (params.has("t")) {
      const t = params.get("t");
      return "" + parseInt(t || "0");
    } else if (params.has("start")) {
      return params.get("start") || "";
    }
    return "";
  } catch (error) {
    return "";
  }
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

// src/methods/get-inner-html.method.ts
function getSerializedInnerHTML(node) {
  const serializer = new XMLSerializer();
  if (node.childNodes[0]) {
    return serializer.serializeToString(node.childNodes[0]);
  }
  return "";
}

// src/methods/remove-child-nodes.method.ts
function removeChildNodes(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}
var proxyBase = "https://i.ecency.com";
var urlHashCache = new LRUCache({ max: 500 });
var BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes) {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = carry / 58 | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = carry / 58 | 0;
    }
  }
  let out = "";
  for (let k = 0; k < bytes.length && bytes[k] === 0; k++) out += BASE58_ALPHABET[0];
  for (let q = digits.length - 1; q >= 0; q--) out += BASE58_ALPHABET[digits[q]];
  return out;
}
function utf8Bytes(url) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(url);
  return Uint8Array.from(Buffer.from(url, "utf8"));
}
function getUrlHash(url) {
  const cached = urlHashCache.get(url);
  if (cached) return cached;
  const hash = base58Encode(utf8Bytes(url));
  urlHashCache.set(url, hash);
  return hash;
}
function setProxyBase(p2) {
  proxyBase = p2;
}
function getProxyBase() {
  return proxyBase;
}
var PROXY_P_PREFIXES = () => [`${proxyBase}/p/`, "https://images.ecency.com/p/"];
function extractPHash(url) {
  const prefix = PROXY_P_PREFIXES().find((p2) => url.startsWith(p2));
  if (prefix) {
    const [hash] = url.slice(prefix.length).split("?");
    return hash.replace(/\.(webp|png)$/, "");
  }
  return null;
}
function isValidUrl(url) {
  try {
    return Boolean(new URL(url));
  } catch (e) {
    return false;
  }
}
var LEGACY_SIZED_PROXY_RE = /^https:\/\/(?:images\.hive\.blog|steemitimages\.com)\/\d+x\d+\/(.+)$/;
function isLegacySizedProxyUrl(url) {
  if (!url || typeof url !== "string") return false;
  return LEGACY_SIZED_PROXY_RE.test(url);
}
function extractLegacySizedSource(url) {
  const m = LEGACY_SIZED_PROXY_RE.exec(url);
  if (!m) return null;
  const rest = m[1];
  const qIndex = rest.indexOf("?");
  const path = qIndex >= 0 ? rest.slice(0, qIndex) : rest;
  const query = qIndex >= 0 ? rest.slice(qIndex + 1) : "";
  try {
    const inner = new URL(path.replace(/\/+$/, ""));
    if (query) {
      for (const [key, value] of new URLSearchParams(query)) {
        inner.searchParams.append(key, value);
      }
    }
    return inner.toString();
  } catch {
    return null;
  }
}
function isLegacyForeignProxyUrl(url) {
  return url.indexOf("https://images.hive.blog/") === 0 && url.indexOf("https://images.hive.blog/D") !== 0 || url.indexOf("https://steemitimages.com/") === 0 && url.indexOf("https://steemitimages.com/D") !== 0;
}
function getLatestUrl(str) {
  const [last] = [...str.replace(/https?:\/\//g, "\n$&").trim().split("\n")].reverse();
  return last;
}
function proxifyForFormat(url, width = 0, height = 0, format = "match", opts = {}) {
  if (!url || typeof url !== "string" || !isValidUrl(url)) {
    return "";
  }
  const routeThroughProxy = width > 0 || height > 0 || !!opts.blur || !!opts.forceProxy;
  if (isLegacyForeignProxyUrl(url) && !(isLegacySizedProxyUrl(url) && routeThroughProxy)) {
    return url.replace("https://images.hive.blog", proxyBase).replace("https://steemitimages.com", proxyBase);
  }
  if (url.indexOf("https://images.ecency.com/") === 0 && !routeThroughProxy) {
    return url.replace("https://images.ecency.com", proxyBase);
  }
  const realUrl = extractLegacySizedSource(url) ?? getLatestUrl(url);
  const pHash = extractPHash(realUrl);
  const options = {
    format,
    mode: "fit"
  };
  if (width > 0) {
    options.width = width;
  }
  if (height > 0) {
    options.height = height;
  }
  if (opts.blur) {
    options.blur = 1;
  }
  const qs = querystring.stringify(options);
  if (pHash) {
    return `${proxyBase}/p/${pHash}?${qs}`;
  }
  const b58url = getUrlHash(realUrl.toString());
  return `${proxyBase}/p/${b58url}?${qs}`;
}
function proxifyImageSrc(url, width = 0, height = 0, _format = "match", opts = {}) {
  return proxifyForFormat(url, width, height, "match", opts);
}
var SRCSET_WIDTHS = [320, 600, 800, 1024, 1280];
function buildSrcSet(url) {
  return buildSrcSetForFormat(url, "match");
}
function buildSrcSetForFormat(url, format = "match") {
  if (!url || typeof url !== "string") return "";
  const proxyPrefix = `${proxyBase}/p/`;
  let result;
  if (url.startsWith(proxyPrefix)) {
    const rest = url.slice(proxyPrefix.length);
    const q = rest.indexOf("?");
    const phash = extractPHash(url) || (q >= 0 ? rest.slice(0, q) : rest);
    result = SRCSET_WIDTHS.map((w) => `${proxyBase}/p/${phash}?format=${format}&mode=fit&width=${w} ${w}w`).join(", ");
  } else {
    result = SRCSET_WIDTHS.map((w) => {
      const proxied = proxifyForFormat(url, w, 0, format);
      return proxied ? `${proxied} ${w}w` : "";
    }).filter(Boolean).join(", ");
  }
  if (format !== "match" && result && !result.split(",").every((c) => c.includes(`format=${format}`))) {
    return "";
  }
  return result;
}
var STATIC_RASTER_PATH_EXT = /\.(?:jpe?g|png|webp)$/i;
var SIZED_PROXY_PATH = /^\/\d+x\d+\//;
function isPictureEligibleRawUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (isLegacySizedProxyUrl(rawUrl)) return true;
  const host = `${u.protocol}//${u.host}`;
  const isProxyHost = host === proxyBase || host === "https://images.ecency.com";
  if (isProxyHost && (u.pathname.startsWith("/p/") || u.pathname.startsWith("/u/") || SIZED_PROXY_PATH.test(u.pathname))) {
    return false;
  }
  return STATIC_RASTER_PATH_EXT.test(u.pathname);
}
function buildPictureSources(rawUrl) {
  if (!isPictureEligibleRawUrl(rawUrl)) return null;
  const avif = buildSrcSetForFormat(rawUrl, "avif");
  const webp = buildSrcSetForFormat(rawUrl, "webp");
  if (!avif || !webp) return null;
  return { avif, webp };
}

// src/methods/sanitize-html.method.ts
var EMBED_SRC_DATA_ATTRS = /* @__PURE__ */ new Set(["data-embed-src", "data-video-href"]);
var isSafeNavValue = (value) => {
  const trimmed = value.trim().replace(/[\t\n\r\f\v\0]/g, "").toLowerCase();
  if (!trimmed) return false;
  const isSafeScheme = /^(https?|mailto|hive|tel|web\+[a-z0-9.+-]+):/i.test(trimmed);
  const isRelative = /^(\/\/|\/[^/]?|#|\?|[a-z0-9._\-]+(\/|$))/i.test(trimmed);
  return isSafeScheme || isRelative;
};
var decodeEntities = (input) => input.replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec))).replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
var isProxyPSrcset = (srcset) => {
  const base = trimTrailingSlash(getProxyBase());
  const candidates = srcset.split(",").map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
  return candidates.length > 0 && candidates.every((url) => url.startsWith(`${base}/p/`));
};
function sanitizeHtml(html) {
  const cleaned = xss(html, {
    whiteList: ALLOWED_ATTRIBUTES,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ["style"],
    css: false,
    // block style attrs entirely for safety
    onTagAttr: (tag, name, value) => {
      const decoded = decodeEntities(value.trim());
      const decodedLower = decoded.toLowerCase();
      if (name.startsWith("on")) return "";
      if (tag === "img" && name === "src" && !/^https?:\/\//.test(decodedLower)) return "";
      if (tag === "img" && name === "srcset") {
        const candidates = decoded.split(",").map((c) => c.trim().split(/\s+/)[0]);
        if (candidates.some((url) => !/^https?:\/\//i.test(url))) return "";
      }
      if (tag === "source" && name === "srcset" && !isProxyPSrcset(decoded)) return "";
      if (tag === "source" && name === "type" && decodedLower !== "image/avif" && decodedLower !== "image/webp") return "";
      if ((tag === "video" || tag === "audio") && ["src", "poster"].includes(name) && !/^https?:\/\//.test(decodedLower)) return "";
      if (tag === "audio" && name === "preload" && decodedLower !== "metadata" && decodedLower !== "none") return "";
      if (tag === "img" && ["dynsrc", "lowsrc"].includes(name)) return "";
      if (tag === "span" && name === "class" && decoded.toLowerCase().trim() === "wr") return "";
      if (EMBED_SRC_DATA_ATTRS.has(name) && !isAllowedEmbedSrc(decoded)) return "";
      if (name === "data-href" && !isSafeNavValue(decoded)) return "";
      if (name === "id") {
        if (!ID_WHITELIST.test(decoded)) return "";
      }
      return void 0;
    }
  });
  return cleaned.replace(
    /<source\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,
    (t) => /\btype\s*=\s*["'](?:image\/avif|image\/webp)["']/i.test(t) ? t : ""
  );
}

// src/methods/img.method.ts
var IMAGE_SIZES = "(max-width: 768px) 100vw, 700px";
function wrapInPicture(el, rawUrl) {
  const parent = el.parentNode;
  if (!parent) return;
  if (parent.nodeName && parent.nodeName.toLowerCase() === "picture") return;
  const sources = buildPictureSources(rawUrl);
  if (!sources) return;
  const doc = el.ownerDocument;
  if (!doc) return;
  const sizes = el.getAttribute("sizes") || IMAGE_SIZES;
  const picture = doc.createElement("picture");
  const avif = doc.createElement("source");
  avif.setAttribute("type", "image/avif");
  avif.setAttribute("srcset", sources.avif);
  avif.setAttribute("sizes", sizes);
  const webp = doc.createElement("source");
  webp.setAttribute("type", "image/webp");
  webp.setAttribute("srcset", sources.webp);
  webp.setAttribute("sizes", sizes);
  parent.insertBefore(picture, el);
  picture.appendChild(avif);
  picture.appendChild(webp);
  picture.appendChild(el);
}
function img(el, state, forApp = true) {
  const src = el.getAttribute("src") || "";
  const decodedSrc = decodeImageSrc(src);
  ["onerror", "dynsrc", "lowsrc", "width", "height"].forEach((attr) => el.removeAttribute(attr));
  const isInvalid = !src || decodedSrc.startsWith("javascript") || decodedSrc.startsWith("vbscript") || decodedSrc === "x";
  if (isInvalid) {
    el.removeAttribute("src");
    el.removeAttribute("srcset");
    el.removeAttribute("sizes");
    return;
  }
  const isRelative = !/^https?:\/\//i.test(decodedSrc) && !decodedSrc.startsWith("/");
  if (isRelative) {
    el.removeAttribute("src");
    el.removeAttribute("srcset");
    el.removeAttribute("sizes");
    return;
  }
  el.setAttribute("itemprop", "image");
  const isLCP = state && !state.firstImageFound;
  if (isLCP) {
    el.setAttribute("loading", "eager");
    el.setAttribute("fetchpriority", "high");
    state.firstImageFound = true;
  } else {
    el.setAttribute("loading", "lazy");
    el.setAttribute("decoding", "async");
  }
  const cls = el.getAttribute("class") || "";
  const shouldReplace = !cls.includes("no-replace");
  const base = trimTrailingSlash(getProxyBase());
  const hasAlreadyProxied = src.startsWith(`${base}/p/`) || src.startsWith(`${base}/u/`) || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d+x\\d+/`).test(src);
  if (shouldReplace && !hasAlreadyProxied) {
    const proxified = proxifyImageSrc(decodedSrc, 0, 0, "match", { forceProxy: true });
    if (proxified) {
      el.setAttribute("src", proxified);
      const srcset = buildSrcSet(decodedSrc);
      if (srcset) {
        el.setAttribute("srcset", srcset);
        el.setAttribute("sizes", IMAGE_SIZES);
      }
      if (!forApp) {
        wrapInPicture(el, decodedSrc);
      }
    }
  } else if (shouldReplace && hasAlreadyProxied) {
    if (src.startsWith(`${base}/p/`)) {
      const srcset = buildSrcSet(src);
      if (srcset) {
        el.setAttribute("srcset", srcset);
        el.setAttribute("sizes", IMAGE_SIZES);
      }
    }
  }
}
function createImageHTML(src, isLCP, forApp = true) {
  const decoded = decodeImageSrc(src);
  const proxified = proxifyImageSrc(decoded, 0, 0, "match", { forceProxy: true });
  if (!proxified) return "";
  const base = trimTrailingSlash(getProxyBase());
  const isAlreadyProxied = decoded.startsWith(`${base}/u/`) || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d+x\\d+/`).test(decoded);
  const srcset = isAlreadyProxied ? "" : buildSrcSet(decoded);
  const loading = isLCP ? "eager" : "lazy";
  const fetch = isLCP ? 'fetchpriority="high"' : 'decoding="async"';
  const srcsetAttr = srcset ? `srcset="${srcset}" sizes="${IMAGE_SIZES}"` : "";
  const imgTag = `<img
    class="markdown-img-link"
    src="${proxified}"
    ${srcsetAttr}
    loading="${loading}"
    ${fetch}
    itemprop="image"
  />`;
  if (!forApp) {
    const sources = buildPictureSources(decoded);
    if (sources) {
      return `<picture><source type="image/avif" srcset="${sources.avif}" sizes="${IMAGE_SIZES}" /><source type="image/webp" srcset="${sources.webp}" sizes="${IMAGE_SIZES}" />${imgTag}</picture>`;
    }
  }
  return imgTag;
}

// src/methods/a.method.ts
var NOFOLLOW_REPUTATION_THRESHOLD = 40;
var FOLLOW_PAYOUT_THRESHOLD = 5;
function getExternalLinkRel(seoContext) {
  if (seoContext?.authorReputation !== void 0 && seoContext?.postPayout !== void 0 && seoContext.authorReputation >= NOFOLLOW_REPUTATION_THRESHOLD && seoContext.postPayout > FOLLOW_PAYOUT_THRESHOLD) {
    return "noopener";
  }
  return "nofollow ugc noopener";
}
function renderPlainVideoLink(el, provider, embedSrc, renderOptions) {
  const baseClass = `markdown-video-link markdown-video-link-${provider}`;
  el.setAttribute("class", baseClass);
  el.removeAttribute("href");
  el.textContent = "";
  el.setAttribute("data-embed-src", embedSrc);
  if (renderOptions?.embedVideosDirectly) {
    const wrapper = el.ownerDocument.createElement("span");
    wrapper.setAttribute("class", "er-embed-frame");
    wrapper.setAttribute("style", "display:block");
    const frame = el.ownerDocument.createElement("iframe");
    frame.setAttribute("src", embedSrc);
    frame.setAttribute("title", "Video player");
    frame.setAttribute(
      "allow",
      "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    frame.setAttribute("allowfullscreen", "");
    wrapper.appendChild(frame);
    el.appendChild(wrapper);
    el.setAttribute("class", `${baseClass} er-embed`);
    return;
  }
  const play = el.ownerDocument.createElement("span");
  play.setAttribute("class", "markdown-video-play");
  el.appendChild(play);
}
var normalizeValue = (value) => value ? value.trim() : "";
var matchesHref = (href, value) => {
  const normalizedHref = normalizeValue(href);
  if (!normalizedHref) {
    return false;
  }
  return normalizeValue(value) === normalizedHref;
};
var normalizeDisplayText = (text2) => {
  const beforeTrailingSlash = text2.trim().replace(/^https?:\/\/(www\.)?(ecency\.com|peakd\.com|hive\.blog|leofinance\.io|inleo\.io|snapie\.io|hivesuite\.app)/i, "").replace(/^\/+/, "").split("?")[0].replace(/#@.*$/i, "");
  return trimTrailingSlash(beforeTrailingSlash).toLowerCase();
};
var getInlineMeta = (el, href, author, permlink, communityTag) => {
  const textMatches = matchesHref(href, el.textContent);
  const titleMatches = matchesHref(href, el.getAttribute("title"));
  const normalizedDisplay = normalizeDisplayText(el.textContent || "");
  const normalizedTarget = `@${author}/${permlink}`.toLowerCase();
  const expectedDisplays = /* @__PURE__ */ new Set([normalizedTarget]);
  if (communityTag) {
    expectedDisplays.add(`${communityTag.toLowerCase()}/${normalizedTarget}`);
  }
  const sophisticatedMatch = normalizedDisplay === normalizedTarget || (communityTag ? normalizedDisplay === `${communityTag.toLowerCase()}/${normalizedTarget}` : false);
  return {
    textMatches,
    titleMatches,
    isInline: textMatches || titleMatches || sophisticatedMatch
  };
};
var addLineBreakBeforePostLink = (el, forApp, isInline) => {
  if (forApp && isInline && el.parentNode) {
    const br = el.ownerDocument.createElement("br");
    el.parentNode.insertBefore(br, el);
  }
};
function a(el, forApp, parentDomain = "ecency.com", seoContext, renderOptions) {
  if (!el || !el.parentNode) {
    return;
  }
  let href = el.getAttribute("href");
  if (!href) {
    return;
  }
  const trimmed = href.trim().replace(/[\t\n\r\f\v\0]/g, "").toLowerCase();
  const isSafeScheme = /^(https?|mailto|hive|tel|web\+[a-z0-9.+-]+):/i.test(trimmed);
  const isRelative = /^(\/\/|\/[^/]?|#|\?|[a-z0-9._\-]+(\/|$))/i.test(trimmed);
  if (!isSafeScheme && !isRelative) {
    el.removeAttribute("href");
    return;
  }
  const className = el.getAttribute("class");
  if (className && (["markdown-author-link", "markdown-tag-link"].includes(className) || className.includes("er-author") || className.includes("er-tag"))) {
    if (el.getAttribute("target")) {
      el.setAttribute("rel", getExternalLinkRel(seoContext));
    }
    return;
  }
  if (href.match(IMG_REGEX) && href.trim().replace(/&amp;/g, "&") === getSerializedInnerHTML(el).trim().replace(/&amp;/g, "&")) {
    const isLCP = false;
    const imgHTML = createImageHTML(href, isLCP, forApp);
    const doc = DOMParser.parseFromString(imgHTML, "text/html");
    const replaceNode = doc.body?.firstChild || doc.firstChild;
    if (replaceNode && el.parentNode) {
      const importedNode = el.ownerDocument.importNode(replaceNode, true);
      el.parentNode.replaceChild(importedNode, el);
    }
    return;
  }
  if (href.match(IPFS_REGEX) && href.trim().replace(/&amp;/g, "&") === getSerializedInnerHTML(el).trim().replace(/&amp;/g, "&") && href.indexOf("#") === -1) {
    if (forApp) {
      el.setAttribute("data-href", href);
      el.removeAttribute("href");
    }
    el.setAttribute("class", "markdown-img-link");
    removeChildNodes(el);
    const img2 = el.ownerDocument.createElement("img");
    img2.setAttribute("src", href);
    el.appendChild(img2);
    return;
  }
  const postMatch = href.match(POST_REGEX);
  if (postMatch && WHITE_LIST.includes(postMatch[1].replace(/^www\./, ""))) {
    el.setAttribute("class", "markdown-post-link");
    const tag = postMatch[2];
    const author = postMatch[3].replace("@", "");
    const permlink = sanitizePermlink(postMatch[4]);
    if (!isValidPermlink(permlink)) return;
    const inlineMeta = getInlineMeta(el, href, author, permlink);
    if (inlineMeta.textMatches) {
      el.textContent = `@${author}/${permlink}`;
    }
    const isInline = inlineMeta.isInline;
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-href", href);
      el.setAttribute("data-is-inline", "" + isInline);
      el.setAttribute("data-tag", tag);
      el.setAttribute("data-author", author);
      el.setAttribute("data-permlink", permlink);
    } else {
      const h = `/@${author}/${permlink}`;
      el.setAttribute("href", h);
      el.setAttribute("data-is-inline", "" + isInline);
    }
    addLineBreakBeforePostLink(el, forApp, isInline);
    return;
  }
  const mentionMatch = href.match(MENTION_REGEX);
  if (mentionMatch && WHITE_LIST.includes(mentionMatch[1].replace(/^www\./, "")) && mentionMatch.length === 3) {
    const _author = mentionMatch[2].replace("@", "");
    if (!isValidUsername(_author)) return;
    const author = _author.toLowerCase();
    el.setAttribute("class", "markdown-author-link");
    if (author.indexOf("/") === -1) {
      if (el.textContent === href) {
        el.textContent = `@${author}`;
      }
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-author", author);
      } else {
        const h = `/@${author}`;
        el.setAttribute("href", h);
      }
    }
    return;
  }
  const tpostMatch = href.match(INTERNAL_POST_TAG_REGEX);
  let isValidDomain = false;
  if (tpostMatch && tpostMatch.length === 4) {
    if (tpostMatch[1].indexOf("/") === 0) {
      isValidDomain = true;
    } else if (tpostMatch[1].includes(".")) {
      const domain = tpostMatch[1].replace(/^https?:\/\//, "").replace(/^www\./, "");
      isValidDomain = WHITE_LIST.includes(domain);
    }
  }
  if (isValidDomain) {
    const pathSegment = tpostMatch[3].split("?")[0];
    if (SECTION_LIST.some((v) => pathSegment === v || pathSegment.startsWith(v + "/"))) {
      el.setAttribute("class", "markdown-profile-link");
      const author = tpostMatch[2].replace("@", "").toLowerCase();
      const section = tpostMatch[3];
      if (!isValidPermlink(section)) return;
      if (el.textContent === href) {
        el.textContent = `@${author}/${section}`;
      }
      if (forApp) {
        const ha = `https://ecency.com/@${author}/${section}`;
        el.setAttribute("href", ha);
      } else {
        const h = `/@${author}/${section}`;
        el.setAttribute("href", h);
      }
      return;
    } else {
      let tag = "post";
      if (tpostMatch[1] && !tpostMatch[1].includes(".")) {
        [, tag] = tpostMatch;
        tag = tag.replace("/", "");
      }
      el.setAttribute("class", "markdown-post-link");
      const author = tpostMatch[2].replace("@", "");
      const permlink = sanitizePermlink(tpostMatch[3]);
      if (!isValidPermlink(permlink)) return;
      const communityTag = tag.toLowerCase().startsWith("hive-") ? tag : void 0;
      const inlineMeta = getInlineMeta(el, href, author, permlink, communityTag);
      if (inlineMeta.textMatches) {
        el.textContent = `@${author}/${permlink}`;
      }
      const isInline = inlineMeta.isInline;
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-href", href);
        el.setAttribute("data-is-inline", "" + isInline);
        el.setAttribute("data-tag", tag);
        el.setAttribute("data-author", author);
        el.setAttribute("data-permlink", permlink);
      } else {
        const h = `/@${author}/${permlink}`;
        el.setAttribute("href", h);
        el.setAttribute("data-is-inline", "" + isInline);
      }
      addLineBreakBeforePostLink(el, forApp, isInline);
      return;
    }
  }
  const imentionMatch = href.match(INTERNAL_MENTION_REGEX);
  if (imentionMatch) {
    const _author = imentionMatch[0].replace("/@", "");
    if (!isValidUsername(_author)) return;
    const author = _author.toLowerCase();
    el.setAttribute("class", "markdown-author-link");
    if (author.indexOf("/") === -1) {
      if (el.textContent === href) {
        el.textContent = `@${author}`;
      }
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-author", author);
      } else {
        const h = `/@${author}`;
        el.setAttribute("href", h);
      }
    }
    return;
  }
  const cpostMatch = href.match(INTERNAL_POST_REGEX);
  if (cpostMatch && cpostMatch.length === 3 && cpostMatch[1].indexOf("@") === 0) {
    const pathSegment2 = cpostMatch[2].split("?")[0];
    if (SECTION_LIST.some((v) => pathSegment2 === v || pathSegment2.startsWith(v + "/"))) {
      el.setAttribute("class", "markdown-profile-link");
      const author = cpostMatch[1].replace("@", "").toLowerCase();
      const section = cpostMatch[2];
      if (el.textContent === href) {
        el.textContent = `@${author}/${section}`;
      }
      if (forApp) {
        const ha = `https://ecency.com/@${author}/${section}`;
        el.setAttribute("href", ha);
      } else {
        const h = `/@${author}/${section}`;
        el.setAttribute("href", h);
      }
      return;
    } else {
      el.setAttribute("class", "markdown-post-link");
      const tag = "post";
      const author = cpostMatch[1].replace("@", "");
      const permlink = sanitizePermlink(cpostMatch[2]);
      if (!isValidPermlink(permlink)) return;
      const inlineMeta = getInlineMeta(el, href, author, permlink);
      if (inlineMeta.textMatches) {
        el.textContent = `@${author}/${permlink}`;
      }
      const isInline = inlineMeta.isInline;
      if (forApp) {
        el.removeAttribute("href");
        el.setAttribute("data-href", href);
        el.setAttribute("data-is-inline", "" + isInline);
        el.setAttribute("data-tag", tag);
        el.setAttribute("data-author", author);
        el.setAttribute("data-permlink", permlink);
      } else {
        const h = `/@${author}/${permlink}`;
        el.setAttribute("href", h);
        el.setAttribute("data-is-inline", "" + isInline);
      }
      addLineBreakBeforePostLink(el, forApp, isInline);
      return;
    }
  }
  const topicMatch = href.match(TOPIC_REGEX);
  if (topicMatch && WHITE_LIST.includes(topicMatch[1].replace(/^www\./, "")) && topicMatch.length === 4) {
    el.setAttribute("class", "markdown-tag-link");
    const filter = topicMatch[2];
    const tag = topicMatch[3];
    if (el.textContent === href) {
      el.textContent = `/${filter}/${tag}`;
    }
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-filter", filter);
      el.setAttribute("data-tag", tag);
    } else {
      const h = `/${filter}/${tag}`;
      el.setAttribute("href", h);
    }
    return;
  }
  const itopicMatch = href.match(INTERNAL_TOPIC_REGEX);
  if (itopicMatch && itopicMatch.length === 3) {
    el.setAttribute("class", "markdown-tag-link");
    const filter = itopicMatch[1];
    const tag = itopicMatch[2];
    if (el.textContent === href) {
      el.textContent = `/${filter}/${tag}`;
    }
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-filter", filter);
      el.setAttribute("data-tag", tag);
    } else {
      const h = `/${filter}/${tag}`;
      el.setAttribute("href", h);
    }
    return;
  }
  const comMatch = href.match(CUSTOM_COMMUNITY_REGEX);
  if (comMatch && WHITE_LIST.includes(comMatch[1].replace(/^www\./, ""))) {
    el.setAttribute("class", "markdown-community-link");
    const community = comMatch[2];
    let filter = comMatch[3].substring(1);
    if (!filter) filter = "created";
    if (filter === "about" || filter === "discord") {
      filter = "created";
    }
    if (el.textContent === href) {
      el.textContent = `${filter}/${community}`;
    }
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-community", community);
      el.setAttribute("data-filter", filter);
    } else {
      const h = `/${filter}/${community}`;
      el.setAttribute("href", h);
    }
    return;
  }
  const cccMatch = href.match(CCC_REGEX);
  if (cccMatch && WHITE_LIST.includes(cccMatch[1].replace(/^www\./, ""))) {
    el.setAttribute("class", "markdown-post-link");
    const tag = "ccc";
    const author = cccMatch[2].replace("@", "");
    const permlink = sanitizePermlink(cccMatch[3]);
    if (!isValidPermlink(permlink)) return;
    const inlineMeta = getInlineMeta(el, href, author, permlink);
    if (inlineMeta.textMatches) {
      el.textContent = `@${author}/${permlink}`;
    }
    const isInline = inlineMeta.isInline;
    if (forApp) {
      el.removeAttribute("href");
      el.setAttribute("data-href", href);
      el.setAttribute("data-is-inline", "" + isInline);
      el.setAttribute("data-tag", tag);
      el.setAttribute("data-author", author);
      el.setAttribute("data-permlink", permlink);
    } else {
      const h = `/@${author}/${permlink}`;
      el.setAttribute("href", h);
      el.setAttribute("data-is-inline", "" + isInline);
    }
    addLineBreakBeforePostLink(el, forApp, isInline);
    return;
  }
  const BCmatch = href.match(BITCHUTE_REGEX);
  if (BCmatch && BCmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "bitchute", `https://www.bitchute.com/embed/${BCmatch[1]}/`, renderOptions);
    return;
  }
  const RBmatch = href.match(RUMBLE_REGEX);
  if (RBmatch && RBmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "rumble", `https://www.rumble.com/embed/${RBmatch[1]}/?pub=4`, renderOptions);
    return;
  }
  const BNmatch = href.match(BRIGHTEON_REGEX);
  if (BNmatch && BNmatch[2] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "brighteon", `https://www.brighteon.com/embed/${BNmatch[2]}`, renderOptions);
    return;
  }
  const ODmatch = href.match(ODYSEE_WATCH_REGEX);
  if (ODmatch && ODmatch[1] && el.textContent.trim() === href) {
    renderPlainVideoLink(el, "odysee", `https://odysee.com/$/embed/${ODmatch[1]}`, renderOptions);
    return;
  }
  let match = href.match(YOUTUBE_REGEX);
  if (match && match[1] && el.textContent.trim() === href) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-youtube");
    el.removeAttribute("href");
    const vid = match[1];
    const thumbnail = proxifyImageSrc(`https://img.youtube.com/vi/${vid.split("?")[0]}/hqdefault.jpg`, 0, 0, "match");
    const embedSrc = `https://www.youtube.com/embed/${vid}?autoplay=1`;
    el.textContent = "";
    el.setAttribute("data-embed-src", embedSrc);
    el.setAttribute("data-youtube", vid);
    const startTime = extractYtStartTime(href);
    if (startTime) {
      el.setAttribute("data-start-time", startTime);
    }
    if (renderOptions?.embedVideosDirectly) {
      const directSrc = `https://www.youtube.com/embed/${vid}`;
      const wrapper = el.ownerDocument.createElement("span");
      wrapper.setAttribute("class", "er-youtube-frame");
      wrapper.setAttribute("style", "display:block");
      const iframe2 = el.ownerDocument.createElement("iframe");
      iframe2.setAttribute("class", "youtube-player");
      iframe2.setAttribute("src", directSrc);
      iframe2.setAttribute("title", "YouTube video");
      iframe2.setAttribute("allow", "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share");
      iframe2.setAttribute("allowfullscreen", "");
      wrapper.appendChild(iframe2);
      el.appendChild(wrapper);
      el.setAttribute("class", "markdown-video-link markdown-video-link-youtube er-youtube");
    } else {
      const thumbImg = el.ownerDocument.createElement("img");
      thumbImg.setAttribute("class", "no-replace video-thumbnail");
      thumbImg.setAttribute("itemprop", "thumbnailUrl");
      thumbImg.setAttribute("src", thumbnail);
      const play = el.ownerDocument.createElement("span");
      play.setAttribute("class", "markdown-video-play");
      el.appendChild(thumbImg);
      el.appendChild(play);
    }
    return;
  }
  match = href.match(VIMEO_REGEX);
  if (match && match[3] && href === el.textContent) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-vimeo");
    el.removeAttribute("href");
    const embedSrc = `https://player.vimeo.com/video/${match[3]}`;
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("allowfullscreen", "true");
    ifr.setAttribute("src", embedSrc);
    el.appendChild(ifr);
    return;
  }
  match = href.match(TWITCH_REGEX);
  if (match && match[2] && href === el.textContent) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-twitch");
    el.removeAttribute("href");
    let embedSrc = "";
    const parent = parentDomain ? `&parent=${parentDomain}` : "";
    if (match[1] === void 0) {
      embedSrc = `https://player.twitch.tv/?channel=${match[2]}${parent}`;
    } else if (match[1] === "videos") {
      embedSrc = `https://player.twitch.tv/?video=${match[2]}${parent}`;
    } else {
      embedSrc = `https://player.twitch.tv/?channel=${match[2]}${parent}`;
    }
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("allowfullscreen", "true");
    ifr.setAttribute("src", embedSrc);
    el.appendChild(ifr);
    return;
  }
  if (el.textContent.trim() === href) {
    SPOTIFY_REGEX.lastIndex = 0;
    match = SPOTIFY_REGEX.exec(href);
    if (match && match[1]) {
      el.setAttribute("class", "markdown-audio-link markdown-audio-link-spotify");
      el.removeAttribute("href");
      const embedSrc = `https://open.spotify.com/embed/playlist/${match[1]}`;
      el.textContent = "";
      const ifr = el.ownerDocument.createElement("iframe");
      ifr.setAttribute("frameborder", "0");
      ifr.setAttribute("allowfullscreen", "true");
      ifr.setAttribute("src", embedSrc);
      ifr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
      el.appendChild(ifr);
      return;
    }
  }
  match = href.match(LOOM_REGEX);
  if (match && match[2] && el.textContent.trim() === href) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-loom");
    el.removeAttribute("href");
    const embedSrc = `https://www.loom.com/embed/${match[2]}`;
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("allowfullscreen", "true");
    ifr.setAttribute("src", embedSrc);
    ifr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.appendChild(ifr);
    return;
  }
  const imgEls = el.getElementsByTagName("img");
  if (imgEls.length === 1 || el.textContent.trim() === href) {
    D_TUBE_REGEX.lastIndex = 0;
    match = D_TUBE_REGEX.exec(href);
    if (match && match[2] && match[3]) {
      el.setAttribute("class", "markdown-video-link markdown-video-link-dtube");
      el.removeAttribute("href");
      const videoHref = `https://emb.d.tube/#!/${match[2]}/${match[3]}`;
      el.setAttribute("data-embed-src", videoHref);
      if (imgEls.length === 1) {
        const src = imgEls[0].getAttribute("src");
        if (src) {
          const thumbnail = proxifyImageSrc(src.replace(/\s+/g, ""), 0, 0, "match");
          const thumbImg = el.ownerDocument.createElement("img");
          thumbImg.setAttribute("class", "no-replace video-thumbnail");
          thumbImg.setAttribute("itemprop", "thumbnailUrl");
          thumbImg.setAttribute("src", thumbnail);
          el.appendChild(thumbImg);
          el.removeChild(imgEls[0]);
        }
      } else {
        el.textContent = "";
      }
      const play = el.ownerDocument.createElement("span");
      play.setAttribute("class", "markdown-video-play");
      el.appendChild(play);
      return;
    }
  }
  D_TUBE_REGEX2.lastIndex = 0;
  match = D_TUBE_REGEX2.exec(href);
  if (match && match[2] && match[3]) {
    el.setAttribute("class", "markdown-video-link markdown-video-link-dtube");
    el.removeAttribute("href");
    el.textContent = "";
    const videoHref = `https://emb.d.tube/#!/${match[2]}/${match[3]}`;
    el.setAttribute("data-embed-src", videoHref);
    const play = el.ownerDocument.createElement("span");
    play.setAttribute("class", "markdown-video-play");
    el.appendChild(play);
    return;
  }
  match = href.match(SPEAK_REGEX);
  if (match) {
    const imgEls2 = el.getElementsByTagName("img");
    if (imgEls2.length === 1 || el.textContent.trim() === href) {
      if ((match[1] || match[2]) && match[3]) {
        const videoHref = `https://play.3speak.tv/watch?v=${match[3]}&mode=iframe`;
        el.setAttribute("class", "markdown-video-link markdown-video-link-speak");
        el.removeAttribute("href");
        el.setAttribute("data-embed-src", videoHref);
        if (el.textContent.trim() === href) {
          el.textContent = "";
        }
        if (renderOptions?.embedVideosDirectly) {
          const directSrc = `${videoHref}&autoplay=false`;
          const wrapper = el.ownerDocument.createElement("span");
          wrapper.setAttribute("class", "er-speak-frame");
          wrapper.setAttribute("style", "display:block");
          const iframe2 = el.ownerDocument.createElement("iframe");
          iframe2.setAttribute("class", "speak-iframe");
          iframe2.setAttribute("src", directSrc);
          iframe2.setAttribute("title", "3Speak video");
          iframe2.setAttribute("allow", "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share");
          iframe2.setAttribute("allowfullscreen", "");
          wrapper.appendChild(iframe2);
          el.appendChild(wrapper);
          el.setAttribute("class", "markdown-video-link markdown-video-link-speak er-speak");
        } else {
          if (imgEls2.length === 1) {
            const src = imgEls2[0].getAttribute("src");
            if (src) {
              const thumbnail = proxifyImageSrc(src.replace(/\s+/g, ""), 0, 0, "match");
              const thumbImg = el.ownerDocument.createElement("img");
              thumbImg.setAttribute("class", "no-replace video-thumbnail");
              thumbImg.setAttribute("itemprop", "thumbnailUrl");
              thumbImg.setAttribute("src", thumbnail);
              el.appendChild(thumbImg);
              el.removeChild(imgEls2[0]);
            }
          }
          const play = el.ownerDocument.createElement("span");
          play.setAttribute("class", "markdown-video-play");
          el.appendChild(play);
        }
        return;
      }
    }
  }
  if (href.match(SPEAK_AUDIO_REGEX) && el.textContent.trim() === href) {
    el.setAttribute("class", "markdown-audio-link markdown-audio-link-speak");
    el.removeAttribute("href");
    const embedSrc = /[?&]iframe=/.test(href) ? href : `${href}&iframe=1`;
    const finalSrc = /[?&]mode=/.test(embedSrc) ? embedSrc : `${embedSrc}&mode=compact`;
    el.textContent = "";
    const ifr = el.ownerDocument.createElement("iframe");
    ifr.setAttribute("frameborder", "0");
    ifr.setAttribute("src", finalSrc);
    ifr.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.appendChild(ifr);
    return;
  }
  if (href.match(LIKETU_AUDIO_REGEX)) {
    el.setAttribute("class", "markdown-audio-link markdown-audio-link-liketu");
    el.removeAttribute("href");
    el.textContent = "";
    const audio = el.ownerDocument.createElement("audio");
    audio.setAttribute("controls", "");
    audio.setAttribute("preload", "metadata");
    audio.setAttribute("src", href);
    el.appendChild(audio);
    return;
  }
  const matchT = href.match(TWITTER_REGEX);
  if (matchT && el.textContent.trim() === href) {
    TWITTER_REGEX.lastIndex = 0;
    const e = TWITTER_REGEX.exec(href);
    if (e) {
      const url = stripHtmlTags(e[0]);
      const author = stripHtmlTags(e[1]);
      const blockquote = el.ownerDocument.createElement("blockquote");
      blockquote.setAttribute("class", "twitter-tweet");
      const p2 = el.ownerDocument.createElement("p");
      p2.textContent = url;
      const textNode = el.ownerDocument.createTextNode("- ");
      const a2 = el.ownerDocument.createElement("a");
      a2.setAttribute("href", url);
      a2.textContent = author;
      blockquote.appendChild(p2);
      blockquote.appendChild(textNode);
      blockquote.appendChild(a2);
      if (el.parentNode) {
        el.parentNode.replaceChild(blockquote, el);
      }
      return;
    }
  }
  if (href.indexOf("https://hivesigner.com/sign/account-witness-vote?witness=") === 0 && forApp) {
    el.setAttribute("class", "markdown-witnesses-link");
    el.setAttribute("data-href", href);
    el.removeAttribute("href");
    return;
  }
  if (href.indexOf("hivesigner.com/sign/update-proposal-votes?proposal_ids") >= 0 && forApp) {
    try {
      const m = decodeURI(href).match(/proposal_ids=\[(\d+)]/);
      if (m) {
        el.setAttribute("class", "markdown-proposal-link");
        el.setAttribute("data-href", href);
        el.setAttribute("data-proposal", m[1]);
        el.removeAttribute("href");
        return;
      }
    } catch (e) {
    }
  }
  el.setAttribute("class", "markdown-external-link");
  if (!/^((#)|(mailto:)|(\/(?!\/))|(((steem|hive|esteem|ecency|https?):)?\/\/))/i.test(href)) {
    href = `https://${href}`;
  }
  if (forApp) {
    el.setAttribute("data-href", href);
    const match2 = href.match(YOUTUBE_REGEX);
    if (match2 && match2[1]) {
      const vid = match2[1];
      el.setAttribute("data-youtube", vid);
      const startTime = extractYtStartTime(href);
      if (startTime) {
        el.setAttribute("data-start-time", startTime);
      }
    }
    el.removeAttribute("href");
  } else {
    const matchS = href.trim().startsWith("#");
    if (matchS) {
      el.setAttribute("class", "markdown-internal-link");
    } else {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", getExternalLinkRel(seoContext));
    }
    el.setAttribute("href", href);
  }
}

// src/methods/iframe.method.ts
function iframe(el, parentDomain = "ecency.com", forApp = false, renderOptions) {
  if (!el || !el.parentNode) {
    return;
  }
  const src = el.getAttribute("src");
  if (!src) {
    el.parentNode.removeChild(el);
    return;
  }
  if (src.match(YOUTUBE_EMBED_REGEX)) {
    el.setAttribute("src", stripQueryString(src));
    return;
  }
  if (src.match(BITCHUTE_REGEX)) {
    return;
  }
  const m = src.match(VIMEO_EMBED_REGEX);
  if (m && m.length === 2) {
    const s = `https://player.vimeo.com/video/${m[1]}`;
    el.setAttribute("src", s);
    return;
  }
  if (src.match(TWITCH_EMBED_REGEX)) {
    let s = src;
    if (!s.includes("parent=")) {
      const separator = s.includes("?") ? "&" : "?";
      s = `${s}${separator}parent=${parentDomain}`;
    }
    if (!s.includes("autoplay=")) {
      const separator = s.includes("?") ? "&" : "?";
      s = `${s}${separator}autoplay=false`;
    }
    el.setAttribute("src", s);
    return;
  }
  if (src.match(SPEAK_EMBED_REGEX)) {
    let normalizedSrc = src.replace(/(?:play\.)?3speak\.[a-z]+/i, "play.3speak.tv");
    normalizedSrc = normalizedSrc.replace(/\/embed\?/, "/watch?");
    const hasMode = /[?&]mode=/.test(normalizedSrc);
    if (!hasMode) {
      normalizedSrc = `${normalizedSrc}&mode=iframe`;
    }
    const hasAutoplay = /[?&]autoplay=/.test(normalizedSrc);
    let s;
    if (renderOptions?.embedVideosDirectly) {
      s = hasAutoplay ? normalizedSrc.replace(/([?&]autoplay=)[^&]*/i, "$1false") : `${normalizedSrc}&autoplay=false`;
    } else {
      s = hasAutoplay ? normalizedSrc : `${normalizedSrc}&autoplay=true`;
    }
    if (forApp && !/[?&]layout=/.test(s)) {
      s = `${s}&layout=mobile`;
    }
    el.setAttribute("src", s);
    el.setAttribute("class", "speak-iframe");
    return;
  }
  if (src.match(SPEAK_AUDIO_EMBED_REGEX)) {
    let normalizedSrc = src;
    if (!/[?&]iframe=/.test(normalizedSrc)) {
      normalizedSrc = `${normalizedSrc}&iframe=1`;
    }
    if (!/[?&]mode=/.test(normalizedSrc)) {
      normalizedSrc = `${normalizedSrc}&mode=compact`;
    }
    el.setAttribute("src", normalizedSrc);
    el.setAttribute("class", "speak-audio-iframe");
    el.setAttribute("frameborder", "0");
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    return;
  }
  if (src.match(SPOTIFY_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.setAttribute("frameborder", "0");
    return;
  }
  if (src.match(SOUNDCLOUD_EMBED_REGEX)) {
    const match = src.match(/url=(.+?)(?:&|$)/);
    if (match && match[1]) {
      const s = `https://w.soundcloud.com/player/?url=${match[1]}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
      el.setAttribute("src", s);
    }
    return;
  }
  if (src.match(D_TUBE_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin");
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return;
  }
  if (src.match(VIMM_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return;
  }
  if (src.match(DAPPLR_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin");
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return;
  }
  if (src.match(TRUVVL_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    el.setAttribute("frameborder", "0");
    el.setAttribute("class", "portrait-embed");
    el.setAttribute("allowfullscreen", "true");
    return;
  }
  if (src.match(LBRY_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return;
  }
  if (src.match(ODYSEE_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return;
  }
  if (src.match(SKATEHIVE_IPFS_REGEX)) {
    const video = el.ownerDocument.createElement("video");
    video.setAttribute("src", src);
    video.setAttribute("controls", "");
    el.parentNode.insertBefore(video, el);
    el.parentNode.removeChild(el);
    return;
  }
  if (src.match(SKATEHYPE_EMBED_REGEX)) {
    const normalizedSrc = src.replace(/^(https?:)?\/\//i, "https://");
    el.setAttribute("src", normalizedSrc);
    el.setAttribute("frameborder", "0");
    el.setAttribute("allowfullscreen", "true");
    return;
  }
  if (src.match(ARCH_REGEX)) {
    el.setAttribute("src", src);
    return;
  }
  if (src.match(RUMBLE_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return;
  }
  if (src.match(BRIGHTEON_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return;
  }
  if (src.match(BRAND_NEW_TUBE_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return;
  }
  if (src.match(LOOM_EMBED_REGEX)) {
    el.setAttribute("src", src);
    el.setAttribute("frameborder", "0");
    return;
  }
  if (src.match(AUREAL_EMBED_REGEX)) {
    const normalizedSrc = src.startsWith("//") ? `https:${src}` : src;
    el.setAttribute("src", normalizedSrc);
    el.setAttribute("frameborder", "0");
    return;
  }
  const replaceNode = el.ownerDocument.createElement("div");
  replaceNode.setAttribute("class", "unsupported-iframe");
  replaceNode.textContent = `(Unsupported ${src})`;
  if (el.parentNode) {
    el.parentNode.insertBefore(replaceNode, el);
    el.parentNode.removeChild(el);
  }
}

// src/methods/p.method.ts
function p(el) {
  const dir = el.getAttribute("dir");
  if (!dir) {
    el.setAttribute("dir", "auto");
  }
}

// src/methods/linkify.method.ts
function linkify(content, forApp, renderOptions) {
  content = content.replace(/(^|\s|>)(#[-a-z\d]+)/gi, (tag) => {
    if (/#[\d]+$/.test(tag)) return tag;
    const preceding = /^\s|>/.test(tag) ? tag[0] : "";
    tag = tag.replace(/^>/, "");
    const tag2 = tag.trim().substring(1);
    const tagLower = tag2.toLowerCase();
    if (!forApp) {
      return `${preceding}<a class="er-tag er-tag-link" href="/trending/${tagLower}">${tag.trim()}</a>`;
    }
    return `${preceding}<a class="markdown-tag-link" data-tag="${tagLower}">${tag.trim()}</a>`;
  });
  const authorPlaceholders = [];
  content = content.replace(
    /(^|[^a-zA-Z0-9_!#$%&*@＠/]|(^|[^a-zA-Z0-9_+~.-/]))[@＠]([a-z][-.a-z\d^/]+[a-z\d])/gi,
    (match, preceeding1, preceeding2, user) => {
      const userLower = user.toLowerCase();
      const preceedings = (preceeding1 || "") + (preceeding2 || "");
      if (userLower.indexOf("/") === -1 && isValidUsername(user)) {
        if (!forApp) {
          const avatarSrc = `${getProxyBase()}/u/${userLower}/avatar/small`;
          const html = `${preceedings}<a class="er-author er-author-link" href="/@${userLower}"><img class="er-author-link-image" src="${avatarSrc}" alt="${userLower}"/>@${userLower}</a>`;
          const placeholder = `\u200C${authorPlaceholders.length}\u200C`;
          authorPlaceholders.push({ placeholder, html });
          return placeholder;
        }
        return `${preceedings}<a class="markdown-author-link" data-author="${userLower}">@${user}</a>`;
      } else {
        return match;
      }
    }
  );
  content = content.replace(
    /(^|\s)\/([a-z0-9-]+)\/@([\w.\d-]+)\/(\S+)/gi,
    (match, preceding, tag, author, p3) => {
      const authorLower = author.toLowerCase();
      if (!isValidUsername(authorLower)) return match;
      const permlink = sanitizePermlink(p3);
      if (!isValidPermlink(permlink)) return match;
      if (SECTION_LIST.includes(permlink)) {
        const attrs = forApp ? `href="https://ecency.com/@${authorLower}/${permlink}"` : `href="/@${authorLower}/${permlink}"`;
        return `${preceding}<a class="markdown-profile-link" ${attrs}>@${authorLower}/${permlink}</a>`;
      } else {
        const attrs = forApp ? `data-author="${authorLower}" data-tag="${tag}" data-permlink="${permlink}"` : `href="/@${authorLower}/${permlink}"`;
        return `${preceding}<a class="markdown-post-link" ${attrs}>@${authorLower}/${permlink}</a>`;
      }
    }
  );
  content = content.replace(
    /((^|\s)\/@[\w.\d-]+)\/(\S+)/gi,
    (match, u, _p1, p3) => {
      const uu = u.trim().toLowerCase().replace("/@", "").replace("@", "");
      const permlink = sanitizePermlink(p3);
      if (!isValidPermlink(permlink)) return match;
      if (SECTION_LIST.includes(permlink)) {
        const attrs = forApp ? `href="https://ecency.com/@${uu}/${permlink}"` : `href="/@${uu}/${permlink}"`;
        return ` <a class="markdown-profile-link" ${attrs}>@${uu}/${permlink}</a>`;
      } else {
        const attrs = forApp ? `data-author="${uu}" data-tag="post" data-permlink="${permlink}"` : `href="/@${uu}/${permlink}"`;
        return ` <a class="markdown-post-link" ${attrs}>@${uu}/${permlink}</a>`;
      }
    }
  );
  let firstImageUsed = false;
  content = content.replace(IMG_REGEX, (imglink) => {
    const isLCP = !firstImageUsed;
    firstImageUsed = true;
    return createImageHTML(imglink, isLCP, forApp);
  });
  authorPlaceholders.forEach(({ placeholder, html }) => {
    content = content.replace(placeholder, html);
  });
  return content;
}

// src/methods/text.method.ts
function hasAncestor(node, tagNames) {
  let current = node.parentNode;
  while (current) {
    if (tagNames.includes(current.nodeName.toLowerCase())) {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}
function text(node, forApp, renderOptions) {
  if (!node || !node.parentNode) {
    return;
  }
  if (hasAncestor(node, ["a", "code", "pre"])) {
    return;
  }
  const nodeValue = node.nodeValue || "";
  const linkified = linkify(nodeValue, forApp);
  if (linkified !== nodeValue) {
    const doc = DOMParser.parseFromString(
      `<span class="wr">${linkified}</span>`,
      "text/html"
    );
    const replaceNode = doc.body?.firstChild || doc.firstChild;
    if (replaceNode) {
      node.parentNode.insertBefore(replaceNode, node);
      node.parentNode.removeChild(node);
    }
    return;
  }
  if (nodeValue.match(IMG_REGEX)) {
    const isLCP = false;
    const imageHTML = createImageHTML(nodeValue, isLCP, forApp);
    const doc = DOMParser.parseFromString(imageHTML, "text/html");
    const replaceNode = doc.body?.firstChild || doc.firstChild;
    if (replaceNode) {
      node.parentNode.replaceChild(replaceNode, node);
    }
    return;
  }
  if (nodeValue.match(YOUTUBE_REGEX)) {
    const e = YOUTUBE_REGEX.exec(nodeValue);
    if (e && e[1]) {
      const vid = e[1];
      const thumbnail = proxifyImageSrc(`https://img.youtube.com/vi/${vid.split("?")[0]}/hqdefault.jpg`, 0, 0, "match");
      const embedSrc = `https://www.youtube.com/embed/${vid}?autoplay=1`;
      const startTime = extractYtStartTime(nodeValue);
      const container = node.ownerDocument.createElement("p");
      const anchor = node.ownerDocument.createElement("a");
      anchor.setAttribute("class", "markdown-video-link markdown-video-link-youtube");
      anchor.setAttribute("data-embed-src", embedSrc);
      anchor.setAttribute("data-youtube", vid);
      if (startTime) {
        anchor.setAttribute("data-start-time", startTime);
      }
      const thumbImg = node.ownerDocument.createElement("img");
      thumbImg.setAttribute("class", "no-replace video-thumbnail");
      thumbImg.setAttribute("src", thumbnail);
      anchor.appendChild(thumbImg);
      const play = node.ownerDocument.createElement("span");
      play.setAttribute("class", "markdown-video-play");
      anchor.appendChild(play);
      container.appendChild(anchor);
      node.parentNode.replaceChild(container, node);
      return;
    }
  }
  if (nodeValue && typeof nodeValue === "string") {
    const postMatch = nodeValue.trim().match(POST_REGEX);
    if (postMatch && WHITE_LIST.includes(postMatch[1].replace(/^www\./, ""))) {
      const tag = postMatch[2];
      const author = postMatch[3].replace("@", "");
      const permlink = sanitizePermlink(postMatch[4]);
      if (!tag || !/^[a-z0-9_-]+$/i.test(tag)) return;
      if (!isValidUsername(author)) return;
      if (!isValidPermlink(permlink)) return;
      const attrs = forApp ? `data-tag="${tag}" data-author="${author}" data-permlink="${permlink}" class="markdown-post-link"` : `class="markdown-post-link" href="/@${author}/${permlink}"`;
      const doc = DOMParser.parseFromString(
        `<a ${attrs}>/@${author}/${permlink}</a>`,
        "text/html"
      );
      const replaceNode = doc.body?.firstChild || doc.firstChild;
      if (replaceNode) {
        node.parentNode.replaceChild(replaceNode, node);
      }
    }
  }
}

// src/methods/traverse.method.ts
function traverse(node, forApp, depth = 0, state = { firstImageFound: false }, parentDomain = "ecency.com", seoContext, renderOptions) {
  if (!node || !node.childNodes) {
    return;
  }
  let child = node.firstChild;
  while (child) {
    const next = child.nextSibling;
    const prev = child.previousSibling;
    if (child.nodeName.toLowerCase() === "a") {
      a(child, forApp, parentDomain, seoContext, renderOptions);
    }
    if (child.nodeName.toLowerCase() === "iframe") {
      iframe(child, parentDomain, forApp, renderOptions);
    }
    if (child.nodeName === "#text") {
      text(child, forApp);
    }
    if (child.nodeName.toLowerCase() === "img") {
      img(child, state, forApp);
    }
    if (child.nodeName.toLowerCase() === "p") {
      p(child);
    }
    if (child.parentNode) {
      traverse(child, forApp, depth + 1, state, parentDomain, seoContext, renderOptions);
    } else {
      const possibleReplacement = next ? next.previousSibling : node.lastChild;
      if (possibleReplacement && possibleReplacement !== prev && possibleReplacement.parentNode === node) {
        traverse(possibleReplacement, forApp, depth + 1, state, parentDomain, seoContext, renderOptions);
      }
    }
    child = next;
  }
}

// src/methods/clean-reply.method.ts
function cleanReply(s) {
  return (s ? s.split("\n").filter((item) => item.toLowerCase().includes("posted using [partiko") === false).filter((item) => item.toLowerCase().includes("posted using [dapplr") === false).filter((item) => item.toLowerCase().includes("posted using [leofinance") === false).filter((item) => item.toLowerCase().includes("posted via [neoxian") === false).filter((item) => item.toLowerCase().includes("posted using [neoxian") === false).filter((item) => item.toLowerCase().includes("posted via [first context") === false).filter((item) => item.toLowerCase().includes("posted with [stemgeeks") === false).filter((item) => item.toLowerCase().includes("posted using [bilpcoin") === false).filter((item) => item.toLowerCase().includes("posted using [inleo") === false).filter((item) => item.toLowerCase().includes("posted using [sportstalksocial]") === false).filter((item) => item.toLowerCase().includes("<center><sub>[posted using aeneas.blog") === false).filter((item) => item.toLowerCase().includes("<center><sub>posted via [proofofbrain.io") === false).filter((item) => item.toLowerCase().includes("<center>posted on [hypnochain") === false).filter((item) => item.toLowerCase().includes("<center><sub>posted via [weedcash.network") === false).filter((item) => item.toLowerCase().includes("<center>posted on [naturalmedicine.io") === false).filter((item) => item.toLowerCase().includes("<center><sub>posted via [musicforlife.io") === false).filter((item) => item.toLowerCase().includes("if the truvvl embed is unsupported by your current frontend, click this link to view this story") === false).filter((item) => item.toLowerCase().includes("<center><em>posted from truvvl") === false).filter((item) => item.toLowerCase().includes('view this post <a href="https://travelfeed.io/') === false).filter((item) => item.toLowerCase().includes("read this post on travelfeed.io for the best experience") === false).filter((item) => item.toLowerCase().includes('posted via <a href="https://www.dporn.co/"') === false).filter((item) => item.toLowerCase().includes("\u25B6\uFE0F [watch on 3speak](https://3speak") === false).filter((item) => item.toLowerCase().includes("<sup><sub>posted via [inji.com]") === false).filter((item) => item.toLowerCase().includes("view this post on [liketu]") === false).filter((item) => {
    const l = item.toLowerCase();
    return !(l.includes("posted from liketu speak") && l.includes("auto-transcrib"));
  }).filter((item) => item.toLowerCase().includes("[via Inbox]") === false).filter((item) => item.toLowerCase().includes("<sub>[via apps from](") === false).join("\n") : "").replace('Posted via <a href="https://d.buzz" data-link="promote-link">D.Buzz</a>', "").replace('<div class="pull-right"><a href="/@hive.engage">![](https://i.imgur.com/XsrNmcl.png)</a></div>', "").replace('<div><a href="https://engage.hivechain.app">![](https://i.imgur.com/XsrNmcl.png)</a></div>', "").replace(`<div class="text-center"><img src="https://cdn.steemitimages.com/DQmNp6YwAm2qwquALZw8PdcovDorwaBSFuxQ38TrYziGT6b/A-20.png"><a href="https://bit.ly/actifit-app"><img src="https://cdn.steemitimages.com/DQmQqfpSmcQtfrHAtzfBtVccXwUL9vKNgZJ2j93m8WNjizw/l5.png"></a><a href="https://bit.ly/actifit-ios"><img src="https://cdn.steemitimages.com/DQmbWy8KzKT1UvCvznUTaFPw6wBUcyLtBT5XL9wdbB7Hfmn/l6.png"></a></div>`, "");
}
var domSerializer = domSerializerModule.default || domSerializerModule;
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
    highlight: function(str) {
      const lolightInstance = getLolightInstance();
      if (!lolightInstance) {
        return str;
      }
      try {
        const tokens = lolightInstance.tok(str);
        return tokens.map(
          (token) => `<span class="ll-${token[0]}">${token[1]}</span>`
        ).join("");
      } catch (err) {
        console.error(err);
      }
      return str;
    }
  }).use(linkify$1);
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
  const serializer = new XMLSerializer();
  if (!input) {
    return "";
  }
  let output = "";
  const entities = input.match(ENTITY_REGEX);
  const entityPlaceholders = [];
  if (entities && forApp) {
    const uniqueEntities = [...new Set(entities)];
    uniqueEntities.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      entityPlaceholders.push(entity);
      input = input.split(entity).join(placeholder);
    });
  }
  try {
    output = md.render(input);
    output = fixBlockLevelTagsInParagraphs(output);
    const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(output)}</body>`, "text/html");
    traverse(doc, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions);
    output = serializer.serializeToString(doc);
  } catch (error) {
    try {
      const preSanitized = sanitizeHtml(output);
      const dom = htmlparser2.parseDocument(preSanitized, {
        // lenient options - don't throw on malformed HTML
        lowerCaseTags: false,
        lowerCaseAttributeNames: false
      });
      const repairedHtml = domSerializer(dom.children);
      const doc = DOMParser.parseFromString(`<body id="root">${removeDuplicateAttributes(repairedHtml)}</body>`, "text/html");
      traverse(doc, forApp, 0, { firstImageFound: false }, parentDomain, seoContext, renderOptions);
      output = serializer.serializeToString(doc);
    } catch (fallbackError) {
      output = sanitizeHtml(output || md.render(input));
    }
  }
  if (forApp && output && entityPlaceholders.length > 0) {
    entityPlaceholders.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      output = output.split(placeholder).join(entity);
    });
  }
  output = output.replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, "").replace(/^<\?xml[^?]*\?>/, "").replace(/^<!DOCTYPE[^>]*>/i, "").replace(/<\/?html[^>]*>/g, "").replace(/<head[^>]*>[\s\S]*?<\/head>/g, "").replace('<body id="root">', "").replace("</body>", "").trim();
  return sanitizeHtml(output);
}
var mdInstance = null;
function getMd() {
  if (!mdInstance) {
    mdInstance = new Remarkable({
      html: true,
      breaks: true,
      typographer: false
    }).use(linkify$1);
  }
  return mdInstance;
}
function simpleMarkdownToHTML(input) {
  if (!input) return "";
  const html = getMd().render(input);
  return sanitizeHtml(html);
}
var cache = new LRUCache({ max: 500 });
function setCacheSize(size) {
  cache = new LRUCache({ max: size });
}
function cacheGet(key) {
  return cache.get(key);
}
function cacheSet(key, value) {
  cache.set(key, value);
}

// src/markdown-2-html.ts
var isNodeRuntime = typeof process !== "undefined" && typeof process?.versions?.node === "string";
var slowRenderThresholdMs = isNodeRuntime ? 500 : 0;
function setSlowRenderThresholdMs(ms) {
  slowRenderThresholdMs = Math.max(0, ms);
}
function logIfSlow(durationMs, context) {
  if (slowRenderThresholdMs > 0 && durationMs >= slowRenderThresholdMs) {
    console.warn(
      `[render-helper] slow markdown render: ${durationMs.toFixed(0)}ms ${context}`
    );
  }
}
function markdown2Html(obj, forApp = true, _webp = false, parentDomain = "ecency.com", seoContext, renderOptions) {
  if (typeof obj === "string") {
    const cleanedStr = cleanReply(obj);
    const t02 = performance.now();
    const res2 = markdownToHTML(cleanedStr, forApp, parentDomain, seoContext, renderOptions);
    logIfSlow(performance.now() - t02, `body_len=${obj.length}`);
    return res2;
  }
  const key = `${makeEntryCacheKey(obj)}-md-${forApp ? "app" : "site"}-${parentDomain}${seoContext ? `-seo${seoContext.authorReputation ?? ""}-${seoContext.postPayout ?? ""}` : ""}${renderOptions?.embedVideosDirectly ? "-embed" : ""}`;
  const item = cacheGet(key);
  if (item) {
    return item;
  }
  const cleanBody = cleanReply(obj.body);
  const t0 = performance.now();
  const res = markdownToHTML(cleanBody, forApp, parentDomain, seoContext, renderOptions);
  logIfSlow(
    performance.now() - t0,
    `author=@${obj.author} permlink=${obj.permlink} body_len=${obj.body?.length ?? 0}`
  );
  cacheSet(key, res);
  return res;
}
var gifLinkRegex = /\.(gif)$/i;
function isGifLink(link) {
  return gifLinkRegex.test(link);
}
var BACKTICK_FENCE_RE = /```[\s\S]*?```/g;
var TILDE_FENCE_RE = /~~~[\s\S]*?~~~/g;
var INLINE_CODE_RE = /`[^`\n]*`/g;
var INDENTED_CODE_RE = /^(?: {4}|\t).+$/gm;
var MD_IMAGE_RE = /!\[[^[\]]*\]\(\s*([^)\s]{1,2048})(?:\s+["'][^"']*["'])?\s*\)/;
var MD_IMAGE_PRESENT_RE = /!\[[^[\]]*\]\(\s*[^\s)]/;
var HTML_IMAGE_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;
var BARE_IMAGE_RE = /(^|\s)(https?:\/\/[^\s<>"'()[\]]+\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)(?:[?#][^\s<>"'()[\]]*)?)/im;
var MD_LINK_RE = /\[([^[\]]*)\]\(\s*([^)\s[]+)(?:\s+["'][^"']*["'])?\s*\)/g;
var IMG_HREF_RE = /https?:\/\/.*\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/i;
var SAFE_URL_RE = /^https?:\/\//i;
function findFirstImageUrl(body, includeBareUrls = false) {
  if (!body) return null;
  const cleaned = body.replace(BACKTICK_FENCE_RE, "").replace(TILDE_FENCE_RE, "").replace(INLINE_CODE_RE, "").replace(INDENTED_CODE_RE, "");
  const mdMatch = cleaned.match(MD_IMAGE_RE);
  const htmlMatch = cleaned.match(HTML_IMAGE_RE);
  if (mdMatch) {
    const url = mdMatch[1];
    if (!url || !SAFE_URL_RE.test(url) || url.includes("(")) {
      return null;
    }
  }
  const priorRegion = mdMatch ? cleaned.slice(0, mdMatch.index ?? 0) : cleaned;
  if (MD_IMAGE_PRESENT_RE.test(priorRegion)) {
    return null;
  }
  const candidates = [];
  if (mdMatch) candidates.push({ url: mdMatch[1], pos: mdMatch.index ?? 0 });
  if (htmlMatch && htmlMatch[1] && SAFE_URL_RE.test(htmlMatch[1])) {
    candidates.push({ url: htmlMatch[1], pos: htmlMatch.index ?? 0 });
  }
  if (includeBareUrls) {
    const bareMatch = cleaned.match(BARE_IMAGE_RE);
    if (bareMatch && bareMatch[2] && SAFE_URL_RE.test(bareMatch[2])) {
      candidates.push({ url: bareMatch[2], pos: (bareMatch.index ?? 0) + bareMatch[1].length });
    }
    const deAmp = (s) => s.trim().replace(/&amp;/g, "&");
    for (const m of cleaned.matchAll(MD_LINK_RE)) {
      const idx = m.index ?? 0;
      if (idx > 0 && cleaned[idx - 1] === "!") continue;
      const href = m[2];
      if (href && SAFE_URL_RE.test(href) && IMG_HREF_RE.test(href) && deAmp(m[1]) === deAmp(href)) {
        candidates.push({ url: href, pos: idx });
        break;
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a2, b) => a2.pos - b.pos);
  return candidates[0].url;
}
function proxifyFound(src, width, height, format) {
  const decoded = he2.decode(src);
  if (isGifLink(decoded)) {
    return proxifyImageSrc(decoded, 0, 0, format);
  }
  return proxifyImageSrc(decoded, width, height, format);
}
function getImage(entry, width = 0, height = 0, format = "match") {
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
  if (meta && typeof meta.image === "string" && meta.image.length > 0) {
    const decodedImage = he2.decode(meta.image);
    if (isGifLink(decodedImage)) {
      return proxifyImageSrc(decodedImage, 0, 0, format);
    }
    return proxifyImageSrc(decodedImage, width, height, format);
  }
  if (meta && meta.image && !!meta.image.length && meta.image[0]) {
    if (typeof meta.image[0] === "string") {
      const decodedImage = he2.decode(meta.image[0]);
      if (isGifLink(decodedImage)) {
        return proxifyImageSrc(decodedImage, 0, 0, format);
      }
      return proxifyImageSrc(decodedImage, width, height, format);
    }
    if (isGifLink(meta.image[0])) {
      return proxifyImageSrc(meta.image[0], 0, 0, format);
    }
    return proxifyImageSrc(meta.image[0], width, height, format);
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
function getEntryImageRawUrl(obj) {
  if (typeof obj === "string") {
    const src = findFirstImageUrl(obj, true);
    return src ? decodeImageSrc(src) : null;
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
  const bodySrc = findFirstImageUrl(obj.body, true);
  return bodySrc ? decodeImageSrc(bodySrc) : null;
}
function catchPostImage(obj, width = 0, height = 0, format = "match") {
  if (typeof obj === "string") {
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
  const key = `${makeEntryCacheKey(obj)}-${width}x${height}-${format}`;
  const item = cacheGet(key);
  if (item) {
    return item;
  }
  const res = getImage(obj, width, height, format);
  cacheSet(key, res);
  return res;
}
var summaryRenderer = new Remarkable({
  html: true,
  breaks: true,
  typographer: false
});
summaryRenderer.core.ruler.enable(["abbr"]);
summaryRenderer.block.ruler.enable(["footnote", "deflist"]);
summaryRenderer.inline.ruler.enable([
  "footnote_inline",
  "ins",
  "mark",
  "sub",
  "sup"
]);
var joint = (arr, limit = 200) => {
  let result = "";
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      if (result) {
        result += " ";
      }
      if (result.length > limit) {
        break;
      } else {
        if ((result + arr[i]).length < limit + 10) {
          result += arr[i];
        } else {
          break;
        }
      }
    }
  }
  return result.trim();
};
function postBodySummary(entryBody, length = 200, platform = "web") {
  if (!entryBody) {
    return "";
  }
  entryBody = cleanReply(entryBody);
  const entities = entryBody.match(ENTITY_REGEX);
  const entityPlaceholders = [];
  if (entities && platform !== "web") {
    const uniqueEntities = [...new Set(entities)];
    uniqueEntities.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      entityPlaceholders.push(entity);
      entryBody = entryBody.split(entity).join(placeholder);
    });
  }
  let text2 = "";
  try {
    text2 = summaryRenderer.render(entryBody);
  } catch (err) {
    console.error("[postBodySummary] Failed to render markdown:", {
      error: err instanceof Error ? err.message : String(err),
      entryBodyLength: entryBody?.length || 0,
      platform
    });
    text2 = "";
  }
  if (platform !== "web" && entityPlaceholders.length > 0) {
    entityPlaceholders.forEach((entity, index) => {
      const placeholder = `\u200B${index}\u200B`;
      text2 = text2.split(placeholder).join(entity);
    });
  }
  text2 = stripHtmlTags(text2).replace(/\r?\n|\r/g, " ").replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim().replace(/ {2,}/g, " ");
  if (length > 0) {
    text2 = joint(text2.split(" "), length);
  }
  if (text2) {
    text2 = he2.decode(text2);
  }
  return text2;
}
function getPostBodySummary(obj, length, platform) {
  const normalizedLength = length ?? 200;
  const normalizedPlatform = platform || "web";
  if (typeof obj === "string") {
    return postBodySummary(obj, normalizedLength, normalizedPlatform);
  }
  const key = `${makeEntryCacheKey(obj)}-sum-${normalizedLength}-${normalizedPlatform}`;
  const item = cacheGet(key);
  if (item) {
    return item;
  }
  const res = postBodySummary(obj.body, normalizedLength, normalizedPlatform);
  cacheSet(key, res);
  return res;
}

export { IMAGE_SIZES, SECTION_LIST, buildPictureSources, buildSrcSet, buildSrcSetForFormat, catchPostImage, getEntryImageRawUrl, isAllowedEmbedSrc, isLegacySizedProxyUrl, isPictureEligibleRawUrl, isValidPermlink, getPostBodySummary as postBodySummary, proxifyImageSrc, markdown2Html as renderPostBody, setCacheSize, setProxyBase, setSlowRenderThresholdMs, simpleMarkdownToHTML };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map