import { DOMParser as DOMParser$1, XMLSerializer } from '@xmldom/xmldom';
import { decodeHTML } from 'entities';
import xss from 'xss';
import querystring from 'querystring';
import { LRUCache } from 'lru-cache';
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
var LEADING_ZEROS_DEC = /&#0+(?=[0-9])/g;
var LEADING_ZEROS_HEX = /&#x0+(?=[0-9a-f])/gi;
var OVERLONG_NUMERIC_REF = /&#(?:x[0-9a-f]{256,}|[0-9]{309,});?/gi;
function decodeEntities(value) {
  const safe = value.replace(LEADING_ZEROS_DEC, "&#").replace(LEADING_ZEROS_HEX, (m) => m.slice(0, 3)).replace(OVERLONG_NUMERIC_REF, "\uFFFD");
  try {
    return decodeHTML(safe);
  } catch {
    return safe;
  }
}
function decodeImageSrc(src) {
  const entityDecoded = decodeEntities(src);
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
  let i2 = 0;
  while (i2 < n) {
    const lt = html.indexOf("<", i2);
    if (lt < 0) {
      out += html.slice(i2);
      break;
    }
    out += html.slice(i2, lt);
    if (lt + 1 >= n || !isAsciiLetter(html.charCodeAt(lt + 1))) {
      out += "<";
      i2 = lt + 1;
      continue;
    }
    let p2 = lt + 1;
    while (p2 < n && isTagNameChar(html.charCodeAt(p2))) p2++;
    const tagName = html.slice(lt + 1, p2);
    if (p2 >= n || !isSpaceChar(html.charCodeAt(p2))) {
      out += "<";
      i2 = lt + 1;
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
      i2 = lt + 1;
      continue;
    }
    q++;
    const attrsJoined = attrs.length > 0 ? " " + attrs.join(" ") : "";
    out += "<" + tagName + attrsJoined + (selfClose ? " /" : "") + ">";
    i2 = q;
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
  let i2 = 0;
  while (i2 < n) {
    const lt = s.indexOf("<", i2);
    if (lt < 0) {
      out += s.slice(i2);
      break;
    }
    out += s.slice(i2, lt);
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) {
      out += s.slice(lt);
      break;
    }
    if (gt === lt + 1) {
      out += s.slice(lt, gt + 1);
      i2 = gt + 1;
      continue;
    }
    i2 = gt + 1;
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
  let i2 = 0;
  while (i2 < n) {
    const pStart = html.indexOf("</p>", i2);
    if (pStart < 0) {
      out += html.slice(i2);
      break;
    }
    if (pStart === i2 || html.charCodeAt(pStart - 1) !== 62) {
      out += html.slice(i2, pStart + 4);
      i2 = pStart + 4;
      continue;
    }
    const closingStart = html.lastIndexOf("</", pStart - 2);
    if (closingStart < i2) {
      out += html.slice(i2, pStart + 4);
      i2 = pStart + 4;
      continue;
    }
    const tagName = html.slice(closingStart + 2, pStart - 1).toLowerCase();
    if (!blockTags.has(tagName)) {
      out += html.slice(i2, pStart + 4);
      i2 = pStart + 4;
      continue;
    }
    let k = closingStart;
    while (k > i2 && isHtmlWhitespace(html.charCodeAt(k - 1))) k--;
    if (k - 4 >= i2 && html.slice(k - 4, k).toLowerCase() === "<br>") {
      k -= 4;
      while (k > i2 && isHtmlWhitespace(html.charCodeAt(k - 1))) k--;
    }
    out += html.slice(i2, k) + "</p>" + html.slice(closingStart, pStart);
    i2 = pStart + 4;
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
  for (let i2 = 0; i2 < bytes.length; i2++) {
    let carry = bytes[i2];
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
var MAX_PROXIED_URL_LENGTH = 2048;
var LEGACY_SIZED_PROXY_RE = /^https:\/\/(?:images\.hive\.blog|steemitimages\.com)\/\d+x\d+\/(.+)$/;
function isLegacySizedProxyUrl(url) {
  if (!url || typeof url !== "string") return false;
  return LEGACY_SIZED_PROXY_RE.test(url);
}
function extractLegacySizedSource(url) {
  const m = LEGACY_SIZED_PROXY_RE.exec(url);
  if (!m) return null;
  const rest = m[1];
  const hashIndex = rest.indexOf("#");
  const addressable = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
  const qIndex = addressable.indexOf("?");
  const path = qIndex >= 0 ? addressable.slice(0, qIndex) : addressable;
  const query = qIndex >= 0 ? addressable.slice(qIndex + 1) : "";
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 47) {
    end--;
  }
  try {
    const inner = new URL(path.slice(0, end));
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
  if (url.length > MAX_PROXIED_URL_LENGTH) {
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
var decodeEntities2 = (input) => input.replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(Number(dec))).replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
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
      const decoded = decodeEntities2(value.trim());
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
var normalizeDisplayText = (text3) => {
  const beforeTrailingSlash = text3.trim().replace(/^https?:\/\/(www\.)?(ecency\.com|peakd\.com|hive\.blog|leofinance\.io|inleo\.io|snapie\.io|hivesuite\.app)/i, "").replace(/^\/+/, "").split("?")[0].replace(/#@.*$/i, "");
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
      const external1 = renderOptions?.externalProfileBase;
      if (forApp || external1) {
        el.setAttribute("href", `${external1 ?? "https://ecency.com"}/@${author}/${section}`);
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
      const external2 = renderOptions?.externalProfileBase;
      if (forApp || external2) {
        el.setAttribute("href", `${external2 ?? "https://ecency.com"}/@${author}/${section}`);
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
      const blockquote2 = el.ownerDocument.createElement("blockquote");
      blockquote2.setAttribute("class", "twitter-tweet");
      const p2 = el.ownerDocument.createElement("p");
      p2.textContent = url;
      const textNode = el.ownerDocument.createTextNode("- ");
      const a2 = el.ownerDocument.createElement("a");
      a2.setAttribute("href", url);
      a2.textContent = author;
      blockquote2.appendChild(p2);
      blockquote2.appendChild(textNode);
      blockquote2.appendChild(a2);
      if (el.parentNode) {
        el.parentNode.replaceChild(blockquote2, el);
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
      if (renderOptions?.inertAuthorAndTagChips) {
        return `${preceding}<span class="er-tag er-tag-link">${tag.trim()}</span>`;
      }
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
          const inner = `<img class="er-author-link-image" src="${avatarSrc}" alt="${userLower}"/>@${userLower}`;
          const html = renderOptions?.inertAuthorAndTagChips ? `${preceedings}<span class="er-author er-author-link">${inner}</span>` : `${preceedings}<a class="er-author er-author-link" href="/@${userLower}">${inner}</a>`;
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
        const external = renderOptions?.externalProfileBase;
        const attrs = forApp || external ? `href="${external ?? "https://ecency.com"}/@${authorLower}/${permlink}"` : `href="/@${authorLower}/${permlink}"`;
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
        const external = renderOptions?.externalProfileBase;
        const attrs = forApp || external ? `href="${external ?? "https://ecency.com"}/@${uu}/${permlink}"` : `href="/@${uu}/${permlink}"`;
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
var CHIP_CLASSES = ["er-author-link", "er-tag-link"];
function hasChipAncestor(node) {
  let current = node.parentNode;
  while (current) {
    const el = current;
    const className = typeof el.getAttribute === "function" ? el.getAttribute("class") : null;
    if (className && className.split(/\s+/).some((token) => CHIP_CLASSES.includes(token))) {
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
  if (renderOptions?.inertAuthorAndTagChips && hasChipAncestor(node)) {
    return;
  }
  const nodeValue = node.nodeValue || "";
  const linkified = linkify(nodeValue, forApp, renderOptions);
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
      text(child, forApp, renderOptions);
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

// ../../node_modules/.pnpm/remarkable@2.0.1/node_modules/remarkable/dist/esm/index.js
var entities = {
  "Aacute": "\xC1",
  "aacute": "\xE1",
  "Abreve": "\u0102",
  "abreve": "\u0103",
  "ac": "\u223E",
  "acd": "\u223F",
  "acE": "\u223E\u0333",
  "Acirc": "\xC2",
  "acirc": "\xE2",
  "acute": "\xB4",
  "Acy": "\u0410",
  "acy": "\u0430",
  "AElig": "\xC6",
  "aelig": "\xE6",
  "af": "\u2061",
  "Afr": "\u{1D504}",
  "afr": "\u{1D51E}",
  "Agrave": "\xC0",
  "agrave": "\xE0",
  "alefsym": "\u2135",
  "aleph": "\u2135",
  "Alpha": "\u0391",
  "alpha": "\u03B1",
  "Amacr": "\u0100",
  "amacr": "\u0101",
  "amalg": "\u2A3F",
  "AMP": "&",
  "amp": "&",
  "And": "\u2A53",
  "and": "\u2227",
  "andand": "\u2A55",
  "andd": "\u2A5C",
  "andslope": "\u2A58",
  "andv": "\u2A5A",
  "ang": "\u2220",
  "ange": "\u29A4",
  "angle": "\u2220",
  "angmsd": "\u2221",
  "angmsdaa": "\u29A8",
  "angmsdab": "\u29A9",
  "angmsdac": "\u29AA",
  "angmsdad": "\u29AB",
  "angmsdae": "\u29AC",
  "angmsdaf": "\u29AD",
  "angmsdag": "\u29AE",
  "angmsdah": "\u29AF",
  "angrt": "\u221F",
  "angrtvb": "\u22BE",
  "angrtvbd": "\u299D",
  "angsph": "\u2222",
  "angst": "\xC5",
  "angzarr": "\u237C",
  "Aogon": "\u0104",
  "aogon": "\u0105",
  "Aopf": "\u{1D538}",
  "aopf": "\u{1D552}",
  "ap": "\u2248",
  "apacir": "\u2A6F",
  "apE": "\u2A70",
  "ape": "\u224A",
  "apid": "\u224B",
  "apos": "'",
  "ApplyFunction": "\u2061",
  "approx": "\u2248",
  "approxeq": "\u224A",
  "Aring": "\xC5",
  "aring": "\xE5",
  "Ascr": "\u{1D49C}",
  "ascr": "\u{1D4B6}",
  "Assign": "\u2254",
  "ast": "*",
  "asymp": "\u2248",
  "asympeq": "\u224D",
  "Atilde": "\xC3",
  "atilde": "\xE3",
  "Auml": "\xC4",
  "auml": "\xE4",
  "awconint": "\u2233",
  "awint": "\u2A11",
  "backcong": "\u224C",
  "backepsilon": "\u03F6",
  "backprime": "\u2035",
  "backsim": "\u223D",
  "backsimeq": "\u22CD",
  "Backslash": "\u2216",
  "Barv": "\u2AE7",
  "barvee": "\u22BD",
  "Barwed": "\u2306",
  "barwed": "\u2305",
  "barwedge": "\u2305",
  "bbrk": "\u23B5",
  "bbrktbrk": "\u23B6",
  "bcong": "\u224C",
  "Bcy": "\u0411",
  "bcy": "\u0431",
  "bdquo": "\u201E",
  "becaus": "\u2235",
  "Because": "\u2235",
  "because": "\u2235",
  "bemptyv": "\u29B0",
  "bepsi": "\u03F6",
  "bernou": "\u212C",
  "Bernoullis": "\u212C",
  "Beta": "\u0392",
  "beta": "\u03B2",
  "beth": "\u2136",
  "between": "\u226C",
  "Bfr": "\u{1D505}",
  "bfr": "\u{1D51F}",
  "bigcap": "\u22C2",
  "bigcirc": "\u25EF",
  "bigcup": "\u22C3",
  "bigodot": "\u2A00",
  "bigoplus": "\u2A01",
  "bigotimes": "\u2A02",
  "bigsqcup": "\u2A06",
  "bigstar": "\u2605",
  "bigtriangledown": "\u25BD",
  "bigtriangleup": "\u25B3",
  "biguplus": "\u2A04",
  "bigvee": "\u22C1",
  "bigwedge": "\u22C0",
  "bkarow": "\u290D",
  "blacklozenge": "\u29EB",
  "blacksquare": "\u25AA",
  "blacktriangle": "\u25B4",
  "blacktriangledown": "\u25BE",
  "blacktriangleleft": "\u25C2",
  "blacktriangleright": "\u25B8",
  "blank": "\u2423",
  "blk12": "\u2592",
  "blk14": "\u2591",
  "blk34": "\u2593",
  "block": "\u2588",
  "bne": "=\u20E5",
  "bnequiv": "\u2261\u20E5",
  "bNot": "\u2AED",
  "bnot": "\u2310",
  "Bopf": "\u{1D539}",
  "bopf": "\u{1D553}",
  "bot": "\u22A5",
  "bottom": "\u22A5",
  "bowtie": "\u22C8",
  "boxbox": "\u29C9",
  "boxDL": "\u2557",
  "boxDl": "\u2556",
  "boxdL": "\u2555",
  "boxdl": "\u2510",
  "boxDR": "\u2554",
  "boxDr": "\u2553",
  "boxdR": "\u2552",
  "boxdr": "\u250C",
  "boxH": "\u2550",
  "boxh": "\u2500",
  "boxHD": "\u2566",
  "boxHd": "\u2564",
  "boxhD": "\u2565",
  "boxhd": "\u252C",
  "boxHU": "\u2569",
  "boxHu": "\u2567",
  "boxhU": "\u2568",
  "boxhu": "\u2534",
  "boxminus": "\u229F",
  "boxplus": "\u229E",
  "boxtimes": "\u22A0",
  "boxUL": "\u255D",
  "boxUl": "\u255C",
  "boxuL": "\u255B",
  "boxul": "\u2518",
  "boxUR": "\u255A",
  "boxUr": "\u2559",
  "boxuR": "\u2558",
  "boxur": "\u2514",
  "boxV": "\u2551",
  "boxv": "\u2502",
  "boxVH": "\u256C",
  "boxVh": "\u256B",
  "boxvH": "\u256A",
  "boxvh": "\u253C",
  "boxVL": "\u2563",
  "boxVl": "\u2562",
  "boxvL": "\u2561",
  "boxvl": "\u2524",
  "boxVR": "\u2560",
  "boxVr": "\u255F",
  "boxvR": "\u255E",
  "boxvr": "\u251C",
  "bprime": "\u2035",
  "Breve": "\u02D8",
  "breve": "\u02D8",
  "brvbar": "\xA6",
  "Bscr": "\u212C",
  "bscr": "\u{1D4B7}",
  "bsemi": "\u204F",
  "bsim": "\u223D",
  "bsime": "\u22CD",
  "bsol": "\\",
  "bsolb": "\u29C5",
  "bsolhsub": "\u27C8",
  "bull": "\u2022",
  "bullet": "\u2022",
  "bump": "\u224E",
  "bumpE": "\u2AAE",
  "bumpe": "\u224F",
  "Bumpeq": "\u224E",
  "bumpeq": "\u224F",
  "Cacute": "\u0106",
  "cacute": "\u0107",
  "Cap": "\u22D2",
  "cap": "\u2229",
  "capand": "\u2A44",
  "capbrcup": "\u2A49",
  "capcap": "\u2A4B",
  "capcup": "\u2A47",
  "capdot": "\u2A40",
  "CapitalDifferentialD": "\u2145",
  "caps": "\u2229\uFE00",
  "caret": "\u2041",
  "caron": "\u02C7",
  "Cayleys": "\u212D",
  "ccaps": "\u2A4D",
  "Ccaron": "\u010C",
  "ccaron": "\u010D",
  "Ccedil": "\xC7",
  "ccedil": "\xE7",
  "Ccirc": "\u0108",
  "ccirc": "\u0109",
  "Cconint": "\u2230",
  "ccups": "\u2A4C",
  "ccupssm": "\u2A50",
  "Cdot": "\u010A",
  "cdot": "\u010B",
  "cedil": "\xB8",
  "Cedilla": "\xB8",
  "cemptyv": "\u29B2",
  "cent": "\xA2",
  "CenterDot": "\xB7",
  "centerdot": "\xB7",
  "Cfr": "\u212D",
  "cfr": "\u{1D520}",
  "CHcy": "\u0427",
  "chcy": "\u0447",
  "check": "\u2713",
  "checkmark": "\u2713",
  "Chi": "\u03A7",
  "chi": "\u03C7",
  "cir": "\u25CB",
  "circ": "\u02C6",
  "circeq": "\u2257",
  "circlearrowleft": "\u21BA",
  "circlearrowright": "\u21BB",
  "circledast": "\u229B",
  "circledcirc": "\u229A",
  "circleddash": "\u229D",
  "CircleDot": "\u2299",
  "circledR": "\xAE",
  "circledS": "\u24C8",
  "CircleMinus": "\u2296",
  "CirclePlus": "\u2295",
  "CircleTimes": "\u2297",
  "cirE": "\u29C3",
  "cire": "\u2257",
  "cirfnint": "\u2A10",
  "cirmid": "\u2AEF",
  "cirscir": "\u29C2",
  "ClockwiseContourIntegral": "\u2232",
  "CloseCurlyDoubleQuote": "\u201D",
  "CloseCurlyQuote": "\u2019",
  "clubs": "\u2663",
  "clubsuit": "\u2663",
  "Colon": "\u2237",
  "colon": ":",
  "Colone": "\u2A74",
  "colone": "\u2254",
  "coloneq": "\u2254",
  "comma": ",",
  "commat": "@",
  "comp": "\u2201",
  "compfn": "\u2218",
  "complement": "\u2201",
  "complexes": "\u2102",
  "cong": "\u2245",
  "congdot": "\u2A6D",
  "Congruent": "\u2261",
  "Conint": "\u222F",
  "conint": "\u222E",
  "ContourIntegral": "\u222E",
  "Copf": "\u2102",
  "copf": "\u{1D554}",
  "coprod": "\u2210",
  "Coproduct": "\u2210",
  "COPY": "\xA9",
  "copy": "\xA9",
  "copysr": "\u2117",
  "CounterClockwiseContourIntegral": "\u2233",
  "crarr": "\u21B5",
  "Cross": "\u2A2F",
  "cross": "\u2717",
  "Cscr": "\u{1D49E}",
  "cscr": "\u{1D4B8}",
  "csub": "\u2ACF",
  "csube": "\u2AD1",
  "csup": "\u2AD0",
  "csupe": "\u2AD2",
  "ctdot": "\u22EF",
  "cudarrl": "\u2938",
  "cudarrr": "\u2935",
  "cuepr": "\u22DE",
  "cuesc": "\u22DF",
  "cularr": "\u21B6",
  "cularrp": "\u293D",
  "Cup": "\u22D3",
  "cup": "\u222A",
  "cupbrcap": "\u2A48",
  "CupCap": "\u224D",
  "cupcap": "\u2A46",
  "cupcup": "\u2A4A",
  "cupdot": "\u228D",
  "cupor": "\u2A45",
  "cups": "\u222A\uFE00",
  "curarr": "\u21B7",
  "curarrm": "\u293C",
  "curlyeqprec": "\u22DE",
  "curlyeqsucc": "\u22DF",
  "curlyvee": "\u22CE",
  "curlywedge": "\u22CF",
  "curren": "\xA4",
  "curvearrowleft": "\u21B6",
  "curvearrowright": "\u21B7",
  "cuvee": "\u22CE",
  "cuwed": "\u22CF",
  "cwconint": "\u2232",
  "cwint": "\u2231",
  "cylcty": "\u232D",
  "Dagger": "\u2021",
  "dagger": "\u2020",
  "daleth": "\u2138",
  "Darr": "\u21A1",
  "dArr": "\u21D3",
  "darr": "\u2193",
  "dash": "\u2010",
  "Dashv": "\u2AE4",
  "dashv": "\u22A3",
  "dbkarow": "\u290F",
  "dblac": "\u02DD",
  "Dcaron": "\u010E",
  "dcaron": "\u010F",
  "Dcy": "\u0414",
  "dcy": "\u0434",
  "DD": "\u2145",
  "dd": "\u2146",
  "ddagger": "\u2021",
  "ddarr": "\u21CA",
  "DDotrahd": "\u2911",
  "ddotseq": "\u2A77",
  "deg": "\xB0",
  "Del": "\u2207",
  "Delta": "\u0394",
  "delta": "\u03B4",
  "demptyv": "\u29B1",
  "dfisht": "\u297F",
  "Dfr": "\u{1D507}",
  "dfr": "\u{1D521}",
  "dHar": "\u2965",
  "dharl": "\u21C3",
  "dharr": "\u21C2",
  "DiacriticalAcute": "\xB4",
  "DiacriticalDot": "\u02D9",
  "DiacriticalDoubleAcute": "\u02DD",
  "DiacriticalGrave": "`",
  "DiacriticalTilde": "\u02DC",
  "diam": "\u22C4",
  "Diamond": "\u22C4",
  "diamond": "\u22C4",
  "diamondsuit": "\u2666",
  "diams": "\u2666",
  "die": "\xA8",
  "DifferentialD": "\u2146",
  "digamma": "\u03DD",
  "disin": "\u22F2",
  "div": "\xF7",
  "divide": "\xF7",
  "divideontimes": "\u22C7",
  "divonx": "\u22C7",
  "DJcy": "\u0402",
  "djcy": "\u0452",
  "dlcorn": "\u231E",
  "dlcrop": "\u230D",
  "dollar": "$",
  "Dopf": "\u{1D53B}",
  "dopf": "\u{1D555}",
  "Dot": "\xA8",
  "dot": "\u02D9",
  "DotDot": "\u20DC",
  "doteq": "\u2250",
  "doteqdot": "\u2251",
  "DotEqual": "\u2250",
  "dotminus": "\u2238",
  "dotplus": "\u2214",
  "dotsquare": "\u22A1",
  "doublebarwedge": "\u2306",
  "DoubleContourIntegral": "\u222F",
  "DoubleDot": "\xA8",
  "DoubleDownArrow": "\u21D3",
  "DoubleLeftArrow": "\u21D0",
  "DoubleLeftRightArrow": "\u21D4",
  "DoubleLeftTee": "\u2AE4",
  "DoubleLongLeftArrow": "\u27F8",
  "DoubleLongLeftRightArrow": "\u27FA",
  "DoubleLongRightArrow": "\u27F9",
  "DoubleRightArrow": "\u21D2",
  "DoubleRightTee": "\u22A8",
  "DoubleUpArrow": "\u21D1",
  "DoubleUpDownArrow": "\u21D5",
  "DoubleVerticalBar": "\u2225",
  "DownArrow": "\u2193",
  "Downarrow": "\u21D3",
  "downarrow": "\u2193",
  "DownArrowBar": "\u2913",
  "DownArrowUpArrow": "\u21F5",
  "DownBreve": "\u0311",
  "downdownarrows": "\u21CA",
  "downharpoonleft": "\u21C3",
  "downharpoonright": "\u21C2",
  "DownLeftRightVector": "\u2950",
  "DownLeftTeeVector": "\u295E",
  "DownLeftVector": "\u21BD",
  "DownLeftVectorBar": "\u2956",
  "DownRightTeeVector": "\u295F",
  "DownRightVector": "\u21C1",
  "DownRightVectorBar": "\u2957",
  "DownTee": "\u22A4",
  "DownTeeArrow": "\u21A7",
  "drbkarow": "\u2910",
  "drcorn": "\u231F",
  "drcrop": "\u230C",
  "Dscr": "\u{1D49F}",
  "dscr": "\u{1D4B9}",
  "DScy": "\u0405",
  "dscy": "\u0455",
  "dsol": "\u29F6",
  "Dstrok": "\u0110",
  "dstrok": "\u0111",
  "dtdot": "\u22F1",
  "dtri": "\u25BF",
  "dtrif": "\u25BE",
  "duarr": "\u21F5",
  "duhar": "\u296F",
  "dwangle": "\u29A6",
  "DZcy": "\u040F",
  "dzcy": "\u045F",
  "dzigrarr": "\u27FF",
  "Eacute": "\xC9",
  "eacute": "\xE9",
  "easter": "\u2A6E",
  "Ecaron": "\u011A",
  "ecaron": "\u011B",
  "ecir": "\u2256",
  "Ecirc": "\xCA",
  "ecirc": "\xEA",
  "ecolon": "\u2255",
  "Ecy": "\u042D",
  "ecy": "\u044D",
  "eDDot": "\u2A77",
  "Edot": "\u0116",
  "eDot": "\u2251",
  "edot": "\u0117",
  "ee": "\u2147",
  "efDot": "\u2252",
  "Efr": "\u{1D508}",
  "efr": "\u{1D522}",
  "eg": "\u2A9A",
  "Egrave": "\xC8",
  "egrave": "\xE8",
  "egs": "\u2A96",
  "egsdot": "\u2A98",
  "el": "\u2A99",
  "Element": "\u2208",
  "elinters": "\u23E7",
  "ell": "\u2113",
  "els": "\u2A95",
  "elsdot": "\u2A97",
  "Emacr": "\u0112",
  "emacr": "\u0113",
  "empty": "\u2205",
  "emptyset": "\u2205",
  "EmptySmallSquare": "\u25FB",
  "emptyv": "\u2205",
  "EmptyVerySmallSquare": "\u25AB",
  "emsp": "\u2003",
  "emsp13": "\u2004",
  "emsp14": "\u2005",
  "ENG": "\u014A",
  "eng": "\u014B",
  "ensp": "\u2002",
  "Eogon": "\u0118",
  "eogon": "\u0119",
  "Eopf": "\u{1D53C}",
  "eopf": "\u{1D556}",
  "epar": "\u22D5",
  "eparsl": "\u29E3",
  "eplus": "\u2A71",
  "epsi": "\u03B5",
  "Epsilon": "\u0395",
  "epsilon": "\u03B5",
  "epsiv": "\u03F5",
  "eqcirc": "\u2256",
  "eqcolon": "\u2255",
  "eqsim": "\u2242",
  "eqslantgtr": "\u2A96",
  "eqslantless": "\u2A95",
  "Equal": "\u2A75",
  "equals": "=",
  "EqualTilde": "\u2242",
  "equest": "\u225F",
  "Equilibrium": "\u21CC",
  "equiv": "\u2261",
  "equivDD": "\u2A78",
  "eqvparsl": "\u29E5",
  "erarr": "\u2971",
  "erDot": "\u2253",
  "Escr": "\u2130",
  "escr": "\u212F",
  "esdot": "\u2250",
  "Esim": "\u2A73",
  "esim": "\u2242",
  "Eta": "\u0397",
  "eta": "\u03B7",
  "ETH": "\xD0",
  "eth": "\xF0",
  "Euml": "\xCB",
  "euml": "\xEB",
  "euro": "\u20AC",
  "excl": "!",
  "exist": "\u2203",
  "Exists": "\u2203",
  "expectation": "\u2130",
  "ExponentialE": "\u2147",
  "exponentiale": "\u2147",
  "fallingdotseq": "\u2252",
  "Fcy": "\u0424",
  "fcy": "\u0444",
  "female": "\u2640",
  "ffilig": "\uFB03",
  "fflig": "\uFB00",
  "ffllig": "\uFB04",
  "Ffr": "\u{1D509}",
  "ffr": "\u{1D523}",
  "filig": "\uFB01",
  "FilledSmallSquare": "\u25FC",
  "FilledVerySmallSquare": "\u25AA",
  "fjlig": "fj",
  "flat": "\u266D",
  "fllig": "\uFB02",
  "fltns": "\u25B1",
  "fnof": "\u0192",
  "Fopf": "\u{1D53D}",
  "fopf": "\u{1D557}",
  "ForAll": "\u2200",
  "forall": "\u2200",
  "fork": "\u22D4",
  "forkv": "\u2AD9",
  "Fouriertrf": "\u2131",
  "fpartint": "\u2A0D",
  "frac12": "\xBD",
  "frac13": "\u2153",
  "frac14": "\xBC",
  "frac15": "\u2155",
  "frac16": "\u2159",
  "frac18": "\u215B",
  "frac23": "\u2154",
  "frac25": "\u2156",
  "frac34": "\xBE",
  "frac35": "\u2157",
  "frac38": "\u215C",
  "frac45": "\u2158",
  "frac56": "\u215A",
  "frac58": "\u215D",
  "frac78": "\u215E",
  "frasl": "\u2044",
  "frown": "\u2322",
  "Fscr": "\u2131",
  "fscr": "\u{1D4BB}",
  "gacute": "\u01F5",
  "Gamma": "\u0393",
  "gamma": "\u03B3",
  "Gammad": "\u03DC",
  "gammad": "\u03DD",
  "gap": "\u2A86",
  "Gbreve": "\u011E",
  "gbreve": "\u011F",
  "Gcedil": "\u0122",
  "Gcirc": "\u011C",
  "gcirc": "\u011D",
  "Gcy": "\u0413",
  "gcy": "\u0433",
  "Gdot": "\u0120",
  "gdot": "\u0121",
  "gE": "\u2267",
  "ge": "\u2265",
  "gEl": "\u2A8C",
  "gel": "\u22DB",
  "geq": "\u2265",
  "geqq": "\u2267",
  "geqslant": "\u2A7E",
  "ges": "\u2A7E",
  "gescc": "\u2AA9",
  "gesdot": "\u2A80",
  "gesdoto": "\u2A82",
  "gesdotol": "\u2A84",
  "gesl": "\u22DB\uFE00",
  "gesles": "\u2A94",
  "Gfr": "\u{1D50A}",
  "gfr": "\u{1D524}",
  "Gg": "\u22D9",
  "gg": "\u226B",
  "ggg": "\u22D9",
  "gimel": "\u2137",
  "GJcy": "\u0403",
  "gjcy": "\u0453",
  "gl": "\u2277",
  "gla": "\u2AA5",
  "glE": "\u2A92",
  "glj": "\u2AA4",
  "gnap": "\u2A8A",
  "gnapprox": "\u2A8A",
  "gnE": "\u2269",
  "gne": "\u2A88",
  "gneq": "\u2A88",
  "gneqq": "\u2269",
  "gnsim": "\u22E7",
  "Gopf": "\u{1D53E}",
  "gopf": "\u{1D558}",
  "grave": "`",
  "GreaterEqual": "\u2265",
  "GreaterEqualLess": "\u22DB",
  "GreaterFullEqual": "\u2267",
  "GreaterGreater": "\u2AA2",
  "GreaterLess": "\u2277",
  "GreaterSlantEqual": "\u2A7E",
  "GreaterTilde": "\u2273",
  "Gscr": "\u{1D4A2}",
  "gscr": "\u210A",
  "gsim": "\u2273",
  "gsime": "\u2A8E",
  "gsiml": "\u2A90",
  "GT": ">",
  "Gt": "\u226B",
  "gt": ">",
  "gtcc": "\u2AA7",
  "gtcir": "\u2A7A",
  "gtdot": "\u22D7",
  "gtlPar": "\u2995",
  "gtquest": "\u2A7C",
  "gtrapprox": "\u2A86",
  "gtrarr": "\u2978",
  "gtrdot": "\u22D7",
  "gtreqless": "\u22DB",
  "gtreqqless": "\u2A8C",
  "gtrless": "\u2277",
  "gtrsim": "\u2273",
  "gvertneqq": "\u2269\uFE00",
  "gvnE": "\u2269\uFE00",
  "Hacek": "\u02C7",
  "hairsp": "\u200A",
  "half": "\xBD",
  "hamilt": "\u210B",
  "HARDcy": "\u042A",
  "hardcy": "\u044A",
  "hArr": "\u21D4",
  "harr": "\u2194",
  "harrcir": "\u2948",
  "harrw": "\u21AD",
  "Hat": "^",
  "hbar": "\u210F",
  "Hcirc": "\u0124",
  "hcirc": "\u0125",
  "hearts": "\u2665",
  "heartsuit": "\u2665",
  "hellip": "\u2026",
  "hercon": "\u22B9",
  "Hfr": "\u210C",
  "hfr": "\u{1D525}",
  "HilbertSpace": "\u210B",
  "hksearow": "\u2925",
  "hkswarow": "\u2926",
  "hoarr": "\u21FF",
  "homtht": "\u223B",
  "hookleftarrow": "\u21A9",
  "hookrightarrow": "\u21AA",
  "Hopf": "\u210D",
  "hopf": "\u{1D559}",
  "horbar": "\u2015",
  "HorizontalLine": "\u2500",
  "Hscr": "\u210B",
  "hscr": "\u{1D4BD}",
  "hslash": "\u210F",
  "Hstrok": "\u0126",
  "hstrok": "\u0127",
  "HumpDownHump": "\u224E",
  "HumpEqual": "\u224F",
  "hybull": "\u2043",
  "hyphen": "\u2010",
  "Iacute": "\xCD",
  "iacute": "\xED",
  "ic": "\u2063",
  "Icirc": "\xCE",
  "icirc": "\xEE",
  "Icy": "\u0418",
  "icy": "\u0438",
  "Idot": "\u0130",
  "IEcy": "\u0415",
  "iecy": "\u0435",
  "iexcl": "\xA1",
  "iff": "\u21D4",
  "Ifr": "\u2111",
  "ifr": "\u{1D526}",
  "Igrave": "\xCC",
  "igrave": "\xEC",
  "ii": "\u2148",
  "iiiint": "\u2A0C",
  "iiint": "\u222D",
  "iinfin": "\u29DC",
  "iiota": "\u2129",
  "IJlig": "\u0132",
  "ijlig": "\u0133",
  "Im": "\u2111",
  "Imacr": "\u012A",
  "imacr": "\u012B",
  "image": "\u2111",
  "ImaginaryI": "\u2148",
  "imagline": "\u2110",
  "imagpart": "\u2111",
  "imath": "\u0131",
  "imof": "\u22B7",
  "imped": "\u01B5",
  "Implies": "\u21D2",
  "in": "\u2208",
  "incare": "\u2105",
  "infin": "\u221E",
  "infintie": "\u29DD",
  "inodot": "\u0131",
  "Int": "\u222C",
  "int": "\u222B",
  "intcal": "\u22BA",
  "integers": "\u2124",
  "Integral": "\u222B",
  "intercal": "\u22BA",
  "Intersection": "\u22C2",
  "intlarhk": "\u2A17",
  "intprod": "\u2A3C",
  "InvisibleComma": "\u2063",
  "InvisibleTimes": "\u2062",
  "IOcy": "\u0401",
  "iocy": "\u0451",
  "Iogon": "\u012E",
  "iogon": "\u012F",
  "Iopf": "\u{1D540}",
  "iopf": "\u{1D55A}",
  "Iota": "\u0399",
  "iota": "\u03B9",
  "iprod": "\u2A3C",
  "iquest": "\xBF",
  "Iscr": "\u2110",
  "iscr": "\u{1D4BE}",
  "isin": "\u2208",
  "isindot": "\u22F5",
  "isinE": "\u22F9",
  "isins": "\u22F4",
  "isinsv": "\u22F3",
  "isinv": "\u2208",
  "it": "\u2062",
  "Itilde": "\u0128",
  "itilde": "\u0129",
  "Iukcy": "\u0406",
  "iukcy": "\u0456",
  "Iuml": "\xCF",
  "iuml": "\xEF",
  "Jcirc": "\u0134",
  "jcirc": "\u0135",
  "Jcy": "\u0419",
  "jcy": "\u0439",
  "Jfr": "\u{1D50D}",
  "jfr": "\u{1D527}",
  "jmath": "\u0237",
  "Jopf": "\u{1D541}",
  "jopf": "\u{1D55B}",
  "Jscr": "\u{1D4A5}",
  "jscr": "\u{1D4BF}",
  "Jsercy": "\u0408",
  "jsercy": "\u0458",
  "Jukcy": "\u0404",
  "jukcy": "\u0454",
  "Kappa": "\u039A",
  "kappa": "\u03BA",
  "kappav": "\u03F0",
  "Kcedil": "\u0136",
  "kcedil": "\u0137",
  "Kcy": "\u041A",
  "kcy": "\u043A",
  "Kfr": "\u{1D50E}",
  "kfr": "\u{1D528}",
  "kgreen": "\u0138",
  "KHcy": "\u0425",
  "khcy": "\u0445",
  "KJcy": "\u040C",
  "kjcy": "\u045C",
  "Kopf": "\u{1D542}",
  "kopf": "\u{1D55C}",
  "Kscr": "\u{1D4A6}",
  "kscr": "\u{1D4C0}",
  "lAarr": "\u21DA",
  "Lacute": "\u0139",
  "lacute": "\u013A",
  "laemptyv": "\u29B4",
  "lagran": "\u2112",
  "Lambda": "\u039B",
  "lambda": "\u03BB",
  "Lang": "\u27EA",
  "lang": "\u27E8",
  "langd": "\u2991",
  "langle": "\u27E8",
  "lap": "\u2A85",
  "Laplacetrf": "\u2112",
  "laquo": "\xAB",
  "Larr": "\u219E",
  "lArr": "\u21D0",
  "larr": "\u2190",
  "larrb": "\u21E4",
  "larrbfs": "\u291F",
  "larrfs": "\u291D",
  "larrhk": "\u21A9",
  "larrlp": "\u21AB",
  "larrpl": "\u2939",
  "larrsim": "\u2973",
  "larrtl": "\u21A2",
  "lat": "\u2AAB",
  "lAtail": "\u291B",
  "latail": "\u2919",
  "late": "\u2AAD",
  "lates": "\u2AAD\uFE00",
  "lBarr": "\u290E",
  "lbarr": "\u290C",
  "lbbrk": "\u2772",
  "lbrace": "{",
  "lbrack": "[",
  "lbrke": "\u298B",
  "lbrksld": "\u298F",
  "lbrkslu": "\u298D",
  "Lcaron": "\u013D",
  "lcaron": "\u013E",
  "Lcedil": "\u013B",
  "lcedil": "\u013C",
  "lceil": "\u2308",
  "lcub": "{",
  "Lcy": "\u041B",
  "lcy": "\u043B",
  "ldca": "\u2936",
  "ldquo": "\u201C",
  "ldquor": "\u201E",
  "ldrdhar": "\u2967",
  "ldrushar": "\u294B",
  "ldsh": "\u21B2",
  "lE": "\u2266",
  "le": "\u2264",
  "LeftAngleBracket": "\u27E8",
  "LeftArrow": "\u2190",
  "Leftarrow": "\u21D0",
  "leftarrow": "\u2190",
  "LeftArrowBar": "\u21E4",
  "LeftArrowRightArrow": "\u21C6",
  "leftarrowtail": "\u21A2",
  "LeftCeiling": "\u2308",
  "LeftDoubleBracket": "\u27E6",
  "LeftDownTeeVector": "\u2961",
  "LeftDownVector": "\u21C3",
  "LeftDownVectorBar": "\u2959",
  "LeftFloor": "\u230A",
  "leftharpoondown": "\u21BD",
  "leftharpoonup": "\u21BC",
  "leftleftarrows": "\u21C7",
  "LeftRightArrow": "\u2194",
  "Leftrightarrow": "\u21D4",
  "leftrightarrow": "\u2194",
  "leftrightarrows": "\u21C6",
  "leftrightharpoons": "\u21CB",
  "leftrightsquigarrow": "\u21AD",
  "LeftRightVector": "\u294E",
  "LeftTee": "\u22A3",
  "LeftTeeArrow": "\u21A4",
  "LeftTeeVector": "\u295A",
  "leftthreetimes": "\u22CB",
  "LeftTriangle": "\u22B2",
  "LeftTriangleBar": "\u29CF",
  "LeftTriangleEqual": "\u22B4",
  "LeftUpDownVector": "\u2951",
  "LeftUpTeeVector": "\u2960",
  "LeftUpVector": "\u21BF",
  "LeftUpVectorBar": "\u2958",
  "LeftVector": "\u21BC",
  "LeftVectorBar": "\u2952",
  "lEg": "\u2A8B",
  "leg": "\u22DA",
  "leq": "\u2264",
  "leqq": "\u2266",
  "leqslant": "\u2A7D",
  "les": "\u2A7D",
  "lescc": "\u2AA8",
  "lesdot": "\u2A7F",
  "lesdoto": "\u2A81",
  "lesdotor": "\u2A83",
  "lesg": "\u22DA\uFE00",
  "lesges": "\u2A93",
  "lessapprox": "\u2A85",
  "lessdot": "\u22D6",
  "lesseqgtr": "\u22DA",
  "lesseqqgtr": "\u2A8B",
  "LessEqualGreater": "\u22DA",
  "LessFullEqual": "\u2266",
  "LessGreater": "\u2276",
  "lessgtr": "\u2276",
  "LessLess": "\u2AA1",
  "lesssim": "\u2272",
  "LessSlantEqual": "\u2A7D",
  "LessTilde": "\u2272",
  "lfisht": "\u297C",
  "lfloor": "\u230A",
  "Lfr": "\u{1D50F}",
  "lfr": "\u{1D529}",
  "lg": "\u2276",
  "lgE": "\u2A91",
  "lHar": "\u2962",
  "lhard": "\u21BD",
  "lharu": "\u21BC",
  "lharul": "\u296A",
  "lhblk": "\u2584",
  "LJcy": "\u0409",
  "ljcy": "\u0459",
  "Ll": "\u22D8",
  "ll": "\u226A",
  "llarr": "\u21C7",
  "llcorner": "\u231E",
  "Lleftarrow": "\u21DA",
  "llhard": "\u296B",
  "lltri": "\u25FA",
  "Lmidot": "\u013F",
  "lmidot": "\u0140",
  "lmoust": "\u23B0",
  "lmoustache": "\u23B0",
  "lnap": "\u2A89",
  "lnapprox": "\u2A89",
  "lnE": "\u2268",
  "lne": "\u2A87",
  "lneq": "\u2A87",
  "lneqq": "\u2268",
  "lnsim": "\u22E6",
  "loang": "\u27EC",
  "loarr": "\u21FD",
  "lobrk": "\u27E6",
  "LongLeftArrow": "\u27F5",
  "Longleftarrow": "\u27F8",
  "longleftarrow": "\u27F5",
  "LongLeftRightArrow": "\u27F7",
  "Longleftrightarrow": "\u27FA",
  "longleftrightarrow": "\u27F7",
  "longmapsto": "\u27FC",
  "LongRightArrow": "\u27F6",
  "Longrightarrow": "\u27F9",
  "longrightarrow": "\u27F6",
  "looparrowleft": "\u21AB",
  "looparrowright": "\u21AC",
  "lopar": "\u2985",
  "Lopf": "\u{1D543}",
  "lopf": "\u{1D55D}",
  "loplus": "\u2A2D",
  "lotimes": "\u2A34",
  "lowast": "\u2217",
  "lowbar": "_",
  "LowerLeftArrow": "\u2199",
  "LowerRightArrow": "\u2198",
  "loz": "\u25CA",
  "lozenge": "\u25CA",
  "lozf": "\u29EB",
  "lpar": "(",
  "lparlt": "\u2993",
  "lrarr": "\u21C6",
  "lrcorner": "\u231F",
  "lrhar": "\u21CB",
  "lrhard": "\u296D",
  "lrm": "\u200E",
  "lrtri": "\u22BF",
  "lsaquo": "\u2039",
  "Lscr": "\u2112",
  "lscr": "\u{1D4C1}",
  "Lsh": "\u21B0",
  "lsh": "\u21B0",
  "lsim": "\u2272",
  "lsime": "\u2A8D",
  "lsimg": "\u2A8F",
  "lsqb": "[",
  "lsquo": "\u2018",
  "lsquor": "\u201A",
  "Lstrok": "\u0141",
  "lstrok": "\u0142",
  "LT": "<",
  "Lt": "\u226A",
  "lt": "<",
  "ltcc": "\u2AA6",
  "ltcir": "\u2A79",
  "ltdot": "\u22D6",
  "lthree": "\u22CB",
  "ltimes": "\u22C9",
  "ltlarr": "\u2976",
  "ltquest": "\u2A7B",
  "ltri": "\u25C3",
  "ltrie": "\u22B4",
  "ltrif": "\u25C2",
  "ltrPar": "\u2996",
  "lurdshar": "\u294A",
  "luruhar": "\u2966",
  "lvertneqq": "\u2268\uFE00",
  "lvnE": "\u2268\uFE00",
  "macr": "\xAF",
  "male": "\u2642",
  "malt": "\u2720",
  "maltese": "\u2720",
  "Map": "\u2905",
  "map": "\u21A6",
  "mapsto": "\u21A6",
  "mapstodown": "\u21A7",
  "mapstoleft": "\u21A4",
  "mapstoup": "\u21A5",
  "marker": "\u25AE",
  "mcomma": "\u2A29",
  "Mcy": "\u041C",
  "mcy": "\u043C",
  "mdash": "\u2014",
  "mDDot": "\u223A",
  "measuredangle": "\u2221",
  "MediumSpace": "\u205F",
  "Mellintrf": "\u2133",
  "Mfr": "\u{1D510}",
  "mfr": "\u{1D52A}",
  "mho": "\u2127",
  "micro": "\xB5",
  "mid": "\u2223",
  "midast": "*",
  "midcir": "\u2AF0",
  "middot": "\xB7",
  "minus": "\u2212",
  "minusb": "\u229F",
  "minusd": "\u2238",
  "minusdu": "\u2A2A",
  "MinusPlus": "\u2213",
  "mlcp": "\u2ADB",
  "mldr": "\u2026",
  "mnplus": "\u2213",
  "models": "\u22A7",
  "Mopf": "\u{1D544}",
  "mopf": "\u{1D55E}",
  "mp": "\u2213",
  "Mscr": "\u2133",
  "mscr": "\u{1D4C2}",
  "mstpos": "\u223E",
  "Mu": "\u039C",
  "mu": "\u03BC",
  "multimap": "\u22B8",
  "mumap": "\u22B8",
  "nabla": "\u2207",
  "Nacute": "\u0143",
  "nacute": "\u0144",
  "nang": "\u2220\u20D2",
  "nap": "\u2249",
  "napE": "\u2A70\u0338",
  "napid": "\u224B\u0338",
  "napos": "\u0149",
  "napprox": "\u2249",
  "natur": "\u266E",
  "natural": "\u266E",
  "naturals": "\u2115",
  "nbsp": "\xA0",
  "nbump": "\u224E\u0338",
  "nbumpe": "\u224F\u0338",
  "ncap": "\u2A43",
  "Ncaron": "\u0147",
  "ncaron": "\u0148",
  "Ncedil": "\u0145",
  "ncedil": "\u0146",
  "ncong": "\u2247",
  "ncongdot": "\u2A6D\u0338",
  "ncup": "\u2A42",
  "Ncy": "\u041D",
  "ncy": "\u043D",
  "ndash": "\u2013",
  "ne": "\u2260",
  "nearhk": "\u2924",
  "neArr": "\u21D7",
  "nearr": "\u2197",
  "nearrow": "\u2197",
  "nedot": "\u2250\u0338",
  "NegativeMediumSpace": "\u200B",
  "NegativeThickSpace": "\u200B",
  "NegativeThinSpace": "\u200B",
  "NegativeVeryThinSpace": "\u200B",
  "nequiv": "\u2262",
  "nesear": "\u2928",
  "nesim": "\u2242\u0338",
  "NestedGreaterGreater": "\u226B",
  "NestedLessLess": "\u226A",
  "NewLine": "\n",
  "nexist": "\u2204",
  "nexists": "\u2204",
  "Nfr": "\u{1D511}",
  "nfr": "\u{1D52B}",
  "ngE": "\u2267\u0338",
  "nge": "\u2271",
  "ngeq": "\u2271",
  "ngeqq": "\u2267\u0338",
  "ngeqslant": "\u2A7E\u0338",
  "nges": "\u2A7E\u0338",
  "nGg": "\u22D9\u0338",
  "ngsim": "\u2275",
  "nGt": "\u226B\u20D2",
  "ngt": "\u226F",
  "ngtr": "\u226F",
  "nGtv": "\u226B\u0338",
  "nhArr": "\u21CE",
  "nharr": "\u21AE",
  "nhpar": "\u2AF2",
  "ni": "\u220B",
  "nis": "\u22FC",
  "nisd": "\u22FA",
  "niv": "\u220B",
  "NJcy": "\u040A",
  "njcy": "\u045A",
  "nlArr": "\u21CD",
  "nlarr": "\u219A",
  "nldr": "\u2025",
  "nlE": "\u2266\u0338",
  "nle": "\u2270",
  "nLeftarrow": "\u21CD",
  "nleftarrow": "\u219A",
  "nLeftrightarrow": "\u21CE",
  "nleftrightarrow": "\u21AE",
  "nleq": "\u2270",
  "nleqq": "\u2266\u0338",
  "nleqslant": "\u2A7D\u0338",
  "nles": "\u2A7D\u0338",
  "nless": "\u226E",
  "nLl": "\u22D8\u0338",
  "nlsim": "\u2274",
  "nLt": "\u226A\u20D2",
  "nlt": "\u226E",
  "nltri": "\u22EA",
  "nltrie": "\u22EC",
  "nLtv": "\u226A\u0338",
  "nmid": "\u2224",
  "NoBreak": "\u2060",
  "NonBreakingSpace": "\xA0",
  "Nopf": "\u2115",
  "nopf": "\u{1D55F}",
  "Not": "\u2AEC",
  "not": "\xAC",
  "NotCongruent": "\u2262",
  "NotCupCap": "\u226D",
  "NotDoubleVerticalBar": "\u2226",
  "NotElement": "\u2209",
  "NotEqual": "\u2260",
  "NotEqualTilde": "\u2242\u0338",
  "NotExists": "\u2204",
  "NotGreater": "\u226F",
  "NotGreaterEqual": "\u2271",
  "NotGreaterFullEqual": "\u2267\u0338",
  "NotGreaterGreater": "\u226B\u0338",
  "NotGreaterLess": "\u2279",
  "NotGreaterSlantEqual": "\u2A7E\u0338",
  "NotGreaterTilde": "\u2275",
  "NotHumpDownHump": "\u224E\u0338",
  "NotHumpEqual": "\u224F\u0338",
  "notin": "\u2209",
  "notindot": "\u22F5\u0338",
  "notinE": "\u22F9\u0338",
  "notinva": "\u2209",
  "notinvb": "\u22F7",
  "notinvc": "\u22F6",
  "NotLeftTriangle": "\u22EA",
  "NotLeftTriangleBar": "\u29CF\u0338",
  "NotLeftTriangleEqual": "\u22EC",
  "NotLess": "\u226E",
  "NotLessEqual": "\u2270",
  "NotLessGreater": "\u2278",
  "NotLessLess": "\u226A\u0338",
  "NotLessSlantEqual": "\u2A7D\u0338",
  "NotLessTilde": "\u2274",
  "NotNestedGreaterGreater": "\u2AA2\u0338",
  "NotNestedLessLess": "\u2AA1\u0338",
  "notni": "\u220C",
  "notniva": "\u220C",
  "notnivb": "\u22FE",
  "notnivc": "\u22FD",
  "NotPrecedes": "\u2280",
  "NotPrecedesEqual": "\u2AAF\u0338",
  "NotPrecedesSlantEqual": "\u22E0",
  "NotReverseElement": "\u220C",
  "NotRightTriangle": "\u22EB",
  "NotRightTriangleBar": "\u29D0\u0338",
  "NotRightTriangleEqual": "\u22ED",
  "NotSquareSubset": "\u228F\u0338",
  "NotSquareSubsetEqual": "\u22E2",
  "NotSquareSuperset": "\u2290\u0338",
  "NotSquareSupersetEqual": "\u22E3",
  "NotSubset": "\u2282\u20D2",
  "NotSubsetEqual": "\u2288",
  "NotSucceeds": "\u2281",
  "NotSucceedsEqual": "\u2AB0\u0338",
  "NotSucceedsSlantEqual": "\u22E1",
  "NotSucceedsTilde": "\u227F\u0338",
  "NotSuperset": "\u2283\u20D2",
  "NotSupersetEqual": "\u2289",
  "NotTilde": "\u2241",
  "NotTildeEqual": "\u2244",
  "NotTildeFullEqual": "\u2247",
  "NotTildeTilde": "\u2249",
  "NotVerticalBar": "\u2224",
  "npar": "\u2226",
  "nparallel": "\u2226",
  "nparsl": "\u2AFD\u20E5",
  "npart": "\u2202\u0338",
  "npolint": "\u2A14",
  "npr": "\u2280",
  "nprcue": "\u22E0",
  "npre": "\u2AAF\u0338",
  "nprec": "\u2280",
  "npreceq": "\u2AAF\u0338",
  "nrArr": "\u21CF",
  "nrarr": "\u219B",
  "nrarrc": "\u2933\u0338",
  "nrarrw": "\u219D\u0338",
  "nRightarrow": "\u21CF",
  "nrightarrow": "\u219B",
  "nrtri": "\u22EB",
  "nrtrie": "\u22ED",
  "nsc": "\u2281",
  "nsccue": "\u22E1",
  "nsce": "\u2AB0\u0338",
  "Nscr": "\u{1D4A9}",
  "nscr": "\u{1D4C3}",
  "nshortmid": "\u2224",
  "nshortparallel": "\u2226",
  "nsim": "\u2241",
  "nsime": "\u2244",
  "nsimeq": "\u2244",
  "nsmid": "\u2224",
  "nspar": "\u2226",
  "nsqsube": "\u22E2",
  "nsqsupe": "\u22E3",
  "nsub": "\u2284",
  "nsubE": "\u2AC5\u0338",
  "nsube": "\u2288",
  "nsubset": "\u2282\u20D2",
  "nsubseteq": "\u2288",
  "nsubseteqq": "\u2AC5\u0338",
  "nsucc": "\u2281",
  "nsucceq": "\u2AB0\u0338",
  "nsup": "\u2285",
  "nsupE": "\u2AC6\u0338",
  "nsupe": "\u2289",
  "nsupset": "\u2283\u20D2",
  "nsupseteq": "\u2289",
  "nsupseteqq": "\u2AC6\u0338",
  "ntgl": "\u2279",
  "Ntilde": "\xD1",
  "ntilde": "\xF1",
  "ntlg": "\u2278",
  "ntriangleleft": "\u22EA",
  "ntrianglelefteq": "\u22EC",
  "ntriangleright": "\u22EB",
  "ntrianglerighteq": "\u22ED",
  "Nu": "\u039D",
  "nu": "\u03BD",
  "num": "#",
  "numero": "\u2116",
  "numsp": "\u2007",
  "nvap": "\u224D\u20D2",
  "nVDash": "\u22AF",
  "nVdash": "\u22AE",
  "nvDash": "\u22AD",
  "nvdash": "\u22AC",
  "nvge": "\u2265\u20D2",
  "nvgt": ">\u20D2",
  "nvHarr": "\u2904",
  "nvinfin": "\u29DE",
  "nvlArr": "\u2902",
  "nvle": "\u2264\u20D2",
  "nvlt": "<\u20D2",
  "nvltrie": "\u22B4\u20D2",
  "nvrArr": "\u2903",
  "nvrtrie": "\u22B5\u20D2",
  "nvsim": "\u223C\u20D2",
  "nwarhk": "\u2923",
  "nwArr": "\u21D6",
  "nwarr": "\u2196",
  "nwarrow": "\u2196",
  "nwnear": "\u2927",
  "Oacute": "\xD3",
  "oacute": "\xF3",
  "oast": "\u229B",
  "ocir": "\u229A",
  "Ocirc": "\xD4",
  "ocirc": "\xF4",
  "Ocy": "\u041E",
  "ocy": "\u043E",
  "odash": "\u229D",
  "Odblac": "\u0150",
  "odblac": "\u0151",
  "odiv": "\u2A38",
  "odot": "\u2299",
  "odsold": "\u29BC",
  "OElig": "\u0152",
  "oelig": "\u0153",
  "ofcir": "\u29BF",
  "Ofr": "\u{1D512}",
  "ofr": "\u{1D52C}",
  "ogon": "\u02DB",
  "Ograve": "\xD2",
  "ograve": "\xF2",
  "ogt": "\u29C1",
  "ohbar": "\u29B5",
  "ohm": "\u03A9",
  "oint": "\u222E",
  "olarr": "\u21BA",
  "olcir": "\u29BE",
  "olcross": "\u29BB",
  "oline": "\u203E",
  "olt": "\u29C0",
  "Omacr": "\u014C",
  "omacr": "\u014D",
  "Omega": "\u03A9",
  "omega": "\u03C9",
  "Omicron": "\u039F",
  "omicron": "\u03BF",
  "omid": "\u29B6",
  "ominus": "\u2296",
  "Oopf": "\u{1D546}",
  "oopf": "\u{1D560}",
  "opar": "\u29B7",
  "OpenCurlyDoubleQuote": "\u201C",
  "OpenCurlyQuote": "\u2018",
  "operp": "\u29B9",
  "oplus": "\u2295",
  "Or": "\u2A54",
  "or": "\u2228",
  "orarr": "\u21BB",
  "ord": "\u2A5D",
  "order": "\u2134",
  "orderof": "\u2134",
  "ordf": "\xAA",
  "ordm": "\xBA",
  "origof": "\u22B6",
  "oror": "\u2A56",
  "orslope": "\u2A57",
  "orv": "\u2A5B",
  "oS": "\u24C8",
  "Oscr": "\u{1D4AA}",
  "oscr": "\u2134",
  "Oslash": "\xD8",
  "oslash": "\xF8",
  "osol": "\u2298",
  "Otilde": "\xD5",
  "otilde": "\xF5",
  "Otimes": "\u2A37",
  "otimes": "\u2297",
  "otimesas": "\u2A36",
  "Ouml": "\xD6",
  "ouml": "\xF6",
  "ovbar": "\u233D",
  "OverBar": "\u203E",
  "OverBrace": "\u23DE",
  "OverBracket": "\u23B4",
  "OverParenthesis": "\u23DC",
  "par": "\u2225",
  "para": "\xB6",
  "parallel": "\u2225",
  "parsim": "\u2AF3",
  "parsl": "\u2AFD",
  "part": "\u2202",
  "PartialD": "\u2202",
  "Pcy": "\u041F",
  "pcy": "\u043F",
  "percnt": "%",
  "period": ".",
  "permil": "\u2030",
  "perp": "\u22A5",
  "pertenk": "\u2031",
  "Pfr": "\u{1D513}",
  "pfr": "\u{1D52D}",
  "Phi": "\u03A6",
  "phi": "\u03C6",
  "phiv": "\u03D5",
  "phmmat": "\u2133",
  "phone": "\u260E",
  "Pi": "\u03A0",
  "pi": "\u03C0",
  "pitchfork": "\u22D4",
  "piv": "\u03D6",
  "planck": "\u210F",
  "planckh": "\u210E",
  "plankv": "\u210F",
  "plus": "+",
  "plusacir": "\u2A23",
  "plusb": "\u229E",
  "pluscir": "\u2A22",
  "plusdo": "\u2214",
  "plusdu": "\u2A25",
  "pluse": "\u2A72",
  "PlusMinus": "\xB1",
  "plusmn": "\xB1",
  "plussim": "\u2A26",
  "plustwo": "\u2A27",
  "pm": "\xB1",
  "Poincareplane": "\u210C",
  "pointint": "\u2A15",
  "Popf": "\u2119",
  "popf": "\u{1D561}",
  "pound": "\xA3",
  "Pr": "\u2ABB",
  "pr": "\u227A",
  "prap": "\u2AB7",
  "prcue": "\u227C",
  "prE": "\u2AB3",
  "pre": "\u2AAF",
  "prec": "\u227A",
  "precapprox": "\u2AB7",
  "preccurlyeq": "\u227C",
  "Precedes": "\u227A",
  "PrecedesEqual": "\u2AAF",
  "PrecedesSlantEqual": "\u227C",
  "PrecedesTilde": "\u227E",
  "preceq": "\u2AAF",
  "precnapprox": "\u2AB9",
  "precneqq": "\u2AB5",
  "precnsim": "\u22E8",
  "precsim": "\u227E",
  "Prime": "\u2033",
  "prime": "\u2032",
  "primes": "\u2119",
  "prnap": "\u2AB9",
  "prnE": "\u2AB5",
  "prnsim": "\u22E8",
  "prod": "\u220F",
  "Product": "\u220F",
  "profalar": "\u232E",
  "profline": "\u2312",
  "profsurf": "\u2313",
  "prop": "\u221D",
  "Proportion": "\u2237",
  "Proportional": "\u221D",
  "propto": "\u221D",
  "prsim": "\u227E",
  "prurel": "\u22B0",
  "Pscr": "\u{1D4AB}",
  "pscr": "\u{1D4C5}",
  "Psi": "\u03A8",
  "psi": "\u03C8",
  "puncsp": "\u2008",
  "Qfr": "\u{1D514}",
  "qfr": "\u{1D52E}",
  "qint": "\u2A0C",
  "Qopf": "\u211A",
  "qopf": "\u{1D562}",
  "qprime": "\u2057",
  "Qscr": "\u{1D4AC}",
  "qscr": "\u{1D4C6}",
  "quaternions": "\u210D",
  "quatint": "\u2A16",
  "quest": "?",
  "questeq": "\u225F",
  "QUOT": '"',
  "quot": '"',
  "rAarr": "\u21DB",
  "race": "\u223D\u0331",
  "Racute": "\u0154",
  "racute": "\u0155",
  "radic": "\u221A",
  "raemptyv": "\u29B3",
  "Rang": "\u27EB",
  "rang": "\u27E9",
  "rangd": "\u2992",
  "range": "\u29A5",
  "rangle": "\u27E9",
  "raquo": "\xBB",
  "Rarr": "\u21A0",
  "rArr": "\u21D2",
  "rarr": "\u2192",
  "rarrap": "\u2975",
  "rarrb": "\u21E5",
  "rarrbfs": "\u2920",
  "rarrc": "\u2933",
  "rarrfs": "\u291E",
  "rarrhk": "\u21AA",
  "rarrlp": "\u21AC",
  "rarrpl": "\u2945",
  "rarrsim": "\u2974",
  "Rarrtl": "\u2916",
  "rarrtl": "\u21A3",
  "rarrw": "\u219D",
  "rAtail": "\u291C",
  "ratail": "\u291A",
  "ratio": "\u2236",
  "rationals": "\u211A",
  "RBarr": "\u2910",
  "rBarr": "\u290F",
  "rbarr": "\u290D",
  "rbbrk": "\u2773",
  "rbrace": "}",
  "rbrack": "]",
  "rbrke": "\u298C",
  "rbrksld": "\u298E",
  "rbrkslu": "\u2990",
  "Rcaron": "\u0158",
  "rcaron": "\u0159",
  "Rcedil": "\u0156",
  "rcedil": "\u0157",
  "rceil": "\u2309",
  "rcub": "}",
  "Rcy": "\u0420",
  "rcy": "\u0440",
  "rdca": "\u2937",
  "rdldhar": "\u2969",
  "rdquo": "\u201D",
  "rdquor": "\u201D",
  "rdsh": "\u21B3",
  "Re": "\u211C",
  "real": "\u211C",
  "realine": "\u211B",
  "realpart": "\u211C",
  "reals": "\u211D",
  "rect": "\u25AD",
  "REG": "\xAE",
  "reg": "\xAE",
  "ReverseElement": "\u220B",
  "ReverseEquilibrium": "\u21CB",
  "ReverseUpEquilibrium": "\u296F",
  "rfisht": "\u297D",
  "rfloor": "\u230B",
  "Rfr": "\u211C",
  "rfr": "\u{1D52F}",
  "rHar": "\u2964",
  "rhard": "\u21C1",
  "rharu": "\u21C0",
  "rharul": "\u296C",
  "Rho": "\u03A1",
  "rho": "\u03C1",
  "rhov": "\u03F1",
  "RightAngleBracket": "\u27E9",
  "RightArrow": "\u2192",
  "Rightarrow": "\u21D2",
  "rightarrow": "\u2192",
  "RightArrowBar": "\u21E5",
  "RightArrowLeftArrow": "\u21C4",
  "rightarrowtail": "\u21A3",
  "RightCeiling": "\u2309",
  "RightDoubleBracket": "\u27E7",
  "RightDownTeeVector": "\u295D",
  "RightDownVector": "\u21C2",
  "RightDownVectorBar": "\u2955",
  "RightFloor": "\u230B",
  "rightharpoondown": "\u21C1",
  "rightharpoonup": "\u21C0",
  "rightleftarrows": "\u21C4",
  "rightleftharpoons": "\u21CC",
  "rightrightarrows": "\u21C9",
  "rightsquigarrow": "\u219D",
  "RightTee": "\u22A2",
  "RightTeeArrow": "\u21A6",
  "RightTeeVector": "\u295B",
  "rightthreetimes": "\u22CC",
  "RightTriangle": "\u22B3",
  "RightTriangleBar": "\u29D0",
  "RightTriangleEqual": "\u22B5",
  "RightUpDownVector": "\u294F",
  "RightUpTeeVector": "\u295C",
  "RightUpVector": "\u21BE",
  "RightUpVectorBar": "\u2954",
  "RightVector": "\u21C0",
  "RightVectorBar": "\u2953",
  "ring": "\u02DA",
  "risingdotseq": "\u2253",
  "rlarr": "\u21C4",
  "rlhar": "\u21CC",
  "rlm": "\u200F",
  "rmoust": "\u23B1",
  "rmoustache": "\u23B1",
  "rnmid": "\u2AEE",
  "roang": "\u27ED",
  "roarr": "\u21FE",
  "robrk": "\u27E7",
  "ropar": "\u2986",
  "Ropf": "\u211D",
  "ropf": "\u{1D563}",
  "roplus": "\u2A2E",
  "rotimes": "\u2A35",
  "RoundImplies": "\u2970",
  "rpar": ")",
  "rpargt": "\u2994",
  "rppolint": "\u2A12",
  "rrarr": "\u21C9",
  "Rrightarrow": "\u21DB",
  "rsaquo": "\u203A",
  "Rscr": "\u211B",
  "rscr": "\u{1D4C7}",
  "Rsh": "\u21B1",
  "rsh": "\u21B1",
  "rsqb": "]",
  "rsquo": "\u2019",
  "rsquor": "\u2019",
  "rthree": "\u22CC",
  "rtimes": "\u22CA",
  "rtri": "\u25B9",
  "rtrie": "\u22B5",
  "rtrif": "\u25B8",
  "rtriltri": "\u29CE",
  "RuleDelayed": "\u29F4",
  "ruluhar": "\u2968",
  "rx": "\u211E",
  "Sacute": "\u015A",
  "sacute": "\u015B",
  "sbquo": "\u201A",
  "Sc": "\u2ABC",
  "sc": "\u227B",
  "scap": "\u2AB8",
  "Scaron": "\u0160",
  "scaron": "\u0161",
  "sccue": "\u227D",
  "scE": "\u2AB4",
  "sce": "\u2AB0",
  "Scedil": "\u015E",
  "scedil": "\u015F",
  "Scirc": "\u015C",
  "scirc": "\u015D",
  "scnap": "\u2ABA",
  "scnE": "\u2AB6",
  "scnsim": "\u22E9",
  "scpolint": "\u2A13",
  "scsim": "\u227F",
  "Scy": "\u0421",
  "scy": "\u0441",
  "sdot": "\u22C5",
  "sdotb": "\u22A1",
  "sdote": "\u2A66",
  "searhk": "\u2925",
  "seArr": "\u21D8",
  "searr": "\u2198",
  "searrow": "\u2198",
  "sect": "\xA7",
  "semi": ";",
  "seswar": "\u2929",
  "setminus": "\u2216",
  "setmn": "\u2216",
  "sext": "\u2736",
  "Sfr": "\u{1D516}",
  "sfr": "\u{1D530}",
  "sfrown": "\u2322",
  "sharp": "\u266F",
  "SHCHcy": "\u0429",
  "shchcy": "\u0449",
  "SHcy": "\u0428",
  "shcy": "\u0448",
  "ShortDownArrow": "\u2193",
  "ShortLeftArrow": "\u2190",
  "shortmid": "\u2223",
  "shortparallel": "\u2225",
  "ShortRightArrow": "\u2192",
  "ShortUpArrow": "\u2191",
  "shy": "\xAD",
  "Sigma": "\u03A3",
  "sigma": "\u03C3",
  "sigmaf": "\u03C2",
  "sigmav": "\u03C2",
  "sim": "\u223C",
  "simdot": "\u2A6A",
  "sime": "\u2243",
  "simeq": "\u2243",
  "simg": "\u2A9E",
  "simgE": "\u2AA0",
  "siml": "\u2A9D",
  "simlE": "\u2A9F",
  "simne": "\u2246",
  "simplus": "\u2A24",
  "simrarr": "\u2972",
  "slarr": "\u2190",
  "SmallCircle": "\u2218",
  "smallsetminus": "\u2216",
  "smashp": "\u2A33",
  "smeparsl": "\u29E4",
  "smid": "\u2223",
  "smile": "\u2323",
  "smt": "\u2AAA",
  "smte": "\u2AAC",
  "smtes": "\u2AAC\uFE00",
  "SOFTcy": "\u042C",
  "softcy": "\u044C",
  "sol": "/",
  "solb": "\u29C4",
  "solbar": "\u233F",
  "Sopf": "\u{1D54A}",
  "sopf": "\u{1D564}",
  "spades": "\u2660",
  "spadesuit": "\u2660",
  "spar": "\u2225",
  "sqcap": "\u2293",
  "sqcaps": "\u2293\uFE00",
  "sqcup": "\u2294",
  "sqcups": "\u2294\uFE00",
  "Sqrt": "\u221A",
  "sqsub": "\u228F",
  "sqsube": "\u2291",
  "sqsubset": "\u228F",
  "sqsubseteq": "\u2291",
  "sqsup": "\u2290",
  "sqsupe": "\u2292",
  "sqsupset": "\u2290",
  "sqsupseteq": "\u2292",
  "squ": "\u25A1",
  "Square": "\u25A1",
  "square": "\u25A1",
  "SquareIntersection": "\u2293",
  "SquareSubset": "\u228F",
  "SquareSubsetEqual": "\u2291",
  "SquareSuperset": "\u2290",
  "SquareSupersetEqual": "\u2292",
  "SquareUnion": "\u2294",
  "squarf": "\u25AA",
  "squf": "\u25AA",
  "srarr": "\u2192",
  "Sscr": "\u{1D4AE}",
  "sscr": "\u{1D4C8}",
  "ssetmn": "\u2216",
  "ssmile": "\u2323",
  "sstarf": "\u22C6",
  "Star": "\u22C6",
  "star": "\u2606",
  "starf": "\u2605",
  "straightepsilon": "\u03F5",
  "straightphi": "\u03D5",
  "strns": "\xAF",
  "Sub": "\u22D0",
  "sub": "\u2282",
  "subdot": "\u2ABD",
  "subE": "\u2AC5",
  "sube": "\u2286",
  "subedot": "\u2AC3",
  "submult": "\u2AC1",
  "subnE": "\u2ACB",
  "subne": "\u228A",
  "subplus": "\u2ABF",
  "subrarr": "\u2979",
  "Subset": "\u22D0",
  "subset": "\u2282",
  "subseteq": "\u2286",
  "subseteqq": "\u2AC5",
  "SubsetEqual": "\u2286",
  "subsetneq": "\u228A",
  "subsetneqq": "\u2ACB",
  "subsim": "\u2AC7",
  "subsub": "\u2AD5",
  "subsup": "\u2AD3",
  "succ": "\u227B",
  "succapprox": "\u2AB8",
  "succcurlyeq": "\u227D",
  "Succeeds": "\u227B",
  "SucceedsEqual": "\u2AB0",
  "SucceedsSlantEqual": "\u227D",
  "SucceedsTilde": "\u227F",
  "succeq": "\u2AB0",
  "succnapprox": "\u2ABA",
  "succneqq": "\u2AB6",
  "succnsim": "\u22E9",
  "succsim": "\u227F",
  "SuchThat": "\u220B",
  "Sum": "\u2211",
  "sum": "\u2211",
  "sung": "\u266A",
  "Sup": "\u22D1",
  "sup": "\u2283",
  "sup1": "\xB9",
  "sup2": "\xB2",
  "sup3": "\xB3",
  "supdot": "\u2ABE",
  "supdsub": "\u2AD8",
  "supE": "\u2AC6",
  "supe": "\u2287",
  "supedot": "\u2AC4",
  "Superset": "\u2283",
  "SupersetEqual": "\u2287",
  "suphsol": "\u27C9",
  "suphsub": "\u2AD7",
  "suplarr": "\u297B",
  "supmult": "\u2AC2",
  "supnE": "\u2ACC",
  "supne": "\u228B",
  "supplus": "\u2AC0",
  "Supset": "\u22D1",
  "supset": "\u2283",
  "supseteq": "\u2287",
  "supseteqq": "\u2AC6",
  "supsetneq": "\u228B",
  "supsetneqq": "\u2ACC",
  "supsim": "\u2AC8",
  "supsub": "\u2AD4",
  "supsup": "\u2AD6",
  "swarhk": "\u2926",
  "swArr": "\u21D9",
  "swarr": "\u2199",
  "swarrow": "\u2199",
  "swnwar": "\u292A",
  "szlig": "\xDF",
  "Tab": "	",
  "target": "\u2316",
  "Tau": "\u03A4",
  "tau": "\u03C4",
  "tbrk": "\u23B4",
  "Tcaron": "\u0164",
  "tcaron": "\u0165",
  "Tcedil": "\u0162",
  "tcedil": "\u0163",
  "Tcy": "\u0422",
  "tcy": "\u0442",
  "tdot": "\u20DB",
  "telrec": "\u2315",
  "Tfr": "\u{1D517}",
  "tfr": "\u{1D531}",
  "there4": "\u2234",
  "Therefore": "\u2234",
  "therefore": "\u2234",
  "Theta": "\u0398",
  "theta": "\u03B8",
  "thetasym": "\u03D1",
  "thetav": "\u03D1",
  "thickapprox": "\u2248",
  "thicksim": "\u223C",
  "ThickSpace": "\u205F\u200A",
  "thinsp": "\u2009",
  "ThinSpace": "\u2009",
  "thkap": "\u2248",
  "thksim": "\u223C",
  "THORN": "\xDE",
  "thorn": "\xFE",
  "Tilde": "\u223C",
  "tilde": "\u02DC",
  "TildeEqual": "\u2243",
  "TildeFullEqual": "\u2245",
  "TildeTilde": "\u2248",
  "times": "\xD7",
  "timesb": "\u22A0",
  "timesbar": "\u2A31",
  "timesd": "\u2A30",
  "tint": "\u222D",
  "toea": "\u2928",
  "top": "\u22A4",
  "topbot": "\u2336",
  "topcir": "\u2AF1",
  "Topf": "\u{1D54B}",
  "topf": "\u{1D565}",
  "topfork": "\u2ADA",
  "tosa": "\u2929",
  "tprime": "\u2034",
  "TRADE": "\u2122",
  "trade": "\u2122",
  "triangle": "\u25B5",
  "triangledown": "\u25BF",
  "triangleleft": "\u25C3",
  "trianglelefteq": "\u22B4",
  "triangleq": "\u225C",
  "triangleright": "\u25B9",
  "trianglerighteq": "\u22B5",
  "tridot": "\u25EC",
  "trie": "\u225C",
  "triminus": "\u2A3A",
  "TripleDot": "\u20DB",
  "triplus": "\u2A39",
  "trisb": "\u29CD",
  "tritime": "\u2A3B",
  "trpezium": "\u23E2",
  "Tscr": "\u{1D4AF}",
  "tscr": "\u{1D4C9}",
  "TScy": "\u0426",
  "tscy": "\u0446",
  "TSHcy": "\u040B",
  "tshcy": "\u045B",
  "Tstrok": "\u0166",
  "tstrok": "\u0167",
  "twixt": "\u226C",
  "twoheadleftarrow": "\u219E",
  "twoheadrightarrow": "\u21A0",
  "Uacute": "\xDA",
  "uacute": "\xFA",
  "Uarr": "\u219F",
  "uArr": "\u21D1",
  "uarr": "\u2191",
  "Uarrocir": "\u2949",
  "Ubrcy": "\u040E",
  "ubrcy": "\u045E",
  "Ubreve": "\u016C",
  "ubreve": "\u016D",
  "Ucirc": "\xDB",
  "ucirc": "\xFB",
  "Ucy": "\u0423",
  "ucy": "\u0443",
  "udarr": "\u21C5",
  "Udblac": "\u0170",
  "udblac": "\u0171",
  "udhar": "\u296E",
  "ufisht": "\u297E",
  "Ufr": "\u{1D518}",
  "ufr": "\u{1D532}",
  "Ugrave": "\xD9",
  "ugrave": "\xF9",
  "uHar": "\u2963",
  "uharl": "\u21BF",
  "uharr": "\u21BE",
  "uhblk": "\u2580",
  "ulcorn": "\u231C",
  "ulcorner": "\u231C",
  "ulcrop": "\u230F",
  "ultri": "\u25F8",
  "Umacr": "\u016A",
  "umacr": "\u016B",
  "uml": "\xA8",
  "UnderBar": "_",
  "UnderBrace": "\u23DF",
  "UnderBracket": "\u23B5",
  "UnderParenthesis": "\u23DD",
  "Union": "\u22C3",
  "UnionPlus": "\u228E",
  "Uogon": "\u0172",
  "uogon": "\u0173",
  "Uopf": "\u{1D54C}",
  "uopf": "\u{1D566}",
  "UpArrow": "\u2191",
  "Uparrow": "\u21D1",
  "uparrow": "\u2191",
  "UpArrowBar": "\u2912",
  "UpArrowDownArrow": "\u21C5",
  "UpDownArrow": "\u2195",
  "Updownarrow": "\u21D5",
  "updownarrow": "\u2195",
  "UpEquilibrium": "\u296E",
  "upharpoonleft": "\u21BF",
  "upharpoonright": "\u21BE",
  "uplus": "\u228E",
  "UpperLeftArrow": "\u2196",
  "UpperRightArrow": "\u2197",
  "Upsi": "\u03D2",
  "upsi": "\u03C5",
  "upsih": "\u03D2",
  "Upsilon": "\u03A5",
  "upsilon": "\u03C5",
  "UpTee": "\u22A5",
  "UpTeeArrow": "\u21A5",
  "upuparrows": "\u21C8",
  "urcorn": "\u231D",
  "urcorner": "\u231D",
  "urcrop": "\u230E",
  "Uring": "\u016E",
  "uring": "\u016F",
  "urtri": "\u25F9",
  "Uscr": "\u{1D4B0}",
  "uscr": "\u{1D4CA}",
  "utdot": "\u22F0",
  "Utilde": "\u0168",
  "utilde": "\u0169",
  "utri": "\u25B5",
  "utrif": "\u25B4",
  "uuarr": "\u21C8",
  "Uuml": "\xDC",
  "uuml": "\xFC",
  "uwangle": "\u29A7",
  "vangrt": "\u299C",
  "varepsilon": "\u03F5",
  "varkappa": "\u03F0",
  "varnothing": "\u2205",
  "varphi": "\u03D5",
  "varpi": "\u03D6",
  "varpropto": "\u221D",
  "vArr": "\u21D5",
  "varr": "\u2195",
  "varrho": "\u03F1",
  "varsigma": "\u03C2",
  "varsubsetneq": "\u228A\uFE00",
  "varsubsetneqq": "\u2ACB\uFE00",
  "varsupsetneq": "\u228B\uFE00",
  "varsupsetneqq": "\u2ACC\uFE00",
  "vartheta": "\u03D1",
  "vartriangleleft": "\u22B2",
  "vartriangleright": "\u22B3",
  "Vbar": "\u2AEB",
  "vBar": "\u2AE8",
  "vBarv": "\u2AE9",
  "Vcy": "\u0412",
  "vcy": "\u0432",
  "VDash": "\u22AB",
  "Vdash": "\u22A9",
  "vDash": "\u22A8",
  "vdash": "\u22A2",
  "Vdashl": "\u2AE6",
  "Vee": "\u22C1",
  "vee": "\u2228",
  "veebar": "\u22BB",
  "veeeq": "\u225A",
  "vellip": "\u22EE",
  "Verbar": "\u2016",
  "verbar": "|",
  "Vert": "\u2016",
  "vert": "|",
  "VerticalBar": "\u2223",
  "VerticalLine": "|",
  "VerticalSeparator": "\u2758",
  "VerticalTilde": "\u2240",
  "VeryThinSpace": "\u200A",
  "Vfr": "\u{1D519}",
  "vfr": "\u{1D533}",
  "vltri": "\u22B2",
  "vnsub": "\u2282\u20D2",
  "vnsup": "\u2283\u20D2",
  "Vopf": "\u{1D54D}",
  "vopf": "\u{1D567}",
  "vprop": "\u221D",
  "vrtri": "\u22B3",
  "Vscr": "\u{1D4B1}",
  "vscr": "\u{1D4CB}",
  "vsubnE": "\u2ACB\uFE00",
  "vsubne": "\u228A\uFE00",
  "vsupnE": "\u2ACC\uFE00",
  "vsupne": "\u228B\uFE00",
  "Vvdash": "\u22AA",
  "vzigzag": "\u299A",
  "Wcirc": "\u0174",
  "wcirc": "\u0175",
  "wedbar": "\u2A5F",
  "Wedge": "\u22C0",
  "wedge": "\u2227",
  "wedgeq": "\u2259",
  "weierp": "\u2118",
  "Wfr": "\u{1D51A}",
  "wfr": "\u{1D534}",
  "Wopf": "\u{1D54E}",
  "wopf": "\u{1D568}",
  "wp": "\u2118",
  "wr": "\u2240",
  "wreath": "\u2240",
  "Wscr": "\u{1D4B2}",
  "wscr": "\u{1D4CC}",
  "xcap": "\u22C2",
  "xcirc": "\u25EF",
  "xcup": "\u22C3",
  "xdtri": "\u25BD",
  "Xfr": "\u{1D51B}",
  "xfr": "\u{1D535}",
  "xhArr": "\u27FA",
  "xharr": "\u27F7",
  "Xi": "\u039E",
  "xi": "\u03BE",
  "xlArr": "\u27F8",
  "xlarr": "\u27F5",
  "xmap": "\u27FC",
  "xnis": "\u22FB",
  "xodot": "\u2A00",
  "Xopf": "\u{1D54F}",
  "xopf": "\u{1D569}",
  "xoplus": "\u2A01",
  "xotime": "\u2A02",
  "xrArr": "\u27F9",
  "xrarr": "\u27F6",
  "Xscr": "\u{1D4B3}",
  "xscr": "\u{1D4CD}",
  "xsqcup": "\u2A06",
  "xuplus": "\u2A04",
  "xutri": "\u25B3",
  "xvee": "\u22C1",
  "xwedge": "\u22C0",
  "Yacute": "\xDD",
  "yacute": "\xFD",
  "YAcy": "\u042F",
  "yacy": "\u044F",
  "Ycirc": "\u0176",
  "ycirc": "\u0177",
  "Ycy": "\u042B",
  "ycy": "\u044B",
  "yen": "\xA5",
  "Yfr": "\u{1D51C}",
  "yfr": "\u{1D536}",
  "YIcy": "\u0407",
  "yicy": "\u0457",
  "Yopf": "\u{1D550}",
  "yopf": "\u{1D56A}",
  "Yscr": "\u{1D4B4}",
  "yscr": "\u{1D4CE}",
  "YUcy": "\u042E",
  "yucy": "\u044E",
  "Yuml": "\u0178",
  "yuml": "\xFF",
  "Zacute": "\u0179",
  "zacute": "\u017A",
  "Zcaron": "\u017D",
  "zcaron": "\u017E",
  "Zcy": "\u0417",
  "zcy": "\u0437",
  "Zdot": "\u017B",
  "zdot": "\u017C",
  "zeetrf": "\u2128",
  "ZeroWidthSpace": "\u200B",
  "Zeta": "\u0396",
  "zeta": "\u03B6",
  "Zfr": "\u2128",
  "zfr": "\u{1D537}",
  "ZHcy": "\u0416",
  "zhcy": "\u0436",
  "zigrarr": "\u21DD",
  "Zopf": "\u2124",
  "zopf": "\u{1D56B}",
  "Zscr": "\u{1D4B5}",
  "zscr": "\u{1D4CF}",
  "zwj": "\u200D",
  "zwnj": "\u200C"
};
var hasOwn = Object.prototype.hasOwnProperty;
function has(object, key) {
  return object ? hasOwn.call(object, key) : false;
}
function decodeEntity(name) {
  if (has(entities, name)) {
    return entities[name];
  } else {
    return name;
  }
}
var hasOwn$1 = Object.prototype.hasOwnProperty;
function has$1(object, key) {
  return object ? hasOwn$1.call(object, key) : false;
}
function assign(obj) {
  var sources = [].slice.call(arguments, 1);
  sources.forEach(function(source) {
    if (!source) {
      return;
    }
    if (typeof source !== "object") {
      throw new TypeError(source + "must be object");
    }
    Object.keys(source).forEach(function(key) {
      obj[key] = source[key];
    });
  });
  return obj;
}
var UNESCAPE_MD_RE = /\\([\\!"#$%&'()*+,.\/:;<=>?@[\]^_`{|}~-])/g;
function unescapeMd(str) {
  if (str.indexOf("\\") < 0) {
    return str;
  }
  return str.replace(UNESCAPE_MD_RE, "$1");
}
function isValidEntityCode(c) {
  if (c >= 55296 && c <= 57343) {
    return false;
  }
  if (c >= 64976 && c <= 65007) {
    return false;
  }
  if ((c & 65535) === 65535 || (c & 65535) === 65534) {
    return false;
  }
  if (c >= 0 && c <= 8) {
    return false;
  }
  if (c === 11) {
    return false;
  }
  if (c >= 14 && c <= 31) {
    return false;
  }
  if (c >= 127 && c <= 159) {
    return false;
  }
  if (c > 1114111) {
    return false;
  }
  return true;
}
function fromCodePoint(c) {
  if (c > 65535) {
    c -= 65536;
    var surrogate1 = 55296 + (c >> 10), surrogate2 = 56320 + (c & 1023);
    return String.fromCharCode(surrogate1, surrogate2);
  }
  return String.fromCharCode(c);
}
var NAMED_ENTITY_RE = /&([a-z#][a-z0-9]{1,31});/gi;
var DIGITAL_ENTITY_TEST_RE = /^#((?:x[a-f0-9]{1,8}|[0-9]{1,8}))/i;
function replaceEntityPattern(match, name) {
  var code2 = 0;
  var decoded = decodeEntity(name);
  if (name !== decoded) {
    return decoded;
  } else if (name.charCodeAt(0) === 35 && DIGITAL_ENTITY_TEST_RE.test(name)) {
    code2 = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (isValidEntityCode(code2)) {
      return fromCodePoint(code2);
    }
  }
  return match;
}
function replaceEntities(str) {
  if (str.indexOf("&") < 0) {
    return str;
  }
  return str.replace(NAMED_ENTITY_RE, replaceEntityPattern);
}
var HTML_ESCAPE_TEST_RE = /[&<>"]/;
var HTML_ESCAPE_REPLACE_RE = /[&<>"]/g;
var HTML_REPLACEMENTS = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
};
function replaceUnsafeChar(ch) {
  return HTML_REPLACEMENTS[ch];
}
function escapeHtml(str) {
  if (HTML_ESCAPE_TEST_RE.test(str)) {
    return str.replace(HTML_ESCAPE_REPLACE_RE, replaceUnsafeChar);
  }
  return str;
}
var rules = {};
rules.blockquote_open = function() {
  return "<blockquote>\n";
};
rules.blockquote_close = function(tokens, idx) {
  return "</blockquote>" + getBreak(tokens, idx);
};
rules.code = function(tokens, idx) {
  if (tokens[idx].block) {
    return "<pre><code>" + escapeHtml(tokens[idx].content) + "</code></pre>" + getBreak(tokens, idx);
  }
  return "<code>" + escapeHtml(tokens[idx].content) + "</code>";
};
rules.fence = function(tokens, idx, options, env, instance) {
  var token = tokens[idx];
  var langClass = "";
  var langPrefix = options.langPrefix;
  var langName = "", fences2, fenceName;
  var highlighted;
  if (token.params) {
    fences2 = token.params.split(/\s+/g);
    fenceName = fences2.join(" ");
    if (has$1(instance.rules.fence_custom, fences2[0])) {
      return instance.rules.fence_custom[fences2[0]](tokens, idx, options, env, instance);
    }
    langName = escapeHtml(replaceEntities(unescapeMd(fenceName)));
    langClass = ' class="' + langPrefix + langName + '"';
  }
  if (options.highlight) {
    highlighted = options.highlight.apply(options.highlight, [token.content].concat(fences2)) || escapeHtml(token.content);
  } else {
    highlighted = escapeHtml(token.content);
  }
  return "<pre><code" + langClass + ">" + highlighted + "</code></pre>" + getBreak(tokens, idx);
};
rules.fence_custom = {};
rules.heading_open = function(tokens, idx) {
  return "<h" + tokens[idx].hLevel + ">";
};
rules.heading_close = function(tokens, idx) {
  return "</h" + tokens[idx].hLevel + ">\n";
};
rules.hr = function(tokens, idx, options) {
  return (options.xhtmlOut ? "<hr />" : "<hr>") + getBreak(tokens, idx);
};
rules.bullet_list_open = function() {
  return "<ul>\n";
};
rules.bullet_list_close = function(tokens, idx) {
  return "</ul>" + getBreak(tokens, idx);
};
rules.list_item_open = function() {
  return "<li>";
};
rules.list_item_close = function() {
  return "</li>\n";
};
rules.ordered_list_open = function(tokens, idx) {
  var token = tokens[idx];
  var order = token.order > 1 ? ' start="' + token.order + '"' : "";
  return "<ol" + order + ">\n";
};
rules.ordered_list_close = function(tokens, idx) {
  return "</ol>" + getBreak(tokens, idx);
};
rules.paragraph_open = function(tokens, idx) {
  return tokens[idx].tight ? "" : "<p>";
};
rules.paragraph_close = function(tokens, idx) {
  var addBreak = !(tokens[idx].tight && idx && tokens[idx - 1].type === "inline" && !tokens[idx - 1].content);
  return (tokens[idx].tight ? "" : "</p>") + (addBreak ? getBreak(tokens, idx) : "");
};
rules.link_open = function(tokens, idx, options) {
  var title = tokens[idx].title ? ' title="' + escapeHtml(replaceEntities(tokens[idx].title)) + '"' : "";
  var target = options.linkTarget ? ' target="' + options.linkTarget + '"' : "";
  return '<a href="' + escapeHtml(tokens[idx].href) + '"' + title + target + ">";
};
rules.link_close = function() {
  return "</a>";
};
rules.image = function(tokens, idx, options) {
  var src = ' src="' + escapeHtml(tokens[idx].src) + '"';
  var title = tokens[idx].title ? ' title="' + escapeHtml(replaceEntities(tokens[idx].title)) + '"' : "";
  var alt = ' alt="' + (tokens[idx].alt ? escapeHtml(replaceEntities(unescapeMd(tokens[idx].alt))) : "") + '"';
  var suffix = options.xhtmlOut ? " /" : "";
  return "<img" + src + alt + title + suffix + ">";
};
rules.table_open = function() {
  return "<table>\n";
};
rules.table_close = function() {
  return "</table>\n";
};
rules.thead_open = function() {
  return "<thead>\n";
};
rules.thead_close = function() {
  return "</thead>\n";
};
rules.tbody_open = function() {
  return "<tbody>\n";
};
rules.tbody_close = function() {
  return "</tbody>\n";
};
rules.tr_open = function() {
  return "<tr>";
};
rules.tr_close = function() {
  return "</tr>\n";
};
rules.th_open = function(tokens, idx) {
  var token = tokens[idx];
  return "<th" + (token.align ? ' style="text-align:' + token.align + '"' : "") + ">";
};
rules.th_close = function() {
  return "</th>";
};
rules.td_open = function(tokens, idx) {
  var token = tokens[idx];
  return "<td" + (token.align ? ' style="text-align:' + token.align + '"' : "") + ">";
};
rules.td_close = function() {
  return "</td>";
};
rules.strong_open = function() {
  return "<strong>";
};
rules.strong_close = function() {
  return "</strong>";
};
rules.em_open = function() {
  return "<em>";
};
rules.em_close = function() {
  return "</em>";
};
rules.del_open = function() {
  return "<del>";
};
rules.del_close = function() {
  return "</del>";
};
rules.ins_open = function() {
  return "<ins>";
};
rules.ins_close = function() {
  return "</ins>";
};
rules.mark_open = function() {
  return "<mark>";
};
rules.mark_close = function() {
  return "</mark>";
};
rules.sub = function(tokens, idx) {
  return "<sub>" + escapeHtml(tokens[idx].content) + "</sub>";
};
rules.sup = function(tokens, idx) {
  return "<sup>" + escapeHtml(tokens[idx].content) + "</sup>";
};
rules.hardbreak = function(tokens, idx, options) {
  return options.xhtmlOut ? "<br />\n" : "<br>\n";
};
rules.softbreak = function(tokens, idx, options) {
  return options.breaks ? options.xhtmlOut ? "<br />\n" : "<br>\n" : "\n";
};
rules.text = function(tokens, idx) {
  return escapeHtml(tokens[idx].content);
};
rules.htmlblock = function(tokens, idx) {
  return tokens[idx].content;
};
rules.htmltag = function(tokens, idx) {
  return tokens[idx].content;
};
rules.abbr_open = function(tokens, idx) {
  return '<abbr title="' + escapeHtml(replaceEntities(tokens[idx].title)) + '">';
};
rules.abbr_close = function() {
  return "</abbr>";
};
rules.footnote_ref = function(tokens, idx) {
  var n = Number(tokens[idx].id + 1).toString();
  var id = "fnref" + n;
  if (tokens[idx].subId > 0) {
    id += ":" + tokens[idx].subId;
  }
  return '<sup class="footnote-ref"><a href="#fn' + n + '" id="' + id + '">[' + n + "]</a></sup>";
};
rules.footnote_block_open = function(tokens, idx, options) {
  var hr2 = options.xhtmlOut ? '<hr class="footnotes-sep" />\n' : '<hr class="footnotes-sep">\n';
  return hr2 + '<section class="footnotes">\n<ol class="footnotes-list">\n';
};
rules.footnote_block_close = function() {
  return "</ol>\n</section>\n";
};
rules.footnote_open = function(tokens, idx) {
  var id = Number(tokens[idx].id + 1).toString();
  return '<li id="fn' + id + '"  class="footnote-item">';
};
rules.footnote_close = function() {
  return "</li>\n";
};
rules.footnote_anchor = function(tokens, idx) {
  var n = Number(tokens[idx].id + 1).toString();
  var id = "fnref" + n;
  if (tokens[idx].subId > 0) {
    id += ":" + tokens[idx].subId;
  }
  return ' <a href="#' + id + '" class="footnote-backref">\u21A9</a>';
};
rules.dl_open = function() {
  return "<dl>\n";
};
rules.dt_open = function() {
  return "<dt>";
};
rules.dd_open = function() {
  return "<dd>";
};
rules.dl_close = function() {
  return "</dl>\n";
};
rules.dt_close = function() {
  return "</dt>\n";
};
rules.dd_close = function() {
  return "</dd>\n";
};
function nextToken(tokens, idx) {
  if (++idx >= tokens.length - 2) {
    return idx;
  }
  if (tokens[idx].type === "paragraph_open" && tokens[idx].tight && (tokens[idx + 1].type === "inline" && tokens[idx + 1].content.length === 0) && (tokens[idx + 2].type === "paragraph_close" && tokens[idx + 2].tight)) {
    return nextToken(tokens, idx + 2);
  }
  return idx;
}
var getBreak = rules.getBreak = function getBreak2(tokens, idx) {
  idx = nextToken(tokens, idx);
  if (idx < tokens.length && tokens[idx].type === "list_item_close") {
    return "";
  }
  return "\n";
};
function Renderer() {
  this.rules = assign({}, rules);
  this.getBreak = rules.getBreak;
}
Renderer.prototype.renderInline = function(tokens, options, env) {
  var _rules2 = this.rules;
  var len = tokens.length, i2 = 0;
  var result = "";
  while (len--) {
    result += _rules2[tokens[i2].type](tokens, i2++, options, env, this);
  }
  return result;
};
Renderer.prototype.render = function(tokens, options, env) {
  var _rules2 = this.rules;
  var len = tokens.length, i2 = -1;
  var result = "";
  while (++i2 < len) {
    if (tokens[i2].type === "inline") {
      result += this.renderInline(tokens[i2].children, options, env);
    } else {
      result += _rules2[tokens[i2].type](tokens, i2, options, env, this);
    }
  }
  return result;
};
function Ruler() {
  this.__rules__ = [];
  this.__cache__ = null;
}
Ruler.prototype.__find__ = function(name) {
  var len = this.__rules__.length;
  var i2 = -1;
  while (len--) {
    if (this.__rules__[++i2].name === name) {
      return i2;
    }
  }
  return -1;
};
Ruler.prototype.__compile__ = function() {
  var self = this;
  var chains = [""];
  self.__rules__.forEach(function(rule) {
    if (!rule.enabled) {
      return;
    }
    rule.alt.forEach(function(altName) {
      if (chains.indexOf(altName) < 0) {
        chains.push(altName);
      }
    });
  });
  self.__cache__ = {};
  chains.forEach(function(chain) {
    self.__cache__[chain] = [];
    self.__rules__.forEach(function(rule) {
      if (!rule.enabled) {
        return;
      }
      if (chain && rule.alt.indexOf(chain) < 0) {
        return;
      }
      self.__cache__[chain].push(rule.fn);
    });
  });
};
Ruler.prototype.at = function(name, fn, options) {
  var idx = this.__find__(name);
  var opt = options || {};
  if (idx === -1) {
    throw new Error("Parser rule not found: " + name);
  }
  this.__rules__[idx].fn = fn;
  this.__rules__[idx].alt = opt.alt || [];
  this.__cache__ = null;
};
Ruler.prototype.before = function(beforeName, ruleName, fn, options) {
  var idx = this.__find__(beforeName);
  var opt = options || {};
  if (idx === -1) {
    throw new Error("Parser rule not found: " + beforeName);
  }
  this.__rules__.splice(idx, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.after = function(afterName, ruleName, fn, options) {
  var idx = this.__find__(afterName);
  var opt = options || {};
  if (idx === -1) {
    throw new Error("Parser rule not found: " + afterName);
  }
  this.__rules__.splice(idx + 1, 0, {
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.push = function(ruleName, fn, options) {
  var opt = options || {};
  this.__rules__.push({
    name: ruleName,
    enabled: true,
    fn,
    alt: opt.alt || []
  });
  this.__cache__ = null;
};
Ruler.prototype.enable = function(list2, strict) {
  list2 = !Array.isArray(list2) ? [list2] : list2;
  if (strict) {
    this.__rules__.forEach(function(rule) {
      rule.enabled = false;
    });
  }
  list2.forEach(function(name) {
    var idx = this.__find__(name);
    if (idx < 0) {
      throw new Error("Rules manager: invalid rule name " + name);
    }
    this.__rules__[idx].enabled = true;
  }, this);
  this.__cache__ = null;
};
Ruler.prototype.disable = function(list2) {
  list2 = !Array.isArray(list2) ? [list2] : list2;
  list2.forEach(function(name) {
    var idx = this.__find__(name);
    if (idx < 0) {
      throw new Error("Rules manager: invalid rule name " + name);
    }
    this.__rules__[idx].enabled = false;
  }, this);
  this.__cache__ = null;
};
Ruler.prototype.getRules = function(chainName) {
  if (this.__cache__ === null) {
    this.__compile__();
  }
  return this.__cache__[chainName] || [];
};
function block(state) {
  if (state.inlineMode) {
    state.tokens.push({
      type: "inline",
      content: state.src.replace(/\n/g, " ").trim(),
      level: 0,
      lines: [0, 1],
      children: []
    });
  } else {
    state.block.parse(state.src, state.options, state.env, state.tokens);
  }
}
function StateInline(src, parserInline, options, env, outTokens) {
  this.src = src;
  this.env = env;
  this.options = options;
  this.parser = parserInline;
  this.tokens = outTokens;
  this.pos = 0;
  this.posMax = this.src.length;
  this.level = 0;
  this.pending = "";
  this.pendingLevel = 0;
  this.cache = [];
  this.isInLabel = false;
  this.linkLevel = 0;
  this.linkContent = "";
  this.labelUnmatchedScopes = 0;
}
StateInline.prototype.pushPending = function() {
  this.tokens.push({
    type: "text",
    content: this.pending,
    level: this.pendingLevel
  });
  this.pending = "";
};
StateInline.prototype.push = function(token) {
  if (this.pending) {
    this.pushPending();
  }
  this.tokens.push(token);
  this.pendingLevel = this.level;
};
StateInline.prototype.cacheSet = function(key, val) {
  for (var i2 = this.cache.length; i2 <= key; i2++) {
    this.cache.push(0);
  }
  this.cache[key] = val;
};
StateInline.prototype.cacheGet = function(key) {
  return key < this.cache.length ? this.cache[key] : 0;
};
function parseLinkLabel(state, start) {
  var level, found, marker, labelEnd = -1, max = state.posMax, oldPos = state.pos, oldFlag = state.isInLabel;
  if (state.isInLabel) {
    return -1;
  }
  if (state.labelUnmatchedScopes) {
    state.labelUnmatchedScopes--;
    return -1;
  }
  state.pos = start + 1;
  state.isInLabel = true;
  level = 1;
  while (state.pos < max) {
    marker = state.src.charCodeAt(state.pos);
    if (marker === 91) {
      level++;
    } else if (marker === 93) {
      level--;
      if (level === 0) {
        found = true;
        break;
      }
    }
    state.parser.skipToken(state);
  }
  if (found) {
    labelEnd = state.pos;
    state.labelUnmatchedScopes = 0;
  } else {
    state.labelUnmatchedScopes = level - 1;
  }
  state.pos = oldPos;
  state.isInLabel = oldFlag;
  return labelEnd;
}
function parseAbbr(str, parserInline, options, env) {
  var state, labelEnd, pos, max, label, title;
  if (str.charCodeAt(0) !== 42) {
    return -1;
  }
  if (str.charCodeAt(1) !== 91) {
    return -1;
  }
  if (str.indexOf("]:") === -1) {
    return -1;
  }
  state = new StateInline(str, parserInline, options, env, []);
  labelEnd = parseLinkLabel(state, 1);
  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) {
    return -1;
  }
  max = state.posMax;
  for (pos = labelEnd + 2; pos < max; pos++) {
    if (state.src.charCodeAt(pos) === 10) {
      break;
    }
  }
  label = str.slice(2, labelEnd);
  title = str.slice(labelEnd + 2, pos).trim();
  if (title.length === 0) {
    return -1;
  }
  if (!env.abbreviations) {
    env.abbreviations = {};
  }
  if (typeof env.abbreviations[":" + label] === "undefined") {
    env.abbreviations[":" + label] = title;
  }
  return pos;
}
function abbr(state) {
  var tokens = state.tokens, i2, l, content, pos;
  if (state.inlineMode) {
    return;
  }
  for (i2 = 1, l = tokens.length - 1; i2 < l; i2++) {
    if (tokens[i2 - 1].type === "paragraph_open" && tokens[i2].type === "inline" && tokens[i2 + 1].type === "paragraph_close") {
      content = tokens[i2].content;
      while (content.length) {
        pos = parseAbbr(content, state.inline, state.options, state.env);
        if (pos < 0) {
          break;
        }
        content = content.slice(pos).trim();
      }
      tokens[i2].content = content;
      if (!content.length) {
        tokens[i2 - 1].tight = true;
        tokens[i2 + 1].tight = true;
      }
    }
  }
}
function normalizeLink(url) {
  var normalized = replaceEntities(url);
  try {
    normalized = decodeURI(normalized);
  } catch (err) {
  }
  return encodeURI(normalized);
}
function parseLinkDestination(state, pos) {
  var code2, level, link, start = pos, max = state.posMax;
  if (state.src.charCodeAt(pos) === 60) {
    pos++;
    while (pos < max) {
      code2 = state.src.charCodeAt(pos);
      if (code2 === 10) {
        return false;
      }
      if (code2 === 62) {
        link = normalizeLink(unescapeMd(state.src.slice(start + 1, pos)));
        if (!state.parser.validateLink(link)) {
          return false;
        }
        state.pos = pos + 1;
        state.linkContent = link;
        return true;
      }
      if (code2 === 92 && pos + 1 < max) {
        pos += 2;
        continue;
      }
      pos++;
    }
    return false;
  }
  level = 0;
  while (pos < max) {
    code2 = state.src.charCodeAt(pos);
    if (code2 === 32) {
      break;
    }
    if (code2 < 32 || code2 === 127) {
      break;
    }
    if (code2 === 92 && pos + 1 < max) {
      pos += 2;
      continue;
    }
    if (code2 === 40) {
      level++;
      if (level > 1) {
        break;
      }
    }
    if (code2 === 41) {
      level--;
      if (level < 0) {
        break;
      }
    }
    pos++;
  }
  if (start === pos) {
    return false;
  }
  link = unescapeMd(state.src.slice(start, pos));
  if (!state.parser.validateLink(link)) {
    return false;
  }
  state.linkContent = link;
  state.pos = pos;
  return true;
}
function parseLinkTitle(state, pos) {
  var code2, start = pos, max = state.posMax, marker = state.src.charCodeAt(pos);
  if (marker !== 34 && marker !== 39 && marker !== 40) {
    return false;
  }
  pos++;
  if (marker === 40) {
    marker = 41;
  }
  while (pos < max) {
    code2 = state.src.charCodeAt(pos);
    if (code2 === marker) {
      state.pos = pos + 1;
      state.linkContent = unescapeMd(state.src.slice(start + 1, pos));
      return true;
    }
    if (code2 === 92 && pos + 1 < max) {
      pos += 2;
      continue;
    }
    pos++;
  }
  return false;
}
function normalizeReference(str) {
  return str.trim().replace(/\s+/g, " ").toUpperCase();
}
function parseReference(str, parser, options, env) {
  var state, labelEnd, pos, max, code2, start, href, title, label;
  if (str.charCodeAt(0) !== 91) {
    return -1;
  }
  if (str.indexOf("]:") === -1) {
    return -1;
  }
  state = new StateInline(str, parser, options, env, []);
  labelEnd = parseLinkLabel(state, 0);
  if (labelEnd < 0 || str.charCodeAt(labelEnd + 1) !== 58) {
    return -1;
  }
  max = state.posMax;
  for (pos = labelEnd + 2; pos < max; pos++) {
    code2 = state.src.charCodeAt(pos);
    if (code2 !== 32 && code2 !== 10) {
      break;
    }
  }
  if (!parseLinkDestination(state, pos)) {
    return -1;
  }
  href = state.linkContent;
  pos = state.pos;
  start = pos;
  for (pos = pos + 1; pos < max; pos++) {
    code2 = state.src.charCodeAt(pos);
    if (code2 !== 32 && code2 !== 10) {
      break;
    }
  }
  if (pos < max && start !== pos && parseLinkTitle(state, pos)) {
    title = state.linkContent;
    pos = state.pos;
  } else {
    title = "";
    pos = start;
  }
  while (pos < max && state.src.charCodeAt(pos) === 32) {
    pos++;
  }
  if (pos < max && state.src.charCodeAt(pos) !== 10) {
    return -1;
  }
  label = normalizeReference(str.slice(1, labelEnd));
  if (typeof env.references[label] === "undefined") {
    env.references[label] = { title, href };
  }
  return pos;
}
function references(state) {
  var tokens = state.tokens, i2, l, content, pos;
  state.env.references = state.env.references || {};
  if (state.inlineMode) {
    return;
  }
  for (i2 = 1, l = tokens.length - 1; i2 < l; i2++) {
    if (tokens[i2].type === "inline" && tokens[i2 - 1].type === "paragraph_open" && tokens[i2 + 1].type === "paragraph_close") {
      content = tokens[i2].content;
      while (content.length) {
        pos = parseReference(content, state.inline, state.options, state.env);
        if (pos < 0) {
          break;
        }
        content = content.slice(pos).trim();
      }
      tokens[i2].content = content;
      if (!content.length) {
        tokens[i2 - 1].tight = true;
        tokens[i2 + 1].tight = true;
      }
    }
  }
}
function inline(state) {
  var tokens = state.tokens, tok, i2, l;
  for (i2 = 0, l = tokens.length; i2 < l; i2++) {
    tok = tokens[i2];
    if (tok.type === "inline") {
      state.inline.parse(tok.content, state.options, state.env, tok.children);
    }
  }
}
function footnote_block(state) {
  var i2, l, j, t, lastParagraph, list2, tokens, current, currentLabel, level = 0, insideRef = false, refTokens = {};
  if (!state.env.footnotes) {
    return;
  }
  state.tokens = state.tokens.filter(function(tok) {
    if (tok.type === "footnote_reference_open") {
      insideRef = true;
      current = [];
      currentLabel = tok.label;
      return false;
    }
    if (tok.type === "footnote_reference_close") {
      insideRef = false;
      refTokens[":" + currentLabel] = current;
      return false;
    }
    if (insideRef) {
      current.push(tok);
    }
    return !insideRef;
  });
  if (!state.env.footnotes.list) {
    return;
  }
  list2 = state.env.footnotes.list;
  state.tokens.push({
    type: "footnote_block_open",
    level: level++
  });
  for (i2 = 0, l = list2.length; i2 < l; i2++) {
    state.tokens.push({
      type: "footnote_open",
      id: i2,
      level: level++
    });
    if (list2[i2].tokens) {
      tokens = [];
      tokens.push({
        type: "paragraph_open",
        tight: false,
        level: level++
      });
      tokens.push({
        type: "inline",
        content: "",
        level,
        children: list2[i2].tokens
      });
      tokens.push({
        type: "paragraph_close",
        tight: false,
        level: --level
      });
    } else if (list2[i2].label) {
      tokens = refTokens[":" + list2[i2].label];
    }
    state.tokens = state.tokens.concat(tokens);
    if (state.tokens[state.tokens.length - 1].type === "paragraph_close") {
      lastParagraph = state.tokens.pop();
    } else {
      lastParagraph = null;
    }
    t = list2[i2].count > 0 ? list2[i2].count : 1;
    for (j = 0; j < t; j++) {
      state.tokens.push({
        type: "footnote_anchor",
        id: i2,
        subId: j,
        level
      });
    }
    if (lastParagraph) {
      state.tokens.push(lastParagraph);
    }
    state.tokens.push({
      type: "footnote_close",
      level: --level
    });
  }
  state.tokens.push({
    type: "footnote_block_close",
    level: --level
  });
}
var PUNCT_CHARS = ` 
()[]'".,!?-`;
function regEscape(s) {
  return s.replace(/([-()\[\]{}+?*.$\^|,:#<!\\])/g, "\\$1");
}
function abbr2(state) {
  var i2, j, l, tokens, token, text3, nodes, pos, level, reg, m, regText, blockTokens = state.tokens;
  if (!state.env.abbreviations) {
    return;
  }
  if (!state.env.abbrRegExp) {
    regText = "(^|[" + PUNCT_CHARS.split("").map(regEscape).join("") + "])(" + Object.keys(state.env.abbreviations).map(function(x) {
      return x.substr(1);
    }).sort(function(a2, b) {
      return b.length - a2.length;
    }).map(regEscape).join("|") + ")($|[" + PUNCT_CHARS.split("").map(regEscape).join("") + "])";
    state.env.abbrRegExp = new RegExp(regText, "g");
  }
  reg = state.env.abbrRegExp;
  for (j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== "inline") {
      continue;
    }
    tokens = blockTokens[j].children;
    for (i2 = tokens.length - 1; i2 >= 0; i2--) {
      token = tokens[i2];
      if (token.type !== "text") {
        continue;
      }
      pos = 0;
      text3 = token.content;
      reg.lastIndex = 0;
      level = token.level;
      nodes = [];
      while (m = reg.exec(text3)) {
        if (reg.lastIndex > pos) {
          nodes.push({
            type: "text",
            content: text3.slice(pos, m.index + m[1].length),
            level
          });
        }
        nodes.push({
          type: "abbr_open",
          title: state.env.abbreviations[":" + m[2]],
          level: level++
        });
        nodes.push({
          type: "text",
          content: m[2],
          level
        });
        nodes.push({
          type: "abbr_close",
          level: --level
        });
        pos = reg.lastIndex - m[3].length;
      }
      if (!nodes.length) {
        continue;
      }
      if (pos < text3.length) {
        nodes.push({
          type: "text",
          content: text3.slice(pos),
          level
        });
      }
      blockTokens[j].children = tokens = [].concat(tokens.slice(0, i2), nodes, tokens.slice(i2 + 1));
    }
  }
}
var RARE_RE = /\+-|\.\.|\?\?\?\?|!!!!|,,|--/;
var SCOPED_ABBR_RE = /\((c|tm|r|p)\)/ig;
var SCOPED_ABBR = {
  "c": "\xA9",
  "r": "\xAE",
  "p": "\xA7",
  "tm": "\u2122"
};
function replaceScopedAbbr(str) {
  if (str.indexOf("(") < 0) {
    return str;
  }
  return str.replace(SCOPED_ABBR_RE, function(match, name) {
    return SCOPED_ABBR[name.toLowerCase()];
  });
}
function replace(state) {
  var i2, token, text3, inlineTokens, blkIdx;
  if (!state.options.typographer) {
    return;
  }
  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline") {
      continue;
    }
    inlineTokens = state.tokens[blkIdx].children;
    for (i2 = inlineTokens.length - 1; i2 >= 0; i2--) {
      token = inlineTokens[i2];
      if (token.type === "text") {
        text3 = token.content;
        text3 = replaceScopedAbbr(text3);
        if (RARE_RE.test(text3)) {
          text3 = text3.replace(/\+-/g, "\xB1").replace(/\.{2,}/g, "\u2026").replace(/([?!])…/g, "$1..").replace(/([?!]){4,}/g, "$1$1$1").replace(/,{2,}/g, ",").replace(/(^|[^-])---([^-]|$)/mg, "$1\u2014$2").replace(/(^|\s)--(\s|$)/mg, "$1\u2013$2").replace(/(^|[^-\s])--([^-\s]|$)/mg, "$1\u2013$2");
        }
        token.content = text3;
      }
    }
  }
}
var QUOTE_TEST_RE = /['"]/;
var QUOTE_RE = /['"]/g;
var PUNCT_RE = /[-\s()\[\]]/;
var APOSTROPHE = "\u2019";
function isLetter(str, pos) {
  if (pos < 0 || pos >= str.length) {
    return false;
  }
  return !PUNCT_RE.test(str[pos]);
}
function replaceAt(str, index, ch) {
  return str.substr(0, index) + ch + str.substr(index + 1);
}
function smartquotes(state) {
  var i2, token, text3, t, pos, max, thisLevel, lastSpace, nextSpace, item, canOpen, canClose, j, isSingle, blkIdx, tokens, stack;
  if (!state.options.typographer) {
    return;
  }
  stack = [];
  for (blkIdx = state.tokens.length - 1; blkIdx >= 0; blkIdx--) {
    if (state.tokens[blkIdx].type !== "inline") {
      continue;
    }
    tokens = state.tokens[blkIdx].children;
    stack.length = 0;
    for (i2 = 0; i2 < tokens.length; i2++) {
      token = tokens[i2];
      if (token.type !== "text" || QUOTE_TEST_RE.test(token.text)) {
        continue;
      }
      thisLevel = tokens[i2].level;
      for (j = stack.length - 1; j >= 0; j--) {
        if (stack[j].level <= thisLevel) {
          break;
        }
      }
      stack.length = j + 1;
      text3 = token.content;
      pos = 0;
      max = text3.length;
      OUTER:
        while (pos < max) {
          QUOTE_RE.lastIndex = pos;
          t = QUOTE_RE.exec(text3);
          if (!t) {
            break;
          }
          lastSpace = !isLetter(text3, t.index - 1);
          pos = t.index + 1;
          isSingle = t[0] === "'";
          nextSpace = !isLetter(text3, pos);
          if (!nextSpace && !lastSpace) {
            if (isSingle) {
              token.content = replaceAt(token.content, t.index, APOSTROPHE);
            }
            continue;
          }
          canOpen = !nextSpace;
          canClose = !lastSpace;
          if (canClose) {
            for (j = stack.length - 1; j >= 0; j--) {
              item = stack[j];
              if (stack[j].level < thisLevel) {
                break;
              }
              if (item.single === isSingle && stack[j].level === thisLevel) {
                item = stack[j];
                if (isSingle) {
                  tokens[item.token].content = replaceAt(tokens[item.token].content, item.pos, state.options.quotes[2]);
                  token.content = replaceAt(token.content, t.index, state.options.quotes[3]);
                } else {
                  tokens[item.token].content = replaceAt(tokens[item.token].content, item.pos, state.options.quotes[0]);
                  token.content = replaceAt(token.content, t.index, state.options.quotes[1]);
                }
                stack.length = j;
                continue OUTER;
              }
            }
          }
          if (canOpen) {
            stack.push({
              token: i2,
              pos: t.index,
              single: isSingle,
              level: thisLevel
            });
          } else if (canClose && isSingle) {
            token.content = replaceAt(token.content, t.index, APOSTROPHE);
          }
        }
    }
  }
}
var _rules = [
  ["block", block],
  ["abbr", abbr],
  ["references", references],
  ["inline", inline],
  ["footnote_tail", footnote_block],
  ["abbr2", abbr2],
  ["replacements", replace],
  ["smartquotes", smartquotes]
];
function Core() {
  this.options = {};
  this.ruler = new Ruler();
  for (var i2 = 0; i2 < _rules.length; i2++) {
    this.ruler.push(_rules[i2][0], _rules[i2][1]);
  }
}
Core.prototype.process = function(state) {
  var i2, l, rules2;
  rules2 = this.ruler.getRules("");
  for (i2 = 0, l = rules2.length; i2 < l; i2++) {
    rules2[i2](state);
  }
};
function StateBlock(src, parser, options, env, tokens) {
  var ch, s, start, pos, len, indent, indent_found;
  this.src = src;
  this.parser = parser;
  this.options = options;
  this.env = env;
  this.tokens = tokens;
  this.bMarks = [];
  this.eMarks = [];
  this.tShift = [];
  this.blkIndent = 0;
  this.line = 0;
  this.lineMax = 0;
  this.tight = false;
  this.parentType = "root";
  this.ddIndent = -1;
  this.level = 0;
  this.result = "";
  s = this.src;
  indent = 0;
  indent_found = false;
  for (start = pos = indent = 0, len = s.length; pos < len; pos++) {
    ch = s.charCodeAt(pos);
    if (!indent_found) {
      if (ch === 32) {
        indent++;
        continue;
      } else {
        indent_found = true;
      }
    }
    if (ch === 10 || pos === len - 1) {
      if (ch !== 10) {
        pos++;
      }
      this.bMarks.push(start);
      this.eMarks.push(pos);
      this.tShift.push(indent);
      indent_found = false;
      indent = 0;
      start = pos + 1;
    }
  }
  this.bMarks.push(s.length);
  this.eMarks.push(s.length);
  this.tShift.push(0);
  this.lineMax = this.bMarks.length - 1;
}
StateBlock.prototype.isEmpty = function isEmpty(line) {
  return this.bMarks[line] + this.tShift[line] >= this.eMarks[line];
};
StateBlock.prototype.skipEmptyLines = function skipEmptyLines(from) {
  for (var max = this.lineMax; from < max; from++) {
    if (this.bMarks[from] + this.tShift[from] < this.eMarks[from]) {
      break;
    }
  }
  return from;
};
StateBlock.prototype.skipSpaces = function skipSpaces(pos) {
  for (var max = this.src.length; pos < max; pos++) {
    if (this.src.charCodeAt(pos) !== 32) {
      break;
    }
  }
  return pos;
};
StateBlock.prototype.skipChars = function skipChars(pos, code2) {
  for (var max = this.src.length; pos < max; pos++) {
    if (this.src.charCodeAt(pos) !== code2) {
      break;
    }
  }
  return pos;
};
StateBlock.prototype.skipCharsBack = function skipCharsBack(pos, code2, min) {
  if (pos <= min) {
    return pos;
  }
  while (pos > min) {
    if (code2 !== this.src.charCodeAt(--pos)) {
      return pos + 1;
    }
  }
  return pos;
};
StateBlock.prototype.getLines = function getLines(begin, end, indent, keepLastLF) {
  var i2, first, last, queue, shift, line = begin;
  if (begin >= end) {
    return "";
  }
  if (line + 1 === end) {
    first = this.bMarks[line] + Math.min(this.tShift[line], indent);
    last = keepLastLF ? this.eMarks[line] + 1 : this.eMarks[line];
    return this.src.slice(first, last);
  }
  queue = new Array(end - begin);
  for (i2 = 0; line < end; line++, i2++) {
    shift = this.tShift[line];
    if (shift > indent) {
      shift = indent;
    }
    if (shift < 0) {
      shift = 0;
    }
    first = this.bMarks[line] + shift;
    if (line + 1 < end || keepLastLF) {
      last = this.eMarks[line] + 1;
    } else {
      last = this.eMarks[line];
    }
    queue[i2] = this.src.slice(first, last);
  }
  return queue.join("");
};
function code(state, startLine, endLine) {
  var nextLine, last;
  if (state.tShift[startLine] - state.blkIndent < 4) {
    return false;
  }
  last = nextLine = startLine + 1;
  while (nextLine < endLine) {
    if (state.isEmpty(nextLine)) {
      nextLine++;
      continue;
    }
    if (state.tShift[nextLine] - state.blkIndent >= 4) {
      nextLine++;
      last = nextLine;
      continue;
    }
    break;
  }
  state.line = nextLine;
  state.tokens.push({
    type: "code",
    content: state.getLines(startLine, last, 4 + state.blkIndent, true),
    block: true,
    lines: [startLine, state.line],
    level: state.level
  });
  return true;
}
function fences(state, startLine, endLine, silent) {
  var marker, len, params, nextLine, mem, haveEndMarker = false, pos = state.bMarks[startLine] + state.tShift[startLine], max = state.eMarks[startLine];
  if (pos + 3 > max) {
    return false;
  }
  marker = state.src.charCodeAt(pos);
  if (marker !== 126 && marker !== 96) {
    return false;
  }
  mem = pos;
  pos = state.skipChars(pos, marker);
  len = pos - mem;
  if (len < 3) {
    return false;
  }
  params = state.src.slice(pos, max).trim();
  if (params.indexOf("`") >= 0) {
    return false;
  }
  if (silent) {
    return true;
  }
  nextLine = startLine;
  for (; ; ) {
    nextLine++;
    if (nextLine >= endLine) {
      break;
    }
    pos = mem = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos < max && state.tShift[nextLine] < state.blkIndent) {
      break;
    }
    if (state.src.charCodeAt(pos) !== marker) {
      continue;
    }
    if (state.tShift[nextLine] - state.blkIndent >= 4) {
      continue;
    }
    pos = state.skipChars(pos, marker);
    if (pos - mem < len) {
      continue;
    }
    pos = state.skipSpaces(pos);
    if (pos < max) {
      continue;
    }
    haveEndMarker = true;
    break;
  }
  len = state.tShift[startLine];
  state.line = nextLine + (haveEndMarker ? 1 : 0);
  state.tokens.push({
    type: "fence",
    params,
    content: state.getLines(startLine + 1, nextLine, len, true),
    lines: [startLine, state.line],
    level: state.level
  });
  return true;
}
function blockquote(state, startLine, endLine, silent) {
  var nextLine, lastLineEmpty, oldTShift, oldBMarks, oldIndent, oldParentType, lines, terminatorRules, i2, l, terminate, pos = state.bMarks[startLine] + state.tShift[startLine], max = state.eMarks[startLine];
  if (pos > max) {
    return false;
  }
  if (state.src.charCodeAt(pos++) !== 62) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  if (silent) {
    return true;
  }
  if (state.src.charCodeAt(pos) === 32) {
    pos++;
  }
  oldIndent = state.blkIndent;
  state.blkIndent = 0;
  oldBMarks = [state.bMarks[startLine]];
  state.bMarks[startLine] = pos;
  pos = pos < max ? state.skipSpaces(pos) : pos;
  lastLineEmpty = pos >= max;
  oldTShift = [state.tShift[startLine]];
  state.tShift[startLine] = pos - state.bMarks[startLine];
  terminatorRules = state.parser.ruler.getRules("blockquote");
  for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
    pos = state.bMarks[nextLine] + state.tShift[nextLine];
    max = state.eMarks[nextLine];
    if (pos >= max) {
      break;
    }
    if (state.src.charCodeAt(pos++) === 62) {
      if (state.src.charCodeAt(pos) === 32) {
        pos++;
      }
      oldBMarks.push(state.bMarks[nextLine]);
      state.bMarks[nextLine] = pos;
      pos = pos < max ? state.skipSpaces(pos) : pos;
      lastLineEmpty = pos >= max;
      oldTShift.push(state.tShift[nextLine]);
      state.tShift[nextLine] = pos - state.bMarks[nextLine];
      continue;
    }
    if (lastLineEmpty) {
      break;
    }
    terminate = false;
    for (i2 = 0, l = terminatorRules.length; i2 < l; i2++) {
      if (terminatorRules[i2](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
    oldBMarks.push(state.bMarks[nextLine]);
    oldTShift.push(state.tShift[nextLine]);
    state.tShift[nextLine] = -1337;
  }
  oldParentType = state.parentType;
  state.parentType = "blockquote";
  state.tokens.push({
    type: "blockquote_open",
    lines: lines = [startLine, 0],
    level: state.level++
  });
  state.parser.tokenize(state, startLine, nextLine);
  state.tokens.push({
    type: "blockquote_close",
    level: --state.level
  });
  state.parentType = oldParentType;
  lines[1] = state.line;
  for (i2 = 0; i2 < oldTShift.length; i2++) {
    state.bMarks[i2 + startLine] = oldBMarks[i2];
    state.tShift[i2 + startLine] = oldTShift[i2];
  }
  state.blkIndent = oldIndent;
  return true;
}
function hr(state, startLine, endLine, silent) {
  var marker, cnt, ch, pos = state.bMarks[startLine], max = state.eMarks[startLine];
  pos += state.tShift[startLine];
  if (pos > max) {
    return false;
  }
  marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 95) {
    return false;
  }
  cnt = 1;
  while (pos < max) {
    ch = state.src.charCodeAt(pos++);
    if (ch !== marker && ch !== 32) {
      return false;
    }
    if (ch === marker) {
      cnt++;
    }
  }
  if (cnt < 3) {
    return false;
  }
  if (silent) {
    return true;
  }
  state.line = startLine + 1;
  state.tokens.push({
    type: "hr",
    lines: [startLine, state.line],
    level: state.level
  });
  return true;
}
function skipBulletListMarker(state, startLine) {
  var marker, pos, max;
  pos = state.bMarks[startLine] + state.tShift[startLine];
  max = state.eMarks[startLine];
  if (pos >= max) {
    return -1;
  }
  marker = state.src.charCodeAt(pos++);
  if (marker !== 42 && marker !== 45 && marker !== 43) {
    return -1;
  }
  if (pos < max && state.src.charCodeAt(pos) !== 32) {
    return -1;
  }
  return pos;
}
function skipOrderedListMarker(state, startLine) {
  var ch, pos = state.bMarks[startLine] + state.tShift[startLine], max = state.eMarks[startLine];
  if (pos + 1 >= max) {
    return -1;
  }
  ch = state.src.charCodeAt(pos++);
  if (ch < 48 || ch > 57) {
    return -1;
  }
  for (; ; ) {
    if (pos >= max) {
      return -1;
    }
    ch = state.src.charCodeAt(pos++);
    if (ch >= 48 && ch <= 57) {
      continue;
    }
    if (ch === 41 || ch === 46) {
      break;
    }
    return -1;
  }
  if (pos < max && state.src.charCodeAt(pos) !== 32) {
    return -1;
  }
  return pos;
}
function markTightParagraphs(state, idx) {
  var i2, l, level = state.level + 2;
  for (i2 = idx + 2, l = state.tokens.length - 2; i2 < l; i2++) {
    if (state.tokens[i2].level === level && state.tokens[i2].type === "paragraph_open") {
      state.tokens[i2 + 2].tight = true;
      state.tokens[i2].tight = true;
      i2 += 2;
    }
  }
}
function list(state, startLine, endLine, silent) {
  var nextLine, indent, oldTShift, oldIndent, oldTight, oldParentType, start, posAfterMarker, max, indentAfterMarker, markerValue, markerCharCode, isOrdered, contentStart, listTokIdx, prevEmptyEnd, listLines, itemLines, tight = true, terminatorRules, i2, l, terminate;
  if ((posAfterMarker = skipOrderedListMarker(state, startLine)) >= 0) {
    isOrdered = true;
  } else if ((posAfterMarker = skipBulletListMarker(state, startLine)) >= 0) {
    isOrdered = false;
  } else {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  markerCharCode = state.src.charCodeAt(posAfterMarker - 1);
  if (silent) {
    return true;
  }
  listTokIdx = state.tokens.length;
  if (isOrdered) {
    start = state.bMarks[startLine] + state.tShift[startLine];
    markerValue = Number(state.src.substr(start, posAfterMarker - start - 1));
    state.tokens.push({
      type: "ordered_list_open",
      order: markerValue,
      lines: listLines = [startLine, 0],
      level: state.level++
    });
  } else {
    state.tokens.push({
      type: "bullet_list_open",
      lines: listLines = [startLine, 0],
      level: state.level++
    });
  }
  nextLine = startLine;
  prevEmptyEnd = false;
  terminatorRules = state.parser.ruler.getRules("list");
  while (nextLine < endLine) {
    contentStart = state.skipSpaces(posAfterMarker);
    max = state.eMarks[nextLine];
    if (contentStart >= max) {
      indentAfterMarker = 1;
    } else {
      indentAfterMarker = contentStart - posAfterMarker;
    }
    if (indentAfterMarker > 4) {
      indentAfterMarker = 1;
    }
    if (indentAfterMarker < 1) {
      indentAfterMarker = 1;
    }
    indent = posAfterMarker - state.bMarks[nextLine] + indentAfterMarker;
    state.tokens.push({
      type: "list_item_open",
      lines: itemLines = [startLine, 0],
      level: state.level++
    });
    oldIndent = state.blkIndent;
    oldTight = state.tight;
    oldTShift = state.tShift[startLine];
    oldParentType = state.parentType;
    state.tShift[startLine] = contentStart - state.bMarks[startLine];
    state.blkIndent = indent;
    state.tight = true;
    state.parentType = "list";
    state.parser.tokenize(state, startLine, endLine, true);
    if (!state.tight || prevEmptyEnd) {
      tight = false;
    }
    prevEmptyEnd = state.line - startLine > 1 && state.isEmpty(state.line - 1);
    state.blkIndent = oldIndent;
    state.tShift[startLine] = oldTShift;
    state.tight = oldTight;
    state.parentType = oldParentType;
    state.tokens.push({
      type: "list_item_close",
      level: --state.level
    });
    nextLine = startLine = state.line;
    itemLines[1] = nextLine;
    contentStart = state.bMarks[startLine];
    if (nextLine >= endLine) {
      break;
    }
    if (state.isEmpty(nextLine)) {
      break;
    }
    if (state.tShift[nextLine] < state.blkIndent) {
      break;
    }
    terminate = false;
    for (i2 = 0, l = terminatorRules.length; i2 < l; i2++) {
      if (terminatorRules[i2](state, nextLine, endLine, true)) {
        terminate = true;
        break;
      }
    }
    if (terminate) {
      break;
    }
    if (isOrdered) {
      posAfterMarker = skipOrderedListMarker(state, nextLine);
      if (posAfterMarker < 0) {
        break;
      }
    } else {
      posAfterMarker = skipBulletListMarker(state, nextLine);
      if (posAfterMarker < 0) {
        break;
      }
    }
    if (markerCharCode !== state.src.charCodeAt(posAfterMarker - 1)) {
      break;
    }
  }
  state.tokens.push({
    type: isOrdered ? "ordered_list_close" : "bullet_list_close",
    level: --state.level
  });
  listLines[1] = nextLine;
  state.line = nextLine;
  if (tight) {
    markTightParagraphs(state, listTokIdx);
  }
  return true;
}
function footnote(state, startLine, endLine, silent) {
  var oldBMark, oldTShift, oldParentType, pos, label, start = state.bMarks[startLine] + state.tShift[startLine], max = state.eMarks[startLine];
  if (start + 4 > max) {
    return false;
  }
  if (state.src.charCodeAt(start) !== 91) {
    return false;
  }
  if (state.src.charCodeAt(start + 1) !== 94) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  for (pos = start + 2; pos < max; pos++) {
    if (state.src.charCodeAt(pos) === 32) {
      return false;
    }
    if (state.src.charCodeAt(pos) === 93) {
      break;
    }
  }
  if (pos === start + 2) {
    return false;
  }
  if (pos + 1 >= max || state.src.charCodeAt(++pos) !== 58) {
    return false;
  }
  if (silent) {
    return true;
  }
  pos++;
  if (!state.env.footnotes) {
    state.env.footnotes = {};
  }
  if (!state.env.footnotes.refs) {
    state.env.footnotes.refs = {};
  }
  label = state.src.slice(start + 2, pos - 2);
  state.env.footnotes.refs[":" + label] = -1;
  state.tokens.push({
    type: "footnote_reference_open",
    label,
    level: state.level++
  });
  oldBMark = state.bMarks[startLine];
  oldTShift = state.tShift[startLine];
  oldParentType = state.parentType;
  state.tShift[startLine] = state.skipSpaces(pos) - pos;
  state.bMarks[startLine] = pos;
  state.blkIndent += 4;
  state.parentType = "footnote";
  if (state.tShift[startLine] < state.blkIndent) {
    state.tShift[startLine] += state.blkIndent;
    state.bMarks[startLine] -= state.blkIndent;
  }
  state.parser.tokenize(state, startLine, endLine, true);
  state.parentType = oldParentType;
  state.blkIndent -= 4;
  state.tShift[startLine] = oldTShift;
  state.bMarks[startLine] = oldBMark;
  state.tokens.push({
    type: "footnote_reference_close",
    level: --state.level
  });
  return true;
}
function heading(state, startLine, endLine, silent) {
  var ch, level, tmp, pos = state.bMarks[startLine] + state.tShift[startLine], max = state.eMarks[startLine];
  if (pos >= max) {
    return false;
  }
  ch = state.src.charCodeAt(pos);
  if (ch !== 35 || pos >= max) {
    return false;
  }
  level = 1;
  ch = state.src.charCodeAt(++pos);
  while (ch === 35 && pos < max && level <= 6) {
    level++;
    ch = state.src.charCodeAt(++pos);
  }
  if (level > 6 || pos < max && ch !== 32) {
    return false;
  }
  if (silent) {
    return true;
  }
  max = state.skipCharsBack(max, 32, pos);
  tmp = state.skipCharsBack(max, 35, pos);
  if (tmp > pos && state.src.charCodeAt(tmp - 1) === 32) {
    max = tmp;
  }
  state.line = startLine + 1;
  state.tokens.push({
    type: "heading_open",
    hLevel: level,
    lines: [startLine, state.line],
    level: state.level
  });
  if (pos < max) {
    state.tokens.push({
      type: "inline",
      content: state.src.slice(pos, max).trim(),
      level: state.level + 1,
      lines: [startLine, state.line],
      children: []
    });
  }
  state.tokens.push({ type: "heading_close", hLevel: level, level: state.level });
  return true;
}
function lheading(state, startLine, endLine) {
  var marker, pos, max, next = startLine + 1;
  if (next >= endLine) {
    return false;
  }
  if (state.tShift[next] < state.blkIndent) {
    return false;
  }
  if (state.tShift[next] - state.blkIndent > 3) {
    return false;
  }
  pos = state.bMarks[next] + state.tShift[next];
  max = state.eMarks[next];
  if (pos >= max) {
    return false;
  }
  marker = state.src.charCodeAt(pos);
  if (marker !== 45 && marker !== 61) {
    return false;
  }
  pos = state.skipChars(pos, marker);
  pos = state.skipSpaces(pos);
  if (pos < max) {
    return false;
  }
  pos = state.bMarks[startLine] + state.tShift[startLine];
  state.line = next + 1;
  state.tokens.push({
    type: "heading_open",
    hLevel: marker === 61 ? 1 : 2,
    lines: [startLine, state.line],
    level: state.level
  });
  state.tokens.push({
    type: "inline",
    content: state.src.slice(pos, state.eMarks[startLine]).trim(),
    level: state.level + 1,
    lines: [startLine, state.line - 1],
    children: []
  });
  state.tokens.push({
    type: "heading_close",
    hLevel: marker === 61 ? 1 : 2,
    level: state.level
  });
  return true;
}
var html_blocks = {};
[
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
].forEach(function(name) {
  html_blocks[name] = true;
});
var HTML_TAG_OPEN_RE = /^<([a-zA-Z]{1,15})[\s\/>]/;
var HTML_TAG_CLOSE_RE = /^<\/([a-zA-Z]{1,15})[\s>]/;
function isLetter$1(ch) {
  var lc = ch | 32;
  return lc >= 97 && lc <= 122;
}
function htmlblock(state, startLine, endLine, silent) {
  var ch, match, nextLine, pos = state.bMarks[startLine], max = state.eMarks[startLine], shift = state.tShift[startLine];
  pos += shift;
  if (!state.options.html) {
    return false;
  }
  if (shift > 3 || pos + 2 >= max) {
    return false;
  }
  if (state.src.charCodeAt(pos) !== 60) {
    return false;
  }
  ch = state.src.charCodeAt(pos + 1);
  if (ch === 33 || ch === 63) {
    if (silent) {
      return true;
    }
  } else if (ch === 47 || isLetter$1(ch)) {
    if (ch === 47) {
      match = state.src.slice(pos, max).match(HTML_TAG_CLOSE_RE);
      if (!match) {
        return false;
      }
    } else {
      match = state.src.slice(pos, max).match(HTML_TAG_OPEN_RE);
      if (!match) {
        return false;
      }
    }
    if (html_blocks[match[1].toLowerCase()] !== true) {
      return false;
    }
    if (silent) {
      return true;
    }
  } else {
    return false;
  }
  nextLine = startLine + 1;
  while (nextLine < state.lineMax && !state.isEmpty(nextLine)) {
    nextLine++;
  }
  state.line = nextLine;
  state.tokens.push({
    type: "htmlblock",
    level: state.level,
    lines: [startLine, state.line],
    content: state.getLines(startLine, nextLine, 0, true)
  });
  return true;
}
function getLine(state, line) {
  var pos = state.bMarks[line] + state.blkIndent, max = state.eMarks[line];
  return state.src.substr(pos, max - pos);
}
function table(state, startLine, endLine, silent) {
  var ch, lineText, pos, i2, nextLine, rows, cell, aligns, t, tableLines, tbodyLines;
  if (startLine + 2 > endLine) {
    return false;
  }
  nextLine = startLine + 1;
  if (state.tShift[nextLine] < state.blkIndent) {
    return false;
  }
  pos = state.bMarks[nextLine] + state.tShift[nextLine];
  if (pos >= state.eMarks[nextLine]) {
    return false;
  }
  ch = state.src.charCodeAt(pos);
  if (ch !== 124 && ch !== 45 && ch !== 58) {
    return false;
  }
  lineText = getLine(state, startLine + 1);
  if (!/^[-:| ]+$/.test(lineText)) {
    return false;
  }
  rows = lineText.split("|");
  if (rows <= 2) {
    return false;
  }
  aligns = [];
  for (i2 = 0; i2 < rows.length; i2++) {
    t = rows[i2].trim();
    if (!t) {
      if (i2 === 0 || i2 === rows.length - 1) {
        continue;
      } else {
        return false;
      }
    }
    if (!/^:?-+:?$/.test(t)) {
      return false;
    }
    if (t.charCodeAt(t.length - 1) === 58) {
      aligns.push(t.charCodeAt(0) === 58 ? "center" : "right");
    } else if (t.charCodeAt(0) === 58) {
      aligns.push("left");
    } else {
      aligns.push("");
    }
  }
  lineText = getLine(state, startLine).trim();
  if (lineText.indexOf("|") === -1) {
    return false;
  }
  rows = lineText.replace(/^\||\|$/g, "").split("|");
  if (aligns.length !== rows.length) {
    return false;
  }
  if (silent) {
    return true;
  }
  state.tokens.push({
    type: "table_open",
    lines: tableLines = [startLine, 0],
    level: state.level++
  });
  state.tokens.push({
    type: "thead_open",
    lines: [startLine, startLine + 1],
    level: state.level++
  });
  state.tokens.push({
    type: "tr_open",
    lines: [startLine, startLine + 1],
    level: state.level++
  });
  for (i2 = 0; i2 < rows.length; i2++) {
    state.tokens.push({
      type: "th_open",
      align: aligns[i2],
      lines: [startLine, startLine + 1],
      level: state.level++
    });
    state.tokens.push({
      type: "inline",
      content: rows[i2].trim(),
      lines: [startLine, startLine + 1],
      level: state.level,
      children: []
    });
    state.tokens.push({ type: "th_close", level: --state.level });
  }
  state.tokens.push({ type: "tr_close", level: --state.level });
  state.tokens.push({ type: "thead_close", level: --state.level });
  state.tokens.push({
    type: "tbody_open",
    lines: tbodyLines = [startLine + 2, 0],
    level: state.level++
  });
  for (nextLine = startLine + 2; nextLine < endLine; nextLine++) {
    if (state.tShift[nextLine] < state.blkIndent) {
      break;
    }
    lineText = getLine(state, nextLine).trim();
    if (lineText.indexOf("|") === -1) {
      break;
    }
    rows = lineText.replace(/^\||\|$/g, "").split("|");
    state.tokens.push({ type: "tr_open", level: state.level++ });
    for (i2 = 0; i2 < rows.length; i2++) {
      state.tokens.push({ type: "td_open", align: aligns[i2], level: state.level++ });
      cell = rows[i2].substring(
        rows[i2].charCodeAt(0) === 124 ? 1 : 0,
        rows[i2].charCodeAt(rows[i2].length - 1) === 124 ? rows[i2].length - 1 : rows[i2].length
      ).trim();
      state.tokens.push({
        type: "inline",
        content: cell,
        level: state.level,
        children: []
      });
      state.tokens.push({ type: "td_close", level: --state.level });
    }
    state.tokens.push({ type: "tr_close", level: --state.level });
  }
  state.tokens.push({ type: "tbody_close", level: --state.level });
  state.tokens.push({ type: "table_close", level: --state.level });
  tableLines[1] = tbodyLines[1] = nextLine;
  state.line = nextLine;
  return true;
}
function skipMarker(state, line) {
  var pos, marker, start = state.bMarks[line] + state.tShift[line], max = state.eMarks[line];
  if (start >= max) {
    return -1;
  }
  marker = state.src.charCodeAt(start++);
  if (marker !== 126 && marker !== 58) {
    return -1;
  }
  pos = state.skipSpaces(start);
  if (start === pos) {
    return -1;
  }
  if (pos >= max) {
    return -1;
  }
  return pos;
}
function markTightParagraphs$1(state, idx) {
  var i2, l, level = state.level + 2;
  for (i2 = idx + 2, l = state.tokens.length - 2; i2 < l; i2++) {
    if (state.tokens[i2].level === level && state.tokens[i2].type === "paragraph_open") {
      state.tokens[i2 + 2].tight = true;
      state.tokens[i2].tight = true;
      i2 += 2;
    }
  }
}
function deflist(state, startLine, endLine, silent) {
  var contentStart, ddLine, dtLine, itemLines, listLines, listTokIdx, nextLine, oldIndent, oldDDIndent, oldParentType, oldTShift, oldTight, prevEmptyEnd, tight;
  if (silent) {
    if (state.ddIndent < 0) {
      return false;
    }
    return skipMarker(state, startLine) >= 0;
  }
  nextLine = startLine + 1;
  if (state.isEmpty(nextLine)) {
    if (++nextLine > endLine) {
      return false;
    }
  }
  if (state.tShift[nextLine] < state.blkIndent) {
    return false;
  }
  contentStart = skipMarker(state, nextLine);
  if (contentStart < 0) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  listTokIdx = state.tokens.length;
  state.tokens.push({
    type: "dl_open",
    lines: listLines = [startLine, 0],
    level: state.level++
  });
  dtLine = startLine;
  ddLine = nextLine;
  OUTER:
    for (; ; ) {
      tight = true;
      prevEmptyEnd = false;
      state.tokens.push({
        type: "dt_open",
        lines: [dtLine, dtLine],
        level: state.level++
      });
      state.tokens.push({
        type: "inline",
        content: state.getLines(dtLine, dtLine + 1, state.blkIndent, false).trim(),
        level: state.level + 1,
        lines: [dtLine, dtLine],
        children: []
      });
      state.tokens.push({
        type: "dt_close",
        level: --state.level
      });
      for (; ; ) {
        state.tokens.push({
          type: "dd_open",
          lines: itemLines = [nextLine, 0],
          level: state.level++
        });
        oldTight = state.tight;
        oldDDIndent = state.ddIndent;
        oldIndent = state.blkIndent;
        oldTShift = state.tShift[ddLine];
        oldParentType = state.parentType;
        state.blkIndent = state.ddIndent = state.tShift[ddLine] + 2;
        state.tShift[ddLine] = contentStart - state.bMarks[ddLine];
        state.tight = true;
        state.parentType = "deflist";
        state.parser.tokenize(state, ddLine, endLine, true);
        if (!state.tight || prevEmptyEnd) {
          tight = false;
        }
        prevEmptyEnd = state.line - ddLine > 1 && state.isEmpty(state.line - 1);
        state.tShift[ddLine] = oldTShift;
        state.tight = oldTight;
        state.parentType = oldParentType;
        state.blkIndent = oldIndent;
        state.ddIndent = oldDDIndent;
        state.tokens.push({
          type: "dd_close",
          level: --state.level
        });
        itemLines[1] = nextLine = state.line;
        if (nextLine >= endLine) {
          break OUTER;
        }
        if (state.tShift[nextLine] < state.blkIndent) {
          break OUTER;
        }
        contentStart = skipMarker(state, nextLine);
        if (contentStart < 0) {
          break;
        }
        ddLine = nextLine;
      }
      if (nextLine >= endLine) {
        break;
      }
      dtLine = nextLine;
      if (state.isEmpty(dtLine)) {
        break;
      }
      if (state.tShift[dtLine] < state.blkIndent) {
        break;
      }
      ddLine = dtLine + 1;
      if (ddLine >= endLine) {
        break;
      }
      if (state.isEmpty(ddLine)) {
        ddLine++;
      }
      if (ddLine >= endLine) {
        break;
      }
      if (state.tShift[ddLine] < state.blkIndent) {
        break;
      }
      contentStart = skipMarker(state, ddLine);
      if (contentStart < 0) {
        break;
      }
    }
  state.tokens.push({
    type: "dl_close",
    level: --state.level
  });
  listLines[1] = nextLine;
  state.line = nextLine;
  if (tight) {
    markTightParagraphs$1(state, listTokIdx);
  }
  return true;
}
function paragraph(state, startLine) {
  var endLine, content, terminate, i2, l, nextLine = startLine + 1, terminatorRules;
  endLine = state.lineMax;
  if (nextLine < endLine && !state.isEmpty(nextLine)) {
    terminatorRules = state.parser.ruler.getRules("paragraph");
    for (; nextLine < endLine && !state.isEmpty(nextLine); nextLine++) {
      if (state.tShift[nextLine] - state.blkIndent > 3) {
        continue;
      }
      terminate = false;
      for (i2 = 0, l = terminatorRules.length; i2 < l; i2++) {
        if (terminatorRules[i2](state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }
      if (terminate) {
        break;
      }
    }
  }
  content = state.getLines(startLine, nextLine, state.blkIndent, false).trim();
  state.line = nextLine;
  if (content.length) {
    state.tokens.push({
      type: "paragraph_open",
      tight: false,
      lines: [startLine, state.line],
      level: state.level
    });
    state.tokens.push({
      type: "inline",
      content,
      level: state.level + 1,
      lines: [startLine, state.line],
      children: []
    });
    state.tokens.push({
      type: "paragraph_close",
      tight: false,
      level: state.level
    });
  }
  return true;
}
var _rules$1 = [
  ["code", code],
  ["fences", fences, ["paragraph", "blockquote", "list"]],
  ["blockquote", blockquote, ["paragraph", "blockquote", "list"]],
  ["hr", hr, ["paragraph", "blockquote", "list"]],
  ["list", list, ["paragraph", "blockquote"]],
  ["footnote", footnote, ["paragraph"]],
  ["heading", heading, ["paragraph", "blockquote"]],
  ["lheading", lheading],
  ["htmlblock", htmlblock, ["paragraph", "blockquote"]],
  ["table", table, ["paragraph"]],
  ["deflist", deflist, ["paragraph"]],
  ["paragraph", paragraph]
];
function ParserBlock() {
  this.ruler = new Ruler();
  for (var i2 = 0; i2 < _rules$1.length; i2++) {
    this.ruler.push(_rules$1[i2][0], _rules$1[i2][1], {
      alt: (_rules$1[i2][2] || []).slice()
    });
  }
}
ParserBlock.prototype.tokenize = function(state, startLine, endLine) {
  var rules2 = this.ruler.getRules("");
  var len = rules2.length;
  var line = startLine;
  var hasEmptyLines = false;
  var ok, i2;
  while (line < endLine) {
    state.line = line = state.skipEmptyLines(line);
    if (line >= endLine) {
      break;
    }
    if (state.tShift[line] < state.blkIndent) {
      break;
    }
    for (i2 = 0; i2 < len; i2++) {
      ok = rules2[i2](state, line, endLine, false);
      if (ok) {
        break;
      }
    }
    state.tight = !hasEmptyLines;
    if (state.isEmpty(state.line - 1)) {
      hasEmptyLines = true;
    }
    line = state.line;
    if (line < endLine && state.isEmpty(line)) {
      hasEmptyLines = true;
      line++;
      if (line < endLine && state.parentType === "list" && state.isEmpty(line)) {
        break;
      }
      state.line = line;
    }
  }
};
var TABS_SCAN_RE = /[\n\t]/g;
var NEWLINES_RE = /\r[\n\u0085]|[\u2424\u2028\u0085]/g;
var SPACES_RE = /\u00a0/g;
ParserBlock.prototype.parse = function(str, options, env, outTokens) {
  var state, lineStart = 0, lastTabPos = 0;
  if (!str) {
    return [];
  }
  str = str.replace(SPACES_RE, " ");
  str = str.replace(NEWLINES_RE, "\n");
  if (str.indexOf("	") >= 0) {
    str = str.replace(TABS_SCAN_RE, function(match, offset) {
      var result;
      if (str.charCodeAt(offset) === 10) {
        lineStart = offset + 1;
        lastTabPos = 0;
        return match;
      }
      result = "    ".slice((offset - lineStart - lastTabPos) % 4);
      lastTabPos = offset - lineStart + 1;
      return result;
    });
  }
  state = new StateBlock(str, this, options, env, outTokens);
  this.tokenize(state, state.line, state.lineMax);
};
function isTerminatorChar(ch) {
  switch (ch) {
    case 10:
    case 92:
    case 96:
    case 42:
    case 95:
    case 94:
    case 91:
    case 93:
    case 33:
    case 38:
    case 60:
    case 62:
    case 123:
    case 125:
    case 36:
    case 37:
    case 64:
    case 126:
    case 43:
    case 61:
    case 58:
      return true;
    default:
      return false;
  }
}
function text2(state, silent) {
  var pos = state.pos;
  while (pos < state.posMax && !isTerminatorChar(state.src.charCodeAt(pos))) {
    pos++;
  }
  if (pos === state.pos) {
    return false;
  }
  if (!silent) {
    state.pending += state.src.slice(state.pos, pos);
  }
  state.pos = pos;
  return true;
}
function newline(state, silent) {
  var pmax, max, pos = state.pos;
  if (state.src.charCodeAt(pos) !== 10) {
    return false;
  }
  pmax = state.pending.length - 1;
  max = state.posMax;
  if (!silent) {
    if (pmax >= 0 && state.pending.charCodeAt(pmax) === 32) {
      if (pmax >= 1 && state.pending.charCodeAt(pmax - 1) === 32) {
        for (var i2 = pmax - 2; i2 >= 0; i2--) {
          if (state.pending.charCodeAt(i2) !== 32) {
            state.pending = state.pending.substring(0, i2 + 1);
            break;
          }
        }
        state.push({
          type: "hardbreak",
          level: state.level
        });
      } else {
        state.pending = state.pending.slice(0, -1);
        state.push({
          type: "softbreak",
          level: state.level
        });
      }
    } else {
      state.push({
        type: "softbreak",
        level: state.level
      });
    }
  }
  pos++;
  while (pos < max && state.src.charCodeAt(pos) === 32) {
    pos++;
  }
  state.pos = pos;
  return true;
}
var ESCAPED = [];
for (i = 0; i < 256; i++) {
  ESCAPED.push(0);
}
var i;
"\\!\"#$%&'()*+,./:;<=>?@[]^_`{|}~-".split("").forEach(function(ch) {
  ESCAPED[ch.charCodeAt(0)] = 1;
});
function escape(state, silent) {
  var ch, pos = state.pos, max = state.posMax;
  if (state.src.charCodeAt(pos) !== 92) {
    return false;
  }
  pos++;
  if (pos < max) {
    ch = state.src.charCodeAt(pos);
    if (ch < 256 && ESCAPED[ch] !== 0) {
      if (!silent) {
        state.pending += state.src[pos];
      }
      state.pos += 2;
      return true;
    }
    if (ch === 10) {
      if (!silent) {
        state.push({
          type: "hardbreak",
          level: state.level
        });
      }
      pos++;
      while (pos < max && state.src.charCodeAt(pos) === 32) {
        pos++;
      }
      state.pos = pos;
      return true;
    }
  }
  if (!silent) {
    state.pending += "\\";
  }
  state.pos++;
  return true;
}
function backticks(state, silent) {
  var start, max, marker, matchStart, matchEnd, pos = state.pos, ch = state.src.charCodeAt(pos);
  if (ch !== 96) {
    return false;
  }
  start = pos;
  pos++;
  max = state.posMax;
  while (pos < max && state.src.charCodeAt(pos) === 96) {
    pos++;
  }
  marker = state.src.slice(start, pos);
  matchStart = matchEnd = pos;
  while ((matchStart = state.src.indexOf("`", matchEnd)) !== -1) {
    matchEnd = matchStart + 1;
    while (matchEnd < max && state.src.charCodeAt(matchEnd) === 96) {
      matchEnd++;
    }
    if (matchEnd - matchStart === marker.length) {
      if (!silent) {
        state.push({
          type: "code",
          content: state.src.slice(pos, matchStart).replace(/[ \n]+/g, " ").trim(),
          block: false,
          level: state.level
        });
      }
      state.pos = matchEnd;
      return true;
    }
  }
  if (!silent) {
    state.pending += marker;
  }
  state.pos += marker.length;
  return true;
}
function del(state, silent) {
  var found, pos, stack, max = state.posMax, start = state.pos, lastChar, nextChar;
  if (state.src.charCodeAt(start) !== 126) {
    return false;
  }
  if (silent) {
    return false;
  }
  if (start + 4 >= max) {
    return false;
  }
  if (state.src.charCodeAt(start + 1) !== 126) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  lastChar = start > 0 ? state.src.charCodeAt(start - 1) : -1;
  nextChar = state.src.charCodeAt(start + 2);
  if (lastChar === 126) {
    return false;
  }
  if (nextChar === 126) {
    return false;
  }
  if (nextChar === 32 || nextChar === 10) {
    return false;
  }
  pos = start + 2;
  while (pos < max && state.src.charCodeAt(pos) === 126) {
    pos++;
  }
  if (pos > start + 3) {
    state.pos += pos - start;
    if (!silent) {
      state.pending += state.src.slice(start, pos);
    }
    return true;
  }
  state.pos = start + 2;
  stack = 1;
  while (state.pos + 1 < max) {
    if (state.src.charCodeAt(state.pos) === 126) {
      if (state.src.charCodeAt(state.pos + 1) === 126) {
        lastChar = state.src.charCodeAt(state.pos - 1);
        nextChar = state.pos + 2 < max ? state.src.charCodeAt(state.pos + 2) : -1;
        if (nextChar !== 126 && lastChar !== 126) {
          if (lastChar !== 32 && lastChar !== 10) {
            stack--;
          } else if (nextChar !== 32 && nextChar !== 10) {
            stack++;
          }
          if (stack <= 0) {
            found = true;
            break;
          }
        }
      }
    }
    state.parser.skipToken(state);
  }
  if (!found) {
    state.pos = start;
    return false;
  }
  state.posMax = state.pos;
  state.pos = start + 2;
  if (!silent) {
    state.push({ type: "del_open", level: state.level++ });
    state.parser.tokenize(state);
    state.push({ type: "del_close", level: --state.level });
  }
  state.pos = state.posMax + 2;
  state.posMax = max;
  return true;
}
function ins(state, silent) {
  var found, pos, stack, max = state.posMax, start = state.pos, lastChar, nextChar;
  if (state.src.charCodeAt(start) !== 43) {
    return false;
  }
  if (silent) {
    return false;
  }
  if (start + 4 >= max) {
    return false;
  }
  if (state.src.charCodeAt(start + 1) !== 43) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  lastChar = start > 0 ? state.src.charCodeAt(start - 1) : -1;
  nextChar = state.src.charCodeAt(start + 2);
  if (lastChar === 43) {
    return false;
  }
  if (nextChar === 43) {
    return false;
  }
  if (nextChar === 32 || nextChar === 10) {
    return false;
  }
  pos = start + 2;
  while (pos < max && state.src.charCodeAt(pos) === 43) {
    pos++;
  }
  if (pos !== start + 2) {
    state.pos += pos - start;
    if (!silent) {
      state.pending += state.src.slice(start, pos);
    }
    return true;
  }
  state.pos = start + 2;
  stack = 1;
  while (state.pos + 1 < max) {
    if (state.src.charCodeAt(state.pos) === 43) {
      if (state.src.charCodeAt(state.pos + 1) === 43) {
        lastChar = state.src.charCodeAt(state.pos - 1);
        nextChar = state.pos + 2 < max ? state.src.charCodeAt(state.pos + 2) : -1;
        if (nextChar !== 43 && lastChar !== 43) {
          if (lastChar !== 32 && lastChar !== 10) {
            stack--;
          } else if (nextChar !== 32 && nextChar !== 10) {
            stack++;
          }
          if (stack <= 0) {
            found = true;
            break;
          }
        }
      }
    }
    state.parser.skipToken(state);
  }
  if (!found) {
    state.pos = start;
    return false;
  }
  state.posMax = state.pos;
  state.pos = start + 2;
  if (!silent) {
    state.push({ type: "ins_open", level: state.level++ });
    state.parser.tokenize(state);
    state.push({ type: "ins_close", level: --state.level });
  }
  state.pos = state.posMax + 2;
  state.posMax = max;
  return true;
}
function mark(state, silent) {
  var found, pos, stack, max = state.posMax, start = state.pos, lastChar, nextChar;
  if (state.src.charCodeAt(start) !== 61) {
    return false;
  }
  if (silent) {
    return false;
  }
  if (start + 4 >= max) {
    return false;
  }
  if (state.src.charCodeAt(start + 1) !== 61) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  lastChar = start > 0 ? state.src.charCodeAt(start - 1) : -1;
  nextChar = state.src.charCodeAt(start + 2);
  if (lastChar === 61) {
    return false;
  }
  if (nextChar === 61) {
    return false;
  }
  if (nextChar === 32 || nextChar === 10) {
    return false;
  }
  pos = start + 2;
  while (pos < max && state.src.charCodeAt(pos) === 61) {
    pos++;
  }
  if (pos !== start + 2) {
    state.pos += pos - start;
    if (!silent) {
      state.pending += state.src.slice(start, pos);
    }
    return true;
  }
  state.pos = start + 2;
  stack = 1;
  while (state.pos + 1 < max) {
    if (state.src.charCodeAt(state.pos) === 61) {
      if (state.src.charCodeAt(state.pos + 1) === 61) {
        lastChar = state.src.charCodeAt(state.pos - 1);
        nextChar = state.pos + 2 < max ? state.src.charCodeAt(state.pos + 2) : -1;
        if (nextChar !== 61 && lastChar !== 61) {
          if (lastChar !== 32 && lastChar !== 10) {
            stack--;
          } else if (nextChar !== 32 && nextChar !== 10) {
            stack++;
          }
          if (stack <= 0) {
            found = true;
            break;
          }
        }
      }
    }
    state.parser.skipToken(state);
  }
  if (!found) {
    state.pos = start;
    return false;
  }
  state.posMax = state.pos;
  state.pos = start + 2;
  if (!silent) {
    state.push({ type: "mark_open", level: state.level++ });
    state.parser.tokenize(state);
    state.push({ type: "mark_close", level: --state.level });
  }
  state.pos = state.posMax + 2;
  state.posMax = max;
  return true;
}
function isAlphaNum(code2) {
  return code2 >= 48 && code2 <= 57 || code2 >= 65 && code2 <= 90 || code2 >= 97 && code2 <= 122;
}
function scanDelims(state, start) {
  var pos = start, lastChar, nextChar, count, can_open = true, can_close = true, max = state.posMax, marker = state.src.charCodeAt(start);
  lastChar = start > 0 ? state.src.charCodeAt(start - 1) : -1;
  while (pos < max && state.src.charCodeAt(pos) === marker) {
    pos++;
  }
  if (pos >= max) {
    can_open = false;
  }
  count = pos - start;
  if (count >= 4) {
    can_open = can_close = false;
  } else {
    nextChar = pos < max ? state.src.charCodeAt(pos) : -1;
    if (nextChar === 32 || nextChar === 10) {
      can_open = false;
    }
    if (lastChar === 32 || lastChar === 10) {
      can_close = false;
    }
    if (marker === 95) {
      if (isAlphaNum(lastChar)) {
        can_open = false;
      }
      if (isAlphaNum(nextChar)) {
        can_close = false;
      }
    }
  }
  return {
    can_open,
    can_close,
    delims: count
  };
}
function emphasis(state, silent) {
  var startCount, count, found, oldCount, newCount, stack, res, max = state.posMax, start = state.pos, marker = state.src.charCodeAt(start);
  if (marker !== 95 && marker !== 42) {
    return false;
  }
  if (silent) {
    return false;
  }
  res = scanDelims(state, start);
  startCount = res.delims;
  if (!res.can_open) {
    state.pos += startCount;
    if (!silent) {
      state.pending += state.src.slice(start, state.pos);
    }
    return true;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  state.pos = start + startCount;
  stack = [startCount];
  while (state.pos < max) {
    if (state.src.charCodeAt(state.pos) === marker) {
      res = scanDelims(state, state.pos);
      count = res.delims;
      if (res.can_close) {
        oldCount = stack.pop();
        newCount = count;
        while (oldCount !== newCount) {
          if (newCount < oldCount) {
            stack.push(oldCount - newCount);
            break;
          }
          newCount -= oldCount;
          if (stack.length === 0) {
            break;
          }
          state.pos += oldCount;
          oldCount = stack.pop();
        }
        if (stack.length === 0) {
          startCount = oldCount;
          found = true;
          break;
        }
        state.pos += count;
        continue;
      }
      if (res.can_open) {
        stack.push(count);
      }
      state.pos += count;
      continue;
    }
    state.parser.skipToken(state);
  }
  if (!found) {
    state.pos = start;
    return false;
  }
  state.posMax = state.pos;
  state.pos = start + startCount;
  if (!silent) {
    if (startCount === 2 || startCount === 3) {
      state.push({ type: "strong_open", level: state.level++ });
    }
    if (startCount === 1 || startCount === 3) {
      state.push({ type: "em_open", level: state.level++ });
    }
    state.parser.tokenize(state);
    if (startCount === 1 || startCount === 3) {
      state.push({ type: "em_close", level: --state.level });
    }
    if (startCount === 2 || startCount === 3) {
      state.push({ type: "strong_close", level: --state.level });
    }
  }
  state.pos = state.posMax + startCount;
  state.posMax = max;
  return true;
}
var UNESCAPE_RE = /\\([ \\!"#$%&'()*+,.\/:;<=>?@[\]^_`{|}~-])/g;
function sub(state, silent) {
  var found, content, max = state.posMax, start = state.pos;
  if (state.src.charCodeAt(start) !== 126) {
    return false;
  }
  if (silent) {
    return false;
  }
  if (start + 2 >= max) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  state.pos = start + 1;
  while (state.pos < max) {
    if (state.src.charCodeAt(state.pos) === 126) {
      found = true;
      break;
    }
    state.parser.skipToken(state);
  }
  if (!found || start + 1 === state.pos) {
    state.pos = start;
    return false;
  }
  content = state.src.slice(start + 1, state.pos);
  if (content.match(/(^|[^\\])(\\\\)*\s/)) {
    state.pos = start;
    return false;
  }
  state.posMax = state.pos;
  state.pos = start + 1;
  if (!silent) {
    state.push({
      type: "sub",
      level: state.level,
      content: content.replace(UNESCAPE_RE, "$1")
    });
  }
  state.pos = state.posMax + 1;
  state.posMax = max;
  return true;
}
var UNESCAPE_RE$1 = /\\([ \\!"#$%&'()*+,.\/:;<=>?@[\]^_`{|}~-])/g;
function sup(state, silent) {
  var found, content, max = state.posMax, start = state.pos;
  if (state.src.charCodeAt(start) !== 94) {
    return false;
  }
  if (silent) {
    return false;
  }
  if (start + 2 >= max) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  state.pos = start + 1;
  while (state.pos < max) {
    if (state.src.charCodeAt(state.pos) === 94) {
      found = true;
      break;
    }
    state.parser.skipToken(state);
  }
  if (!found || start + 1 === state.pos) {
    state.pos = start;
    return false;
  }
  content = state.src.slice(start + 1, state.pos);
  if (content.match(/(^|[^\\])(\\\\)*\s/)) {
    state.pos = start;
    return false;
  }
  state.posMax = state.pos;
  state.pos = start + 1;
  if (!silent) {
    state.push({
      type: "sup",
      level: state.level,
      content: content.replace(UNESCAPE_RE$1, "$1")
    });
  }
  state.pos = state.posMax + 1;
  state.posMax = max;
  return true;
}
function links(state, silent) {
  var labelStart, labelEnd, label, href, title, pos, ref, code2, isImage = false, oldPos = state.pos, max = state.posMax, start = state.pos, marker = state.src.charCodeAt(start);
  if (marker === 33) {
    isImage = true;
    marker = state.src.charCodeAt(++start);
  }
  if (marker !== 91) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  labelStart = start + 1;
  labelEnd = parseLinkLabel(state, start);
  if (labelEnd < 0) {
    return false;
  }
  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 40) {
    pos++;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (code2 !== 32 && code2 !== 10) {
        break;
      }
    }
    if (pos >= max) {
      return false;
    }
    start = pos;
    if (parseLinkDestination(state, pos)) {
      href = state.linkContent;
      pos = state.pos;
    } else {
      href = "";
    }
    start = pos;
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (code2 !== 32 && code2 !== 10) {
        break;
      }
    }
    if (pos < max && start !== pos && parseLinkTitle(state, pos)) {
      title = state.linkContent;
      pos = state.pos;
      for (; pos < max; pos++) {
        code2 = state.src.charCodeAt(pos);
        if (code2 !== 32 && code2 !== 10) {
          break;
        }
      }
    } else {
      title = "";
    }
    if (pos >= max || state.src.charCodeAt(pos) !== 41) {
      state.pos = oldPos;
      return false;
    }
    pos++;
  } else {
    if (state.linkLevel > 0) {
      return false;
    }
    for (; pos < max; pos++) {
      code2 = state.src.charCodeAt(pos);
      if (code2 !== 32 && code2 !== 10) {
        break;
      }
    }
    if (pos < max && state.src.charCodeAt(pos) === 91) {
      start = pos + 1;
      pos = parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = start - 1;
      }
    }
    if (!label) {
      if (typeof label === "undefined") {
        pos = labelEnd + 1;
      }
      label = state.src.slice(labelStart, labelEnd);
    }
    ref = state.env.references[normalizeReference(label)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }
  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;
    if (isImage) {
      state.push({
        type: "image",
        src: href,
        title,
        alt: state.src.substr(labelStart, labelEnd - labelStart),
        level: state.level
      });
    } else {
      state.push({
        type: "link_open",
        href,
        title,
        level: state.level++
      });
      state.linkLevel++;
      state.parser.tokenize(state);
      state.linkLevel--;
      state.push({ type: "link_close", level: --state.level });
    }
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}
function footnote_inline(state, silent) {
  var labelStart, labelEnd, footnoteId, oldLength, max = state.posMax, start = state.pos;
  if (start + 2 >= max) {
    return false;
  }
  if (state.src.charCodeAt(start) !== 94) {
    return false;
  }
  if (state.src.charCodeAt(start + 1) !== 91) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  labelStart = start + 2;
  labelEnd = parseLinkLabel(state, start + 1);
  if (labelEnd < 0) {
    return false;
  }
  if (!silent) {
    if (!state.env.footnotes) {
      state.env.footnotes = {};
    }
    if (!state.env.footnotes.list) {
      state.env.footnotes.list = [];
    }
    footnoteId = state.env.footnotes.list.length;
    state.pos = labelStart;
    state.posMax = labelEnd;
    state.push({
      type: "footnote_ref",
      id: footnoteId,
      level: state.level
    });
    state.linkLevel++;
    oldLength = state.tokens.length;
    state.parser.tokenize(state);
    state.env.footnotes.list[footnoteId] = { tokens: state.tokens.splice(oldLength) };
    state.linkLevel--;
  }
  state.pos = labelEnd + 1;
  state.posMax = max;
  return true;
}
function footnote_ref(state, silent) {
  var label, pos, footnoteId, footnoteSubId, max = state.posMax, start = state.pos;
  if (start + 3 > max) {
    return false;
  }
  if (!state.env.footnotes || !state.env.footnotes.refs) {
    return false;
  }
  if (state.src.charCodeAt(start) !== 91) {
    return false;
  }
  if (state.src.charCodeAt(start + 1) !== 94) {
    return false;
  }
  if (state.level >= state.options.maxNesting) {
    return false;
  }
  for (pos = start + 2; pos < max; pos++) {
    if (state.src.charCodeAt(pos) === 32) {
      return false;
    }
    if (state.src.charCodeAt(pos) === 10) {
      return false;
    }
    if (state.src.charCodeAt(pos) === 93) {
      break;
    }
  }
  if (pos === start + 2) {
    return false;
  }
  if (pos >= max) {
    return false;
  }
  pos++;
  label = state.src.slice(start + 2, pos - 1);
  if (typeof state.env.footnotes.refs[":" + label] === "undefined") {
    return false;
  }
  if (!silent) {
    if (!state.env.footnotes.list) {
      state.env.footnotes.list = [];
    }
    if (state.env.footnotes.refs[":" + label] < 0) {
      footnoteId = state.env.footnotes.list.length;
      state.env.footnotes.list[footnoteId] = { label, count: 0 };
      state.env.footnotes.refs[":" + label] = footnoteId;
    } else {
      footnoteId = state.env.footnotes.refs[":" + label];
    }
    footnoteSubId = state.env.footnotes.list[footnoteId].count;
    state.env.footnotes.list[footnoteId].count++;
    state.push({
      type: "footnote_ref",
      id: footnoteId,
      subId: footnoteSubId,
      level: state.level
    });
  }
  state.pos = pos;
  state.posMax = max;
  return true;
}
var url_schemas = [
  "coap",
  "doi",
  "javascript",
  "aaa",
  "aaas",
  "about",
  "acap",
  "cap",
  "cid",
  "crid",
  "data",
  "dav",
  "dict",
  "dns",
  "file",
  "ftp",
  "geo",
  "go",
  "gopher",
  "h323",
  "http",
  "https",
  "iax",
  "icap",
  "im",
  "imap",
  "info",
  "ipp",
  "iris",
  "iris.beep",
  "iris.xpc",
  "iris.xpcs",
  "iris.lwz",
  "ldap",
  "mailto",
  "mid",
  "msrp",
  "msrps",
  "mtqp",
  "mupdate",
  "news",
  "nfs",
  "ni",
  "nih",
  "nntp",
  "opaquelocktoken",
  "pop",
  "pres",
  "rtsp",
  "service",
  "session",
  "shttp",
  "sieve",
  "sip",
  "sips",
  "sms",
  "snmp",
  "soap.beep",
  "soap.beeps",
  "tag",
  "tel",
  "telnet",
  "tftp",
  "thismessage",
  "tn3270",
  "tip",
  "tv",
  "urn",
  "vemmi",
  "ws",
  "wss",
  "xcon",
  "xcon-userid",
  "xmlrpc.beep",
  "xmlrpc.beeps",
  "xmpp",
  "z39.50r",
  "z39.50s",
  "adiumxtra",
  "afp",
  "afs",
  "aim",
  "apt",
  "attachment",
  "aw",
  "beshare",
  "bitcoin",
  "bolo",
  "callto",
  "chrome",
  "chrome-extension",
  "com-eventbrite-attendee",
  "content",
  "cvs",
  "dlna-playsingle",
  "dlna-playcontainer",
  "dtn",
  "dvb",
  "ed2k",
  "facetime",
  "feed",
  "finger",
  "fish",
  "gg",
  "git",
  "gizmoproject",
  "gtalk",
  "hcp",
  "icon",
  "ipn",
  "irc",
  "irc6",
  "ircs",
  "itms",
  "jar",
  "jms",
  "keyparc",
  "lastfm",
  "ldaps",
  "magnet",
  "maps",
  "market",
  "message",
  "mms",
  "ms-help",
  "msnim",
  "mumble",
  "mvn",
  "notes",
  "oid",
  "palm",
  "paparazzi",
  "platform",
  "proxy",
  "psyc",
  "query",
  "res",
  "resource",
  "rmi",
  "rsync",
  "rtmp",
  "secondlife",
  "sftp",
  "sgn",
  "skype",
  "smb",
  "soldat",
  "spotify",
  "ssh",
  "steam",
  "svn",
  "teamspeak",
  "things",
  "udp",
  "unreal",
  "ut2004",
  "ventrilo",
  "view-source",
  "webcal",
  "wtai",
  "wyciwyg",
  "xfire",
  "xri",
  "ymsgr"
];
var EMAIL_RE = /^<([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
var AUTOLINK_RE = /^<([a-zA-Z.\-]{1,25}):([^<>\x00-\x20]*)>/;
function autolink(state, silent) {
  var tail, linkMatch, emailMatch, url, fullUrl, pos = state.pos;
  if (state.src.charCodeAt(pos) !== 60) {
    return false;
  }
  tail = state.src.slice(pos);
  if (tail.indexOf(">") < 0) {
    return false;
  }
  linkMatch = tail.match(AUTOLINK_RE);
  if (linkMatch) {
    if (url_schemas.indexOf(linkMatch[1].toLowerCase()) < 0) {
      return false;
    }
    url = linkMatch[0].slice(1, -1);
    fullUrl = normalizeLink(url);
    if (!state.parser.validateLink(url)) {
      return false;
    }
    if (!silent) {
      state.push({
        type: "link_open",
        href: fullUrl,
        level: state.level
      });
      state.push({
        type: "text",
        content: url,
        level: state.level + 1
      });
      state.push({ type: "link_close", level: state.level });
    }
    state.pos += linkMatch[0].length;
    return true;
  }
  emailMatch = tail.match(EMAIL_RE);
  if (emailMatch) {
    url = emailMatch[0].slice(1, -1);
    fullUrl = normalizeLink("mailto:" + url);
    if (!state.parser.validateLink(fullUrl)) {
      return false;
    }
    if (!silent) {
      state.push({
        type: "link_open",
        href: fullUrl,
        level: state.level
      });
      state.push({
        type: "text",
        content: url,
        level: state.level + 1
      });
      state.push({ type: "link_close", level: state.level });
    }
    state.pos += emailMatch[0].length;
    return true;
  }
  return false;
}
function replace$1(regex, options) {
  regex = regex.source;
  options = options || "";
  return function self(name, val) {
    if (!name) {
      return new RegExp(regex, options);
    }
    val = val.source || val;
    regex = regex.replace(name, val);
    return self;
  };
}
var attr_name = /[a-zA-Z_:][a-zA-Z0-9:._-]*/;
var unquoted = /[^"'=<>`\x00-\x20]+/;
var single_quoted = /'[^']*'/;
var double_quoted = /"[^"]*"/;
var attr_value = replace$1(/(?:unquoted|single_quoted|double_quoted)/)("unquoted", unquoted)("single_quoted", single_quoted)("double_quoted", double_quoted)();
var attribute = replace$1(/(?:\s+attr_name(?:\s*=\s*attr_value)?)/)("attr_name", attr_name)("attr_value", attr_value)();
var open_tag = replace$1(/<[A-Za-z][A-Za-z0-9]*attribute*\s*\/?>/)("attribute", attribute)();
var close_tag = /<\/[A-Za-z][A-Za-z0-9]*\s*>/;
var comment = /<!---->|<!--(?:-?[^>-])(?:-?[^-])*-->/;
var processing = /<[?].*?[?]>/;
var declaration = /<![A-Z]+\s+[^>]*>/;
var cdata = /<!\[CDATA\[[\s\S]*?\]\]>/;
var HTML_TAG_RE = replace$1(/^(?:open_tag|close_tag|comment|processing|declaration|cdata)/)("open_tag", open_tag)("close_tag", close_tag)("comment", comment)("processing", processing)("declaration", declaration)("cdata", cdata)();
function isLetter$2(ch) {
  var lc = ch | 32;
  return lc >= 97 && lc <= 122;
}
function htmltag(state, silent) {
  var ch, match, max, pos = state.pos;
  if (!state.options.html) {
    return false;
  }
  max = state.posMax;
  if (state.src.charCodeAt(pos) !== 60 || pos + 2 >= max) {
    return false;
  }
  ch = state.src.charCodeAt(pos + 1);
  if (ch !== 33 && ch !== 63 && ch !== 47 && !isLetter$2(ch)) {
    return false;
  }
  match = state.src.slice(pos).match(HTML_TAG_RE);
  if (!match) {
    return false;
  }
  if (!silent) {
    state.push({
      type: "htmltag",
      content: state.src.slice(pos, pos + match[0].length),
      level: state.level
    });
  }
  state.pos += match[0].length;
  return true;
}
var DIGITAL_RE = /^&#((?:x[a-f0-9]{1,8}|[0-9]{1,8}));/i;
var NAMED_RE = /^&([a-z][a-z0-9]{1,31});/i;
function entity(state, silent) {
  var ch, code2, match, pos = state.pos, max = state.posMax;
  if (state.src.charCodeAt(pos) !== 38) {
    return false;
  }
  if (pos + 1 < max) {
    ch = state.src.charCodeAt(pos + 1);
    if (ch === 35) {
      match = state.src.slice(pos).match(DIGITAL_RE);
      if (match) {
        if (!silent) {
          code2 = match[1][0].toLowerCase() === "x" ? parseInt(match[1].slice(1), 16) : parseInt(match[1], 10);
          state.pending += isValidEntityCode(code2) ? fromCodePoint(code2) : fromCodePoint(65533);
        }
        state.pos += match[0].length;
        return true;
      }
    } else {
      match = state.src.slice(pos).match(NAMED_RE);
      if (match) {
        var decoded = decodeEntity(match[1]);
        if (match[1] !== decoded) {
          if (!silent) {
            state.pending += decoded;
          }
          state.pos += match[0].length;
          return true;
        }
      }
    }
  }
  if (!silent) {
    state.pending += "&";
  }
  state.pos++;
  return true;
}
var _rules$2 = [
  ["text", text2],
  ["newline", newline],
  ["escape", escape],
  ["backticks", backticks],
  ["del", del],
  ["ins", ins],
  ["mark", mark],
  ["emphasis", emphasis],
  ["sub", sub],
  ["sup", sup],
  ["links", links],
  ["footnote_inline", footnote_inline],
  ["footnote_ref", footnote_ref],
  ["autolink", autolink],
  ["htmltag", htmltag],
  ["entity", entity]
];
function ParserInline() {
  this.ruler = new Ruler();
  for (var i2 = 0; i2 < _rules$2.length; i2++) {
    this.ruler.push(_rules$2[i2][0], _rules$2[i2][1]);
  }
  this.validateLink = validateLink;
}
ParserInline.prototype.skipToken = function(state) {
  var rules2 = this.ruler.getRules("");
  var len = rules2.length;
  var pos = state.pos;
  var i2, cached_pos;
  if ((cached_pos = state.cacheGet(pos)) > 0) {
    state.pos = cached_pos;
    return;
  }
  for (i2 = 0; i2 < len; i2++) {
    if (rules2[i2](state, true)) {
      state.cacheSet(pos, state.pos);
      return;
    }
  }
  state.pos++;
  state.cacheSet(pos, state.pos);
};
ParserInline.prototype.tokenize = function(state) {
  var rules2 = this.ruler.getRules("");
  var len = rules2.length;
  var end = state.posMax;
  var ok, i2;
  while (state.pos < end) {
    for (i2 = 0; i2 < len; i2++) {
      ok = rules2[i2](state, false);
      if (ok) {
        break;
      }
    }
    if (ok) {
      if (state.pos >= end) {
        break;
      }
      continue;
    }
    state.pending += state.src[state.pos++];
  }
  if (state.pending) {
    state.pushPending();
  }
};
ParserInline.prototype.parse = function(str, options, env, outTokens) {
  var state = new StateInline(str, this, options, env, outTokens);
  this.tokenize(state);
};
function validateLink(url) {
  var BAD_PROTOCOLS = ["vbscript", "javascript", "file", "data"];
  var str = url.trim().toLowerCase();
  str = replaceEntities(str);
  if (str.indexOf(":") !== -1 && BAD_PROTOCOLS.indexOf(str.split(":")[0]) !== -1) {
    return false;
  }
  return true;
}
var defaultConfig = {
  options: {
    html: false,
    // Enable HTML tags in source
    xhtmlOut: false,
    // Use '/' to close single tags (<br />)
    breaks: false,
    // Convert '\n' in paragraphs into <br>
    langPrefix: "language-",
    // CSS language prefix for fenced blocks
    linkTarget: "",
    // set target to open link in
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Set doubles to '«»' for Russian, '„“' for German.
    quotes: "\u201C\u201D\u2018\u2019",
    // Highlighter function. Should return escaped HTML,
    // or '' if input not changed
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    maxNesting: 20
    // Internal protection, recursion limit
  },
  components: {
    core: {
      rules: [
        "block",
        "inline",
        "references",
        "replacements",
        "smartquotes",
        "references",
        "abbr2",
        "footnote_tail"
      ]
    },
    block: {
      rules: [
        "blockquote",
        "code",
        "fences",
        "footnote",
        "heading",
        "hr",
        "htmlblock",
        "lheading",
        "list",
        "paragraph",
        "table"
      ]
    },
    inline: {
      rules: [
        "autolink",
        "backticks",
        "del",
        "emphasis",
        "entity",
        "escape",
        "footnote_ref",
        "htmltag",
        "links",
        "newline",
        "text"
      ]
    }
  }
};
var fullConfig = {
  options: {
    html: false,
    // Enable HTML tags in source
    xhtmlOut: false,
    // Use '/' to close single tags (<br />)
    breaks: false,
    // Convert '\n' in paragraphs into <br>
    langPrefix: "language-",
    // CSS language prefix for fenced blocks
    linkTarget: "",
    // set target to open link in
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Set doubles to '«»' for Russian, '„“' for German.
    quotes: "\u201C\u201D\u2018\u2019",
    // Highlighter function. Should return escaped HTML,
    // or '' if input not changed
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    maxNesting: 20
    // Internal protection, recursion limit
  },
  components: {
    // Don't restrict core/block/inline rules
    core: {},
    block: {},
    inline: {}
  }
};
var commonmarkConfig = {
  options: {
    html: true,
    // Enable HTML tags in source
    xhtmlOut: true,
    // Use '/' to close single tags (<br />)
    breaks: false,
    // Convert '\n' in paragraphs into <br>
    langPrefix: "language-",
    // CSS language prefix for fenced blocks
    linkTarget: "",
    // set target to open link in
    // Enable some language-neutral replacements + quotes beautification
    typographer: false,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Set doubles to '«»' for Russian, '„“' for German.
    quotes: "\u201C\u201D\u2018\u2019",
    // Highlighter function. Should return escaped HTML,
    // or '' if input not changed
    //
    // function (/*str, lang*/) { return ''; }
    //
    highlight: null,
    maxNesting: 20
    // Internal protection, recursion limit
  },
  components: {
    core: {
      rules: [
        "block",
        "inline",
        "references",
        "abbr2"
      ]
    },
    block: {
      rules: [
        "blockquote",
        "code",
        "fences",
        "heading",
        "hr",
        "htmlblock",
        "lheading",
        "list",
        "paragraph"
      ]
    },
    inline: {
      rules: [
        "autolink",
        "backticks",
        "emphasis",
        "entity",
        "escape",
        "htmltag",
        "links",
        "newline",
        "text"
      ]
    }
  }
};
var config = {
  "default": defaultConfig,
  "full": fullConfig,
  "commonmark": commonmarkConfig
};
function StateCore(instance, str, env) {
  this.src = str;
  this.env = env;
  this.options = instance.options;
  this.tokens = [];
  this.inlineMode = false;
  this.inline = instance.inline;
  this.block = instance.block;
  this.renderer = instance.renderer;
  this.typographer = instance.typographer;
}
function Remarkable(preset, options) {
  if (typeof preset !== "string") {
    options = preset;
    preset = "default";
  }
  if (options && options.linkify != null) {
    console.warn(
      "linkify option is removed. Use linkify plugin instead:\n\nimport Remarkable from 'remarkable';\nimport linkify from 'remarkable/linkify';\nnew Remarkable().use(linkify)\n"
    );
  }
  this.inline = new ParserInline();
  this.block = new ParserBlock();
  this.core = new Core();
  this.renderer = new Renderer();
  this.ruler = new Ruler();
  this.options = {};
  this.configure(config[preset]);
  this.set(options || {});
}
Remarkable.prototype.set = function(options) {
  assign(this.options, options);
};
Remarkable.prototype.configure = function(presets) {
  var self = this;
  if (!presets) {
    throw new Error("Wrong `remarkable` preset, check name/content");
  }
  if (presets.options) {
    self.set(presets.options);
  }
  if (presets.components) {
    Object.keys(presets.components).forEach(function(name) {
      if (presets.components[name].rules) {
        self[name].ruler.enable(presets.components[name].rules, true);
      }
    });
  }
};
Remarkable.prototype.use = function(plugin, options) {
  plugin(this, options);
  return this;
};
Remarkable.prototype.parse = function(str, env) {
  var state = new StateCore(this, str, env);
  this.core.process(state);
  return state.tokens;
};
Remarkable.prototype.render = function(str, env) {
  env = env || {};
  return this.renderer.render(this.parse(str, env), this.options, env);
};
Remarkable.prototype.parseInline = function(str, env) {
  var state = new StateCore(this, str, env);
  state.inlineMode = true;
  this.core.process(state);
  return state.tokens;
};
Remarkable.prototype.renderInline = function(str, env) {
  env = env || {};
  return this.renderer.render(this.parseInline(str, env), this.options, env);
};

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/version.js
var version = "3.16.2";

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/utils.js
function defaults(dest, src) {
  for (var prop in src) {
    if (src.hasOwnProperty(prop) && dest[prop] === void 0) {
      dest[prop] = src[prop];
    }
  }
  return dest;
}
function ellipsis(str, truncateLen, ellipsisChars) {
  var ellipsisLength;
  if (str.length > truncateLen) {
    if (ellipsisChars == null) {
      ellipsisChars = "&hellip;";
      ellipsisLength = 3;
    } else {
      ellipsisLength = ellipsisChars.length;
    }
    str = str.substring(0, truncateLen - ellipsisLength) + ellipsisChars;
  }
  return str;
}
function indexOf(arr, element) {
  if (Array.prototype.indexOf) {
    return arr.indexOf(element);
  } else {
    for (var i2 = 0, len = arr.length; i2 < len; i2++) {
      if (arr[i2] === element)
        return i2;
    }
    return -1;
  }
}
function remove(arr, fn) {
  for (var i2 = arr.length - 1; i2 >= 0; i2--) {
    if (fn(arr[i2]) === true) {
      arr.splice(i2, 1);
    }
  }
}
function splitAndCapture(str, splitRegex) {
  if (!splitRegex.global)
    throw new Error("`splitRegex` must have the 'g' flag set");
  var result = [], lastIdx = 0, match;
  while (match = splitRegex.exec(str)) {
    result.push(str.substring(lastIdx, match.index));
    result.push(match[0]);
    lastIdx = match.index + match[0].length;
  }
  result.push(str.substring(lastIdx));
  return result;
}
function throwUnhandledCaseError(theValue) {
  throw new Error("Unhandled case for value: '".concat(theValue, "'"));
}

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/html-tag.js
var HtmlTag = (
  /** @class */
  (function() {
    function HtmlTag2(cfg) {
      if (cfg === void 0) {
        cfg = {};
      }
      this.tagName = "";
      this.attrs = {};
      this.innerHTML = "";
      this.whitespaceRegex = /\s+/;
      this.tagName = cfg.tagName || "";
      this.attrs = cfg.attrs || {};
      this.innerHTML = cfg.innerHtml || cfg.innerHTML || "";
    }
    HtmlTag2.prototype.setTagName = function(tagName) {
      this.tagName = tagName;
      return this;
    };
    HtmlTag2.prototype.getTagName = function() {
      return this.tagName || "";
    };
    HtmlTag2.prototype.setAttr = function(attrName, attrValue) {
      var tagAttrs = this.getAttrs();
      tagAttrs[attrName] = attrValue;
      return this;
    };
    HtmlTag2.prototype.getAttr = function(attrName) {
      return this.getAttrs()[attrName];
    };
    HtmlTag2.prototype.setAttrs = function(attrs) {
      Object.assign(this.getAttrs(), attrs);
      return this;
    };
    HtmlTag2.prototype.getAttrs = function() {
      return this.attrs || (this.attrs = {});
    };
    HtmlTag2.prototype.setClass = function(cssClass) {
      return this.setAttr("class", cssClass);
    };
    HtmlTag2.prototype.addClass = function(cssClass) {
      var classAttr = this.getClass(), whitespaceRegex = this.whitespaceRegex, classes = !classAttr ? [] : classAttr.split(whitespaceRegex), newClasses = cssClass.split(whitespaceRegex), newClass;
      while (newClass = newClasses.shift()) {
        if (indexOf(classes, newClass) === -1) {
          classes.push(newClass);
        }
      }
      this.getAttrs()["class"] = classes.join(" ");
      return this;
    };
    HtmlTag2.prototype.removeClass = function(cssClass) {
      var classAttr = this.getClass(), whitespaceRegex = this.whitespaceRegex, classes = !classAttr ? [] : classAttr.split(whitespaceRegex), removeClasses = cssClass.split(whitespaceRegex), removeClass;
      while (classes.length && (removeClass = removeClasses.shift())) {
        var idx = indexOf(classes, removeClass);
        if (idx !== -1) {
          classes.splice(idx, 1);
        }
      }
      this.getAttrs()["class"] = classes.join(" ");
      return this;
    };
    HtmlTag2.prototype.getClass = function() {
      return this.getAttrs()["class"] || "";
    };
    HtmlTag2.prototype.hasClass = function(cssClass) {
      return (" " + this.getClass() + " ").indexOf(" " + cssClass + " ") !== -1;
    };
    HtmlTag2.prototype.setInnerHTML = function(html) {
      this.innerHTML = html;
      return this;
    };
    HtmlTag2.prototype.setInnerHtml = function(html) {
      return this.setInnerHTML(html);
    };
    HtmlTag2.prototype.getInnerHTML = function() {
      return this.innerHTML || "";
    };
    HtmlTag2.prototype.getInnerHtml = function() {
      return this.getInnerHTML();
    };
    HtmlTag2.prototype.toAnchorString = function() {
      var tagName = this.getTagName(), attrsStr = this.buildAttrsStr();
      attrsStr = attrsStr ? " " + attrsStr : "";
      return ["<", tagName, attrsStr, ">", this.getInnerHtml(), "</", tagName, ">"].join("");
    };
    HtmlTag2.prototype.buildAttrsStr = function() {
      if (!this.attrs)
        return "";
      var attrs = this.getAttrs(), attrsArr = [];
      for (var prop in attrs) {
        if (attrs.hasOwnProperty(prop)) {
          attrsArr.push(prop + '="' + attrs[prop] + '"');
        }
      }
      return attrsArr.join(" ");
    };
    return HtmlTag2;
  })()
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/truncate/truncate-smart.js
function truncateSmart(url, truncateLen, ellipsisChars) {
  var ellipsisLengthBeforeParsing;
  var ellipsisLength;
  if (ellipsisChars == null) {
    ellipsisChars = "&hellip;";
    ellipsisLength = 3;
    ellipsisLengthBeforeParsing = 8;
  } else {
    ellipsisLength = ellipsisChars.length;
    ellipsisLengthBeforeParsing = ellipsisChars.length;
  }
  var parse_url = function(url2) {
    var urlObj2 = {};
    var urlSub = url2;
    var match = urlSub.match(/^([a-z]+):\/\//i);
    if (match) {
      urlObj2.scheme = match[1];
      urlSub = urlSub.substr(match[0].length);
    }
    match = urlSub.match(/^(.*?)(?=(\?|#|\/|$))/i);
    if (match) {
      urlObj2.host = match[1];
      urlSub = urlSub.substr(match[0].length);
    }
    match = urlSub.match(/^\/(.*?)(?=(\?|#|$))/i);
    if (match) {
      urlObj2.path = match[1];
      urlSub = urlSub.substr(match[0].length);
    }
    match = urlSub.match(/^\?(.*?)(?=(#|$))/i);
    if (match) {
      urlObj2.query = match[1];
      urlSub = urlSub.substr(match[0].length);
    }
    match = urlSub.match(/^#(.*?)$/i);
    if (match) {
      urlObj2.fragment = match[1];
    }
    return urlObj2;
  };
  var buildUrl = function(urlObj2) {
    var url2 = "";
    if (urlObj2.scheme && urlObj2.host) {
      url2 += urlObj2.scheme + "://";
    }
    if (urlObj2.host) {
      url2 += urlObj2.host;
    }
    if (urlObj2.path) {
      url2 += "/" + urlObj2.path;
    }
    if (urlObj2.query) {
      url2 += "?" + urlObj2.query;
    }
    if (urlObj2.fragment) {
      url2 += "#" + urlObj2.fragment;
    }
    return url2;
  };
  var buildSegment = function(segment, remainingAvailableLength3) {
    var remainingAvailableLengthHalf = remainingAvailableLength3 / 2, startOffset = Math.ceil(remainingAvailableLengthHalf), endOffset = -1 * Math.floor(remainingAvailableLengthHalf), end2 = "";
    if (endOffset < 0) {
      end2 = segment.substr(endOffset);
    }
    return segment.substr(0, startOffset) + ellipsisChars + end2;
  };
  if (url.length <= truncateLen) {
    return url;
  }
  var availableLength = truncateLen - ellipsisLength;
  var urlObj = parse_url(url);
  if (urlObj.query) {
    var matchQuery = urlObj.query.match(/^(.*?)(?=(\?|\#))(.*?)$/i);
    if (matchQuery) {
      urlObj.query = urlObj.query.substr(0, matchQuery[1].length);
      url = buildUrl(urlObj);
    }
  }
  if (url.length <= truncateLen) {
    return url;
  }
  if (urlObj.host) {
    urlObj.host = urlObj.host.replace(/^www\./, "");
    url = buildUrl(urlObj);
  }
  if (url.length <= truncateLen) {
    return url;
  }
  var str = "";
  if (urlObj.host) {
    str += urlObj.host;
  }
  if (str.length >= availableLength) {
    if (urlObj.host.length == truncateLen) {
      return (urlObj.host.substr(0, truncateLen - ellipsisLength) + ellipsisChars).substr(0, availableLength + ellipsisLengthBeforeParsing);
    }
    return buildSegment(str, availableLength).substr(0, availableLength + ellipsisLengthBeforeParsing);
  }
  var pathAndQuery = "";
  if (urlObj.path) {
    pathAndQuery += "/" + urlObj.path;
  }
  if (urlObj.query) {
    pathAndQuery += "?" + urlObj.query;
  }
  if (pathAndQuery) {
    if ((str + pathAndQuery).length >= availableLength) {
      if ((str + pathAndQuery).length == truncateLen) {
        return (str + pathAndQuery).substr(0, truncateLen);
      }
      var remainingAvailableLength = availableLength - str.length;
      return (str + buildSegment(pathAndQuery, remainingAvailableLength)).substr(0, availableLength + ellipsisLengthBeforeParsing);
    } else {
      str += pathAndQuery;
    }
  }
  if (urlObj.fragment) {
    var fragment = "#" + urlObj.fragment;
    if ((str + fragment).length >= availableLength) {
      if ((str + fragment).length == truncateLen) {
        return (str + fragment).substr(0, truncateLen);
      }
      var remainingAvailableLength2 = availableLength - str.length;
      return (str + buildSegment(fragment, remainingAvailableLength2)).substr(0, availableLength + ellipsisLengthBeforeParsing);
    } else {
      str += fragment;
    }
  }
  if (urlObj.scheme && urlObj.host) {
    var scheme = urlObj.scheme + "://";
    if ((str + scheme).length < availableLength) {
      return (scheme + str).substr(0, truncateLen);
    }
  }
  if (str.length <= truncateLen) {
    return str;
  }
  var end = "";
  if (availableLength > 0) {
    end = str.substr(-1 * Math.floor(availableLength / 2));
  }
  return (str.substr(0, Math.ceil(availableLength / 2)) + ellipsisChars + end).substr(0, availableLength + ellipsisLengthBeforeParsing);
}

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/truncate/truncate-middle.js
function truncateMiddle(url, truncateLen, ellipsisChars) {
  if (url.length <= truncateLen) {
    return url;
  }
  var ellipsisLengthBeforeParsing;
  var ellipsisLength;
  if (ellipsisChars == null) {
    ellipsisChars = "&hellip;";
    ellipsisLengthBeforeParsing = 8;
    ellipsisLength = 3;
  } else {
    ellipsisLengthBeforeParsing = ellipsisChars.length;
    ellipsisLength = ellipsisChars.length;
  }
  var availableLength = truncateLen - ellipsisLength;
  var end = "";
  if (availableLength > 0) {
    end = url.substr(-1 * Math.floor(availableLength / 2));
  }
  return (url.substr(0, Math.ceil(availableLength / 2)) + ellipsisChars + end).substr(0, availableLength + ellipsisLengthBeforeParsing);
}

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/truncate/truncate-end.js
function truncateEnd(anchorText, truncateLen, ellipsisChars) {
  return ellipsis(anchorText, truncateLen, ellipsisChars);
}

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/anchor-tag-builder.js
var AnchorTagBuilder = (
  /** @class */
  (function() {
    function AnchorTagBuilder2(cfg) {
      if (cfg === void 0) {
        cfg = {};
      }
      this.newWindow = false;
      this.truncate = {};
      this.className = "";
      this.newWindow = cfg.newWindow || false;
      this.truncate = cfg.truncate || {};
      this.className = cfg.className || "";
    }
    AnchorTagBuilder2.prototype.build = function(match) {
      return new HtmlTag({
        tagName: "a",
        attrs: this.createAttrs(match),
        innerHtml: this.processAnchorText(match.getAnchorText())
      });
    };
    AnchorTagBuilder2.prototype.createAttrs = function(match) {
      var attrs = {
        href: match.getAnchorHref()
        // we'll always have the `href` attribute
      };
      var cssClass = this.createCssClass(match);
      if (cssClass) {
        attrs["class"] = cssClass;
      }
      if (this.newWindow) {
        attrs["target"] = "_blank";
        attrs["rel"] = "noopener noreferrer";
      }
      if (this.truncate) {
        if (this.truncate.length && this.truncate.length < match.getAnchorText().length) {
          attrs["title"] = match.getAnchorHref();
        }
      }
      return attrs;
    };
    AnchorTagBuilder2.prototype.createCssClass = function(match) {
      var className = this.className;
      if (!className) {
        return "";
      } else {
        var returnClasses = [className], cssClassSuffixes = match.getCssClassSuffixes();
        for (var i2 = 0, len = cssClassSuffixes.length; i2 < len; i2++) {
          returnClasses.push(className + "-" + cssClassSuffixes[i2]);
        }
        return returnClasses.join(" ");
      }
    };
    AnchorTagBuilder2.prototype.processAnchorText = function(anchorText) {
      anchorText = this.doTruncate(anchorText);
      return anchorText;
    };
    AnchorTagBuilder2.prototype.doTruncate = function(anchorText) {
      var truncate = this.truncate;
      if (!truncate || !truncate.length)
        return anchorText;
      var truncateLength = truncate.length, truncateLocation = truncate.location;
      if (truncateLocation === "smart") {
        return truncateSmart(anchorText, truncateLength);
      } else if (truncateLocation === "middle") {
        return truncateMiddle(anchorText, truncateLength);
      } else {
        return truncateEnd(anchorText, truncateLength);
      }
    };
    return AnchorTagBuilder2;
  })()
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/match/match.js
var Match = (
  /** @class */
  (function() {
    function Match2(cfg) {
      this.__jsduckDummyDocProp = null;
      this.matchedText = "";
      this.offset = 0;
      this.tagBuilder = cfg.tagBuilder;
      this.matchedText = cfg.matchedText;
      this.offset = cfg.offset;
    }
    Match2.prototype.getMatchedText = function() {
      return this.matchedText;
    };
    Match2.prototype.setOffset = function(offset) {
      this.offset = offset;
    };
    Match2.prototype.getOffset = function() {
      return this.offset;
    };
    Match2.prototype.getCssClassSuffixes = function() {
      return [this.getType()];
    };
    Match2.prototype.buildTag = function() {
      return this.tagBuilder.build(this);
    };
    return Match2;
  })()
);

// ../../node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs
var extendStatics = function(d, b) {
  extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
    d2.__proto__ = b2;
  } || function(d2, b2) {
    for (var p2 in b2) if (Object.prototype.hasOwnProperty.call(b2, p2)) d2[p2] = b2[p2];
  };
  return extendStatics(d, b);
};
function __extends(d, b) {
  if (typeof b !== "function" && b !== null)
    throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
  extendStatics(d, b);
  function __() {
    this.constructor = d;
  }
  d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}
var __assign = function() {
  __assign = Object.assign || function __assign2(t) {
    for (var s, i2 = 1, n = arguments.length; i2 < n; i2++) {
      s = arguments[i2];
      for (var p2 in s) if (Object.prototype.hasOwnProperty.call(s, p2)) t[p2] = s[p2];
    }
    return t;
  };
  return __assign.apply(this, arguments);
};

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/match/email-match.js
var EmailMatch = (
  /** @class */
  (function(_super) {
    __extends(EmailMatch2, _super);
    function EmailMatch2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.email = "";
      _this.email = cfg.email;
      return _this;
    }
    EmailMatch2.prototype.getType = function() {
      return "email";
    };
    EmailMatch2.prototype.getEmail = function() {
      return this.email;
    };
    EmailMatch2.prototype.getAnchorHref = function() {
      return "mailto:" + this.email;
    };
    EmailMatch2.prototype.getAnchorText = function() {
      return this.email;
    };
    return EmailMatch2;
  })(Match)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/match/hashtag-match.js
var HashtagMatch = (
  /** @class */
  (function(_super) {
    __extends(HashtagMatch2, _super);
    function HashtagMatch2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.serviceName = "";
      _this.hashtag = "";
      _this.serviceName = cfg.serviceName;
      _this.hashtag = cfg.hashtag;
      return _this;
    }
    HashtagMatch2.prototype.getType = function() {
      return "hashtag";
    };
    HashtagMatch2.prototype.getServiceName = function() {
      return this.serviceName;
    };
    HashtagMatch2.prototype.getHashtag = function() {
      return this.hashtag;
    };
    HashtagMatch2.prototype.getAnchorHref = function() {
      var serviceName = this.serviceName, hashtag = this.hashtag;
      switch (serviceName) {
        case "twitter":
          return "https://twitter.com/hashtag/" + hashtag;
        case "facebook":
          return "https://www.facebook.com/hashtag/" + hashtag;
        case "instagram":
          return "https://instagram.com/explore/tags/" + hashtag;
        case "tiktok":
          return "https://www.tiktok.com/tag/" + hashtag;
        default:
          throw new Error("Unknown service name to point hashtag to: " + serviceName);
      }
    };
    HashtagMatch2.prototype.getAnchorText = function() {
      return "#" + this.hashtag;
    };
    return HashtagMatch2;
  })(Match)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/match/mention-match.js
var MentionMatch = (
  /** @class */
  (function(_super) {
    __extends(MentionMatch2, _super);
    function MentionMatch2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.serviceName = "twitter";
      _this.mention = "";
      _this.mention = cfg.mention;
      _this.serviceName = cfg.serviceName;
      return _this;
    }
    MentionMatch2.prototype.getType = function() {
      return "mention";
    };
    MentionMatch2.prototype.getMention = function() {
      return this.mention;
    };
    MentionMatch2.prototype.getServiceName = function() {
      return this.serviceName;
    };
    MentionMatch2.prototype.getAnchorHref = function() {
      switch (this.serviceName) {
        case "twitter":
          return "https://twitter.com/" + this.mention;
        case "instagram":
          return "https://instagram.com/" + this.mention;
        case "soundcloud":
          return "https://soundcloud.com/" + this.mention;
        case "tiktok":
          return "https://www.tiktok.com/@" + this.mention;
        default:
          throw new Error("Unknown service name to point mention to: " + this.serviceName);
      }
    };
    MentionMatch2.prototype.getAnchorText = function() {
      return "@" + this.mention;
    };
    MentionMatch2.prototype.getCssClassSuffixes = function() {
      var cssClassSuffixes = _super.prototype.getCssClassSuffixes.call(this), serviceName = this.getServiceName();
      if (serviceName) {
        cssClassSuffixes.push(serviceName);
      }
      return cssClassSuffixes;
    };
    return MentionMatch2;
  })(Match)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/match/phone-match.js
var PhoneMatch = (
  /** @class */
  (function(_super) {
    __extends(PhoneMatch2, _super);
    function PhoneMatch2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.number = "";
      _this.plusSign = false;
      _this.number = cfg.number;
      _this.plusSign = cfg.plusSign;
      return _this;
    }
    PhoneMatch2.prototype.getType = function() {
      return "phone";
    };
    PhoneMatch2.prototype.getPhoneNumber = function() {
      return this.number;
    };
    PhoneMatch2.prototype.getNumber = function() {
      return this.getPhoneNumber();
    };
    PhoneMatch2.prototype.getAnchorHref = function() {
      return "tel:" + (this.plusSign ? "+" : "") + this.number;
    };
    PhoneMatch2.prototype.getAnchorText = function() {
      return this.matchedText;
    };
    return PhoneMatch2;
  })(Match)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/match/url-match.js
var UrlMatch = (
  /** @class */
  (function(_super) {
    __extends(UrlMatch2, _super);
    function UrlMatch2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.url = "";
      _this.urlMatchType = "scheme";
      _this.protocolUrlMatch = false;
      _this.protocolRelativeMatch = false;
      _this.stripPrefix = {
        scheme: true,
        www: true
      };
      _this.stripTrailingSlash = true;
      _this.decodePercentEncoding = true;
      _this.schemePrefixRegex = /^(https?:\/\/)?/i;
      _this.wwwPrefixRegex = /^(https?:\/\/)?(www\.)?/i;
      _this.protocolRelativeRegex = /^\/\//;
      _this.protocolPrepended = false;
      _this.urlMatchType = cfg.urlMatchType;
      _this.url = cfg.url;
      _this.protocolUrlMatch = cfg.protocolUrlMatch;
      _this.protocolRelativeMatch = cfg.protocolRelativeMatch;
      _this.stripPrefix = cfg.stripPrefix;
      _this.stripTrailingSlash = cfg.stripTrailingSlash;
      _this.decodePercentEncoding = cfg.decodePercentEncoding;
      return _this;
    }
    UrlMatch2.prototype.getType = function() {
      return "url";
    };
    UrlMatch2.prototype.getUrlMatchType = function() {
      return this.urlMatchType;
    };
    UrlMatch2.prototype.getUrl = function() {
      var url = this.url;
      if (!this.protocolRelativeMatch && !this.protocolUrlMatch && !this.protocolPrepended) {
        url = this.url = "http://" + url;
        this.protocolPrepended = true;
      }
      return url;
    };
    UrlMatch2.prototype.getAnchorHref = function() {
      var url = this.getUrl();
      return url.replace(/&amp;/g, "&");
    };
    UrlMatch2.prototype.getAnchorText = function() {
      var anchorText = this.getMatchedText();
      if (this.protocolRelativeMatch) {
        anchorText = this.stripProtocolRelativePrefix(anchorText);
      }
      if (this.stripPrefix.scheme) {
        anchorText = this.stripSchemePrefix(anchorText);
      }
      if (this.stripPrefix.www) {
        anchorText = this.stripWwwPrefix(anchorText);
      }
      if (this.stripTrailingSlash) {
        anchorText = this.removeTrailingSlash(anchorText);
      }
      if (this.decodePercentEncoding) {
        anchorText = this.removePercentEncoding(anchorText);
      }
      return anchorText;
    };
    UrlMatch2.prototype.stripSchemePrefix = function(url) {
      return url.replace(this.schemePrefixRegex, "");
    };
    UrlMatch2.prototype.stripWwwPrefix = function(url) {
      return url.replace(this.wwwPrefixRegex, "$1");
    };
    UrlMatch2.prototype.stripProtocolRelativePrefix = function(text3) {
      return text3.replace(this.protocolRelativeRegex, "");
    };
    UrlMatch2.prototype.removeTrailingSlash = function(anchorText) {
      if (anchorText.charAt(anchorText.length - 1) === "/") {
        anchorText = anchorText.slice(0, -1);
      }
      return anchorText;
    };
    UrlMatch2.prototype.removePercentEncoding = function(anchorText) {
      var preProcessedEntityAnchorText = anchorText.replace(/%22/gi, "&quot;").replace(/%26/gi, "&amp;").replace(/%27/gi, "&#39;").replace(/%3C/gi, "&lt;").replace(/%3E/gi, "&gt;");
      try {
        return decodeURIComponent(preProcessedEntityAnchorText);
      } catch (e) {
        return preProcessedEntityAnchorText;
      }
    };
    return UrlMatch2;
  })(Match)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/matcher.js
var Matcher = (
  /** @class */
  /* @__PURE__ */ (function() {
    function Matcher2(cfg) {
      this.__jsduckDummyDocProp = null;
      this.tagBuilder = cfg.tagBuilder;
    }
    return Matcher2;
  })()
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/regex-lib.js
var letterRe = /[A-Za-z]/;
var digitRe = /[\d]/;
var nonDigitRe = /[\D]/;
var whitespaceRe = /\s/;
var quoteRe = /['"]/;
var controlCharsRe = /[\x00-\x1F\x7F]/;
var alphaCharsStr = /A-Za-z\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u08B6-\u08BD\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u1884\u1887-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C88\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\u4E00-\u9FD5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AE\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC/.source;
var emojiStr = /\u2700-\u27bf\udde6-\uddff\ud800-\udbff\udc00-\udfff\ufe0e\ufe0f\u0300-\u036f\ufe20-\ufe23\u20d0-\u20f0\ud83c\udffb-\udfff\u200d\u3299\u3297\u303d\u3030\u24c2\ud83c\udd70-\udd71\udd7e-\udd7f\udd8e\udd91-\udd9a\udde6-\uddff\ude01-\ude02\ude1a\ude2f\ude32-\ude3a\ude50-\ude51\u203c\u2049\u25aa-\u25ab\u25b6\u25c0\u25fb-\u25fe\u00a9\u00ae\u2122\u2139\udc04\u2600-\u26FF\u2b05\u2b06\u2b07\u2b1b\u2b1c\u2b50\u2b55\u231a\u231b\u2328\u23cf\u23e9-\u23f3\u23f8-\u23fa\udccf\u2935\u2934\u2190-\u21ff/.source;
var marksStr = /\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08D4-\u08E1\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B62\u0B63\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0C00-\u0C03\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0D01-\u0D03\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D82\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u180B-\u180D\u1885\u1886\u18A9\u1920-\u192B\u1930-\u193B\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F\u1AB0-\u1ABE\u1B00-\u1B04\u1B34-\u1B44\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BE6-\u1BF3\u1C24-\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF2-\u1CF4\u1CF8\u1CF9\u1DC0-\u1DF5\u1DFB-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA880\uA881\uA8B4-\uA8C5\uA8E0-\uA8F1\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9E5\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F/.source;
var alphaCharsAndMarksStr = alphaCharsStr + emojiStr + marksStr;
var decimalNumbersStr = /0-9\u0660-\u0669\u06F0-\u06F9\u07C0-\u07C9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0DE6-\u0DEF\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049\u1090-\u1099\u17E0-\u17E9\u1810-\u1819\u1946-\u194F\u19D0-\u19D9\u1A80-\u1A89\u1A90-\u1A99\u1B50-\u1B59\u1BB0-\u1BB9\u1C40-\u1C49\u1C50-\u1C59\uA620-\uA629\uA8D0-\uA8D9\uA900-\uA909\uA9D0-\uA9D9\uA9F0-\uA9F9\uAA50-\uAA59\uABF0-\uABF9\uFF10-\uFF19/.source;
var alphaNumericCharsStr = alphaCharsAndMarksStr + decimalNumbersStr;
var alphaNumericAndMarksCharsStr = alphaCharsAndMarksStr + decimalNumbersStr;
var alphaNumericAndMarksCharRe = new RegExp("[".concat(alphaNumericAndMarksCharsStr, "]"));
var ipStr = "(?:[" + decimalNumbersStr + "]{1,3}\\.){3}[" + decimalNumbersStr + "]{1,3}";
var domainLabelStr = "[" + alphaNumericAndMarksCharsStr + "](?:[" + alphaNumericAndMarksCharsStr + "\\-_]{0,61}[" + alphaNumericAndMarksCharsStr + "])?";
var getDomainLabelStr = function(group) {
  return "(?=(" + domainLabelStr + "))\\" + group;
};
var getDomainNameStr = function(group) {
  return "(?:" + getDomainLabelStr(group) + "(?:\\." + getDomainLabelStr(group + 1) + "){0,126}|" + ipStr + ")";
};
var domainNameCharRegex = alphaNumericAndMarksCharRe;

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/tld-regex.js
var tldRegex = /(?:xn--vermgensberatung-pwb|xn--vermgensberater-ctb|xn--clchc0ea0b2g2a9gcd|xn--w4r85el8fhu5dnra|northwesternmutual|travelersinsurance|vermögensberatung|xn--5su34j936bgsg|xn--bck1b9a5dre4c|xn--mgbah1a3hjkrd|xn--mgbai9azgqp6j|xn--mgberp4a5d4ar|xn--xkc2dl3a5ee0h|vermögensberater|xn--fzys8d69uvgm|xn--mgba7c0bbn0a|xn--mgbcpq6gpa1a|xn--xkc2al3hye2a|americanexpress|kerryproperties|sandvikcoromant|xn--i1b6b1a6a2e|xn--kcrx77d1x4a|xn--lgbbat1ad8j|xn--mgba3a4f16a|xn--mgbaakc7dvf|xn--mgbc0a9azcg|xn--nqv7fs00ema|americanfamily|bananarepublic|cancerresearch|cookingchannel|kerrylogistics|weatherchannel|xn--54b7fta0cc|xn--6qq986b3xl|xn--80aqecdr1a|xn--b4w605ferd|xn--fiq228c5hs|xn--h2breg3eve|xn--jlq480n2rg|xn--jlq61u9w7b|xn--mgba3a3ejt|xn--mgbaam7a8h|xn--mgbayh7gpa|xn--mgbbh1a71e|xn--mgbca7dzdo|xn--mgbi4ecexp|xn--mgbx4cd0ab|xn--rvc1e0am3e|international|lifeinsurance|travelchannel|wolterskluwer|xn--cckwcxetd|xn--eckvdtc9d|xn--fpcrj9c3d|xn--fzc2c9e2c|xn--h2brj9c8c|xn--tiq49xqyj|xn--yfro4i67o|xn--ygbi2ammx|construction|lplfinancial|scholarships|versicherung|xn--3e0b707e|xn--45br5cyl|xn--4dbrk0ce|xn--80adxhks|xn--80asehdb|xn--8y0a063a|xn--gckr3f0f|xn--mgb9awbf|xn--mgbab2bd|xn--mgbgu82a|xn--mgbpl2fh|xn--mgbt3dhd|xn--mk1bu44c|xn--ngbc5azd|xn--ngbe9e0a|xn--ogbpf8fl|xn--qcka1pmc|accountants|barclaycard|blackfriday|blockbuster|bridgestone|calvinklein|contractors|creditunion|engineering|enterprises|foodnetwork|investments|kerryhotels|lamborghini|motorcycles|olayangroup|photography|playstation|productions|progressive|redumbrella|williamhill|xn--11b4c3d|xn--1ck2e1b|xn--1qqw23a|xn--2scrj9c|xn--3bst00m|xn--3ds443g|xn--3hcrj9c|xn--42c2d9a|xn--45brj9c|xn--55qw42g|xn--6frz82g|xn--80ao21a|xn--9krt00a|xn--cck2b3b|xn--czr694b|xn--d1acj3b|xn--efvy88h|xn--fct429k|xn--fjq720a|xn--flw351e|xn--g2xx48c|xn--gecrj9c|xn--gk3at1e|xn--h2brj9c|xn--hxt814e|xn--imr513n|xn--j6w193g|xn--jvr189m|xn--kprw13d|xn--kpry57d|xn--mgbbh1a|xn--mgbtx2b|xn--mix891f|xn--nyqy26a|xn--otu796d|xn--pgbs0dh|xn--q9jyb4c|xn--rhqv96g|xn--rovu88b|xn--s9brj9c|xn--ses554g|xn--t60b56a|xn--vuq861b|xn--w4rs40l|xn--xhq521b|xn--zfr164b|சிங்கப்பூர்|accountant|apartments|associates|basketball|bnpparibas|boehringer|capitalone|consulting|creditcard|cuisinella|eurovision|extraspace|foundation|healthcare|immobilien|industries|management|mitsubishi|nextdirect|properties|protection|prudential|realestate|republican|restaurant|schaeffler|tatamotors|technology|university|vlaanderen|volkswagen|xn--30rr7y|xn--3pxu8k|xn--45q11c|xn--4gbrim|xn--55qx5d|xn--5tzm5g|xn--80aswg|xn--90a3ac|xn--9dbq2a|xn--9et52u|xn--c2br7g|xn--cg4bki|xn--czrs0t|xn--czru2d|xn--fiq64b|xn--fiqs8s|xn--fiqz9s|xn--io0a7i|xn--kput3i|xn--mxtq1m|xn--o3cw4h|xn--pssy2u|xn--q7ce6a|xn--unup4y|xn--wgbh1c|xn--wgbl6a|xn--y9a3aq|accenture|alfaromeo|allfinanz|amsterdam|analytics|aquarelle|barcelona|bloomberg|christmas|community|directory|education|equipment|fairwinds|financial|firestone|fresenius|frontdoor|furniture|goldpoint|hisamitsu|homedepot|homegoods|homesense|institute|insurance|kuokgroup|lancaster|landrover|lifestyle|marketing|marshalls|melbourne|microsoft|panasonic|passagens|pramerica|richardli|shangrila|solutions|statebank|statefarm|stockholm|travelers|vacations|xn--90ais|xn--c1avg|xn--d1alf|xn--e1a4c|xn--fhbei|xn--j1aef|xn--j1amh|xn--l1acc|xn--ngbrx|xn--nqv7f|xn--p1acf|xn--qxa6a|xn--tckwe|xn--vhquv|yodobashi|موريتانيا|abudhabi|airforce|allstate|attorney|barclays|barefoot|bargains|baseball|boutique|bradesco|broadway|brussels|builders|business|capetown|catering|catholic|cipriani|cityeats|cleaning|clinique|clothing|commbank|computer|delivery|deloitte|democrat|diamonds|discount|discover|download|engineer|ericsson|etisalat|exchange|feedback|fidelity|firmdale|football|frontier|goodyear|grainger|graphics|guardian|hdfcbank|helsinki|holdings|hospital|infiniti|ipiranga|istanbul|jpmorgan|lighting|lundbeck|marriott|maserati|mckinsey|memorial|merckmsd|mortgage|observer|partners|pharmacy|pictures|plumbing|property|redstone|reliance|saarland|samsclub|security|services|shopping|showtime|softbank|software|stcgroup|supplies|training|vanguard|ventures|verisign|woodside|xn--90ae|xn--node|xn--p1ai|xn--qxam|yokohama|السعودية|abogado|academy|agakhan|alibaba|android|athleta|auction|audible|auspost|avianca|banamex|bauhaus|bentley|bestbuy|booking|brother|bugatti|capital|caravan|careers|channel|charity|chintai|citadel|clubmed|college|cologne|comcast|company|compare|contact|cooking|corsica|country|coupons|courses|cricket|cruises|dentist|digital|domains|exposed|express|farmers|fashion|ferrari|ferrero|finance|fishing|fitness|flights|florist|flowers|forsale|frogans|fujitsu|gallery|genting|godaddy|grocery|guitars|hamburg|hangout|hitachi|holiday|hosting|hoteles|hotmail|hyundai|ismaili|jewelry|juniper|kitchen|komatsu|lacaixa|lanxess|lasalle|latrobe|leclerc|limited|lincoln|markets|monster|netbank|netflix|network|neustar|okinawa|oldnavy|organic|origins|philips|pioneer|politie|realtor|recipes|rentals|reviews|rexroth|samsung|sandvik|schmidt|schwarz|science|shiksha|singles|staples|storage|support|surgery|systems|temasek|theater|theatre|tickets|tiffany|toshiba|trading|walmart|wanggou|watches|weather|website|wedding|whoswho|windows|winners|xfinity|yamaxun|youtube|zuerich|католик|اتصالات|البحرين|الجزائر|العليان|پاکستان|كاثوليك|இந்தியா|abarth|abbott|abbvie|africa|agency|airbus|airtel|alipay|alsace|alstom|amazon|anquan|aramco|author|bayern|beauty|berlin|bharti|bostik|boston|broker|camera|career|casino|center|chanel|chrome|church|circle|claims|clinic|coffee|comsec|condos|coupon|credit|cruise|dating|datsun|dealer|degree|dental|design|direct|doctor|dunlop|dupont|durban|emerck|energy|estate|events|expert|family|flickr|futbol|gallup|garden|george|giving|global|google|gratis|health|hermes|hiphop|hockey|hotels|hughes|imamat|insure|intuit|jaguar|joburg|juegos|kaufen|kinder|kindle|kosher|lancia|latino|lawyer|lefrak|living|locker|london|luxury|madrid|maison|makeup|market|mattel|mobile|monash|mormon|moscow|museum|mutual|nagoya|natura|nissan|nissay|norton|nowruz|office|olayan|online|oracle|orange|otsuka|pfizer|photos|physio|pictet|quebec|racing|realty|reisen|repair|report|review|rocher|rogers|ryukyu|safety|sakura|sanofi|school|schule|search|secure|select|shouji|soccer|social|stream|studio|supply|suzuki|swatch|sydney|taipei|taobao|target|tattoo|tennis|tienda|tjmaxx|tkmaxx|toyota|travel|unicom|viajes|viking|villas|virgin|vision|voting|voyage|vuelos|walter|webcam|xihuan|yachts|yandex|zappos|москва|онлайн|ابوظبي|ارامكو|الاردن|المغرب|امارات|فلسطين|مليسيا|भारतम्|இலங்கை|ファッション|actor|adult|aetna|amfam|amica|apple|archi|audio|autos|azure|baidu|beats|bible|bingo|black|boats|bosch|build|canon|cards|chase|cheap|cisco|citic|click|cloud|coach|codes|crown|cymru|dabur|dance|deals|delta|drive|dubai|earth|edeka|email|epson|faith|fedex|final|forex|forum|gallo|games|gifts|gives|glass|globo|gmail|green|gripe|group|gucci|guide|homes|honda|horse|house|hyatt|ikano|irish|jetzt|koeln|kyoto|lamer|lease|legal|lexus|lilly|linde|lipsy|loans|locus|lotte|lotto|macys|mango|media|miami|money|movie|music|nexus|nikon|ninja|nokia|nowtv|omega|osaka|paris|parts|party|phone|photo|pizza|place|poker|praxi|press|prime|promo|quest|radio|rehab|reise|ricoh|rocks|rodeo|rugby|salon|sener|seven|sharp|shell|shoes|skype|sling|smart|smile|solar|space|sport|stada|store|study|style|sucks|swiss|tatar|tires|tirol|tmall|today|tokyo|tools|toray|total|tours|trade|trust|tunes|tushu|ubank|vegas|video|vodka|volvo|wales|watch|weber|weibo|works|world|xerox|yahoo|ישראל|ایران|بازار|بھارت|سودان|سورية|همراه|भारोत|संगठन|বাংলা|భారత్|ഭാരതം|嘉里大酒店|aarp|able|adac|aero|akdn|ally|amex|arab|army|arpa|arte|asda|asia|audi|auto|baby|band|bank|bbva|beer|best|bike|bing|blog|blue|bofa|bond|book|buzz|cafe|call|camp|care|cars|casa|case|cash|cbre|cern|chat|citi|city|club|cool|coop|cyou|data|date|dclk|deal|dell|desi|diet|dish|docs|dvag|erni|fage|fail|fans|farm|fast|fiat|fido|film|fire|fish|flir|food|ford|free|fund|game|gbiz|gent|ggee|gift|gmbh|gold|golf|goog|guge|guru|hair|haus|hdfc|help|here|hgtv|host|hsbc|icbc|ieee|imdb|immo|info|itau|java|jeep|jobs|jprs|kddi|kids|kiwi|kpmg|kred|land|lego|lgbt|lidl|life|like|limo|link|live|loan|loft|love|ltda|luxe|maif|meet|meme|menu|mini|mint|mobi|moda|moto|name|navy|news|next|nico|nike|ollo|open|page|pars|pccw|pics|ping|pink|play|plus|pohl|porn|post|prod|prof|qpon|read|reit|rent|rest|rich|room|rsvp|ruhr|safe|sale|sarl|save|saxo|scot|seat|seek|sexy|shaw|shia|shop|show|silk|sina|site|skin|sncf|sohu|song|sony|spot|star|surf|talk|taxi|team|tech|teva|tiaa|tips|town|toys|tube|vana|visa|viva|vivo|vote|voto|wang|weir|wien|wiki|wine|work|xbox|yoga|zara|zero|zone|дети|сайт|بارت|بيتك|ڀارت|تونس|شبكة|عراق|عمان|موقع|भारत|ভারত|ভাৰত|ਭਾਰਤ|ભારત|ଭାରତ|ಭಾರತ|ලංකා|アマゾン|グーグル|クラウド|ポイント|组织机构|電訊盈科|香格里拉|aaa|abb|abc|aco|ads|aeg|afl|aig|anz|aol|app|art|aws|axa|bar|bbc|bbt|bcg|bcn|bet|bid|bio|biz|bms|bmw|bom|boo|bot|box|buy|bzh|cab|cal|cam|car|cat|cba|cbn|cbs|ceo|cfa|cfd|com|cpa|crs|dad|day|dds|dev|dhl|diy|dnp|dog|dot|dtv|dvr|eat|eco|edu|esq|eus|fan|fit|fly|foo|fox|frl|ftr|fun|fyi|gal|gap|gay|gdn|gea|gle|gmo|gmx|goo|gop|got|gov|hbo|hiv|hkt|hot|how|ibm|ice|icu|ifm|inc|ing|ink|int|ist|itv|jcb|jio|jll|jmp|jnj|jot|joy|kfh|kia|kim|kpn|krd|lat|law|lds|llc|llp|lol|lpl|ltd|man|map|mba|med|men|mil|mit|mlb|mls|mma|moe|moi|mom|mov|msd|mtn|mtr|nab|nba|nec|net|new|nfl|ngo|nhk|now|nra|nrw|ntt|nyc|obi|one|ong|onl|ooo|org|ott|ovh|pay|pet|phd|pid|pin|pnc|pro|pru|pub|pwc|red|ren|ril|rio|rip|run|rwe|sap|sas|sbi|sbs|sca|scb|ses|sew|sex|sfr|ski|sky|soy|spa|srl|stc|tab|tax|tci|tdk|tel|thd|tjx|top|trv|tui|tvs|ubs|uno|uol|ups|vet|vig|vin|vip|wed|win|wme|wow|wtc|wtf|xin|xxx|xyz|you|yun|zip|бел|ком|қаз|мкд|мон|орг|рус|срб|укр|հայ|קום|عرب|قطر|كوم|مصر|कॉम|नेट|คอม|ไทย|ລາວ|ストア|セール|みんな|中文网|亚马逊|天主教|我爱你|新加坡|淡马锡|诺基亚|飞利浦|ac|ad|ae|af|ag|ai|al|am|ao|aq|ar|as|at|au|aw|ax|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cu|cv|cw|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|er|es|et|eu|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|rs|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|ss|st|su|sv|sx|sy|sz|tc|td|tf|tg|th|tj|tk|tl|tm|tn|to|tr|tt|tv|tw|tz|ua|ug|uk|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|za|zm|zw|ελ|ευ|бг|ею|рф|გე|닷넷|닷컴|삼성|한국|コム|世界|中信|中国|中國|企业|佛山|信息|健康|八卦|公司|公益|台湾|台灣|商城|商店|商标|嘉里|在线|大拿|娱乐|家電|广东|微博|慈善|手机|招聘|政务|政府|新闻|时尚|書籍|机构|游戏|澳門|点看|移动|网址|网店|网站|网络|联通|谷歌|购物|通販|集团|食品|餐厅|香港)/;

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/email-matcher.js
var localPartCharRegex = new RegExp("[".concat(alphaNumericAndMarksCharsStr, "!#$%&'*+/=?^_`{|}~-]"));
var strictTldRegex = new RegExp("^".concat(tldRegex.source, "$"));
var EmailMatcher = (
  /** @class */
  (function(_super) {
    __extends(EmailMatcher2, _super);
    function EmailMatcher2() {
      var _this = _super !== null && _super.apply(this, arguments) || this;
      _this.localPartCharRegex = localPartCharRegex;
      _this.strictTldRegex = strictTldRegex;
      return _this;
    }
    EmailMatcher2.prototype.parseMatches = function(text3) {
      var tagBuilder = this.tagBuilder, localPartCharRegex2 = this.localPartCharRegex, strictTldRegex2 = this.strictTldRegex, matches = [], len = text3.length, noCurrentEmailMatch = new CurrentEmailMatch();
      var mailtoTransitions = {
        m: "a",
        a: "i",
        i: "l",
        l: "t",
        t: "o",
        o: ":"
      };
      var charIdx = 0, state = 0, currentEmailMatch = noCurrentEmailMatch;
      while (charIdx < len) {
        var char = text3.charAt(charIdx);
        switch (state) {
          case 0:
            stateNonEmailAddress(char);
            break;
          case 1:
            stateMailTo(text3.charAt(charIdx - 1), char);
            break;
          case 2:
            stateLocalPart(char);
            break;
          case 3:
            stateLocalPartDot(char);
            break;
          case 4:
            stateAtSign(char);
            break;
          case 5:
            stateDomainChar(char);
            break;
          case 6:
            stateDomainHyphen(char);
            break;
          case 7:
            stateDomainDot(char);
            break;
          default:
            throwUnhandledCaseError(state);
        }
        charIdx++;
      }
      captureMatchIfValidAndReset();
      return matches;
      function stateNonEmailAddress(char2) {
        if (char2 === "m") {
          beginEmailMatch(
            1
            /* Mailto */
          );
        } else if (localPartCharRegex2.test(char2)) {
          beginEmailMatch();
        } else ;
      }
      function stateMailTo(prevChar, char2) {
        if (prevChar === ":") {
          if (localPartCharRegex2.test(char2)) {
            state = 2;
            currentEmailMatch = new CurrentEmailMatch(__assign(__assign({}, currentEmailMatch), { hasMailtoPrefix: true }));
          } else {
            resetToNonEmailMatchState();
          }
        } else if (mailtoTransitions[prevChar] === char2) ; else if (localPartCharRegex2.test(char2)) {
          state = 2;
        } else if (char2 === ".") {
          state = 3;
        } else if (char2 === "@") {
          state = 4;
        } else {
          resetToNonEmailMatchState();
        }
      }
      function stateLocalPart(char2) {
        if (char2 === ".") {
          state = 3;
        } else if (char2 === "@") {
          state = 4;
        } else if (localPartCharRegex2.test(char2)) ; else {
          resetToNonEmailMatchState();
        }
      }
      function stateLocalPartDot(char2) {
        if (char2 === ".") {
          resetToNonEmailMatchState();
        } else if (char2 === "@") {
          resetToNonEmailMatchState();
        } else if (localPartCharRegex2.test(char2)) {
          state = 2;
        } else {
          resetToNonEmailMatchState();
        }
      }
      function stateAtSign(char2) {
        if (domainNameCharRegex.test(char2)) {
          state = 5;
        } else {
          resetToNonEmailMatchState();
        }
      }
      function stateDomainChar(char2) {
        if (char2 === ".") {
          state = 7;
        } else if (char2 === "-") {
          state = 6;
        } else if (domainNameCharRegex.test(char2)) ; else {
          captureMatchIfValidAndReset();
        }
      }
      function stateDomainHyphen(char2) {
        if (char2 === "-" || char2 === ".") {
          captureMatchIfValidAndReset();
        } else if (domainNameCharRegex.test(char2)) {
          state = 5;
        } else {
          captureMatchIfValidAndReset();
        }
      }
      function stateDomainDot(char2) {
        if (char2 === "." || char2 === "-") {
          captureMatchIfValidAndReset();
        } else if (domainNameCharRegex.test(char2)) {
          state = 5;
          currentEmailMatch = new CurrentEmailMatch(__assign(__assign({}, currentEmailMatch), { hasDomainDot: true }));
        } else {
          captureMatchIfValidAndReset();
        }
      }
      function beginEmailMatch(newState) {
        if (newState === void 0) {
          newState = 2;
        }
        state = newState;
        currentEmailMatch = new CurrentEmailMatch({ idx: charIdx });
      }
      function resetToNonEmailMatchState() {
        state = 0;
        currentEmailMatch = noCurrentEmailMatch;
      }
      function captureMatchIfValidAndReset() {
        if (currentEmailMatch.hasDomainDot) {
          var matchedText = text3.slice(currentEmailMatch.idx, charIdx);
          if (/[-.]$/.test(matchedText)) {
            matchedText = matchedText.slice(0, -1);
          }
          var emailAddress = currentEmailMatch.hasMailtoPrefix ? matchedText.slice("mailto:".length) : matchedText;
          if (doesEmailHaveValidTld(emailAddress)) {
            matches.push(new EmailMatch({
              tagBuilder,
              matchedText,
              offset: currentEmailMatch.idx,
              email: emailAddress
            }));
          }
        }
        resetToNonEmailMatchState();
        function doesEmailHaveValidTld(emailAddress2) {
          var emailAddressTld = emailAddress2.split(".").pop() || "";
          var emailAddressNormalized = emailAddressTld.toLowerCase();
          var isValidTld = strictTldRegex2.test(emailAddressNormalized);
          return isValidTld;
        }
      }
    };
    return EmailMatcher2;
  })(Matcher)
);
var CurrentEmailMatch = (
  /** @class */
  /* @__PURE__ */ (function() {
    function CurrentEmailMatch2(cfg) {
      if (cfg === void 0) {
        cfg = {};
      }
      this.idx = cfg.idx !== void 0 ? cfg.idx : -1;
      this.hasMailtoPrefix = !!cfg.hasMailtoPrefix;
      this.hasDomainDot = !!cfg.hasDomainDot;
    }
    return CurrentEmailMatch2;
  })()
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/url-match-validator.js
var UrlMatchValidator = (
  /** @class */
  (function() {
    function UrlMatchValidator2() {
    }
    UrlMatchValidator2.isValid = function(urlMatch, protocolUrlMatch) {
      if (protocolUrlMatch && !this.isValidUriScheme(protocolUrlMatch) || this.urlMatchDoesNotHaveProtocolOrDot(urlMatch, protocolUrlMatch) || // At least one period ('.') must exist in the URL match for us to consider it an actual URL, *unless* it was a full protocol match (like 'http://localhost')
      this.urlMatchDoesNotHaveAtLeastOneWordChar(urlMatch, protocolUrlMatch) && // At least one letter character must exist in the domain name after a protocol match. Ex: skip over something like "git:1.0"
      !this.isValidIpAddress(urlMatch) || // Except if it's an IP address
      this.containsMultipleDots(urlMatch)) {
        return false;
      }
      return true;
    };
    UrlMatchValidator2.isValidIpAddress = function(uriSchemeMatch) {
      var newRegex = new RegExp(this.hasFullProtocolRegex.source + this.ipRegex.source);
      var uriScheme = uriSchemeMatch.match(newRegex);
      return uriScheme !== null;
    };
    UrlMatchValidator2.containsMultipleDots = function(urlMatch) {
      var stringBeforeSlash = urlMatch;
      if (this.hasFullProtocolRegex.test(urlMatch)) {
        stringBeforeSlash = urlMatch.split("://")[1];
      }
      return stringBeforeSlash.split("/")[0].indexOf("..") > -1;
    };
    UrlMatchValidator2.isValidUriScheme = function(uriSchemeMatch) {
      var uriSchemeMatchArr = uriSchemeMatch.match(this.uriSchemeRegex), uriScheme = uriSchemeMatchArr && uriSchemeMatchArr[0].toLowerCase();
      return uriScheme !== "javascript:" && uriScheme !== "vbscript:";
    };
    UrlMatchValidator2.urlMatchDoesNotHaveProtocolOrDot = function(urlMatch, protocolUrlMatch) {
      return !!urlMatch && (!protocolUrlMatch || !this.hasFullProtocolRegex.test(protocolUrlMatch)) && urlMatch.indexOf(".") === -1;
    };
    UrlMatchValidator2.urlMatchDoesNotHaveAtLeastOneWordChar = function(urlMatch, protocolUrlMatch) {
      if (urlMatch && protocolUrlMatch) {
        return !this.hasFullProtocolRegex.test(protocolUrlMatch) && !this.hasWordCharAfterProtocolRegex.test(urlMatch);
      } else {
        return false;
      }
    };
    UrlMatchValidator2.hasFullProtocolRegex = /^[A-Za-z][-.+A-Za-z0-9]*:\/\//;
    UrlMatchValidator2.uriSchemeRegex = /^[A-Za-z][-.+A-Za-z0-9]*:/;
    UrlMatchValidator2.hasWordCharAfterProtocolRegex = new RegExp(":[^\\s]*?[" + alphaCharsStr + "]");
    UrlMatchValidator2.ipRegex = /[0-9][0-9]?[0-9]?\.[0-9][0-9]?[0-9]?\.[0-9][0-9]?[0-9]?\.[0-9][0-9]?[0-9]?(:[0-9]*)?\/?$/;
    return UrlMatchValidator2;
  })()
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/url-matcher.js
var matcherRegex = (function() {
  var schemeRegex = /(?:[A-Za-z][-.+A-Za-z0-9]{0,63}:(?![A-Za-z][-.+A-Za-z0-9]{0,63}:\/\/)(?!\d+\/?)(?:\/\/)?)/, wwwRegex = /(?:www\.)/, urlSuffixRegex = new RegExp("[/?#](?:[" + alphaNumericAndMarksCharsStr + "\\-+&@#/%=~_()|'$*\\[\\]{}?!:,.;^\u2713]*[" + alphaNumericAndMarksCharsStr + "\\-+&@#/%=~_()|'$*\\[\\]{}\u2713])?");
  return new RegExp([
    "(?:",
    "(",
    schemeRegex.source,
    getDomainNameStr(2),
    ")",
    "|",
    "(",
    "(//)?",
    wwwRegex.source,
    getDomainNameStr(6),
    ")",
    "|",
    "(",
    "(//)?",
    getDomainNameStr(10) + "\\.",
    tldRegex.source,
    "(?![-" + alphaNumericCharsStr + "])",
    ")",
    ")",
    "(?::[0-9]+)?",
    "(?:" + urlSuffixRegex.source + ")?"
    // match for path, query string, and/or hash anchor - optional
  ].join(""), "gi");
})();
var wordCharRegExp = new RegExp("[" + alphaNumericAndMarksCharsStr + "]");
var UrlMatcher = (
  /** @class */
  (function(_super) {
    __extends(UrlMatcher2, _super);
    function UrlMatcher2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.stripPrefix = {
        scheme: true,
        www: true
      };
      _this.stripTrailingSlash = true;
      _this.decodePercentEncoding = true;
      _this.matcherRegex = matcherRegex;
      _this.wordCharRegExp = wordCharRegExp;
      _this.stripPrefix = cfg.stripPrefix;
      _this.stripTrailingSlash = cfg.stripTrailingSlash;
      _this.decodePercentEncoding = cfg.decodePercentEncoding;
      return _this;
    }
    UrlMatcher2.prototype.parseMatches = function(text3) {
      var matcherRegex2 = this.matcherRegex, stripPrefix = this.stripPrefix, stripTrailingSlash = this.stripTrailingSlash, decodePercentEncoding = this.decodePercentEncoding, tagBuilder = this.tagBuilder, matches = [], match;
      var _loop_1 = function() {
        var matchStr = match[0], schemeUrlMatch = match[1], wwwUrlMatch = match[4], wwwProtocolRelativeMatch = match[5], tldProtocolRelativeMatch = match[9], offset = match.index, protocolRelativeMatch = wwwProtocolRelativeMatch || tldProtocolRelativeMatch, prevChar = text3.charAt(offset - 1);
        if (!UrlMatchValidator.isValid(matchStr, schemeUrlMatch)) {
          return "continue";
        }
        if (offset > 0 && prevChar === "@") {
          return "continue";
        }
        if (offset > 0 && protocolRelativeMatch && this_1.wordCharRegExp.test(prevChar)) {
          return "continue";
        }
        if (/\?$/.test(matchStr)) {
          matchStr = matchStr.substr(0, matchStr.length - 1);
        }
        if (this_1.matchHasUnbalancedClosingParen(matchStr)) {
          matchStr = matchStr.substr(0, matchStr.length - 1);
        } else {
          var pos = this_1.matchHasInvalidCharAfterTld(matchStr, schemeUrlMatch);
          if (pos > -1) {
            matchStr = matchStr.substr(0, pos);
          }
        }
        var foundCommonScheme = ["http://", "https://"].find(function(commonScheme) {
          return !!schemeUrlMatch && schemeUrlMatch.indexOf(commonScheme) !== -1;
        });
        if (foundCommonScheme) {
          var indexOfSchemeStart = matchStr.indexOf(foundCommonScheme);
          matchStr = matchStr.substr(indexOfSchemeStart);
          schemeUrlMatch = schemeUrlMatch.substr(indexOfSchemeStart);
          offset = offset + indexOfSchemeStart;
        }
        var urlMatchType = schemeUrlMatch ? "scheme" : wwwUrlMatch ? "www" : "tld", protocolUrlMatch = !!schemeUrlMatch;
        matches.push(new UrlMatch({
          tagBuilder,
          matchedText: matchStr,
          offset,
          urlMatchType,
          url: matchStr,
          protocolUrlMatch,
          protocolRelativeMatch: !!protocolRelativeMatch,
          stripPrefix,
          stripTrailingSlash,
          decodePercentEncoding
        }));
      };
      var this_1 = this;
      while ((match = matcherRegex2.exec(text3)) !== null) {
        _loop_1();
      }
      return matches;
    };
    UrlMatcher2.prototype.matchHasUnbalancedClosingParen = function(matchStr) {
      var endChar = matchStr.charAt(matchStr.length - 1);
      var startChar;
      if (endChar === ")") {
        startChar = "(";
      } else if (endChar === "]") {
        startChar = "[";
      } else if (endChar === "}") {
        startChar = "{";
      } else {
        return false;
      }
      var numOpenBraces = 0;
      for (var i2 = 0, len = matchStr.length - 1; i2 < len; i2++) {
        var char = matchStr.charAt(i2);
        if (char === startChar) {
          numOpenBraces++;
        } else if (char === endChar) {
          numOpenBraces = Math.max(numOpenBraces - 1, 0);
        }
      }
      if (numOpenBraces === 0) {
        return true;
      }
      return false;
    };
    UrlMatcher2.prototype.matchHasInvalidCharAfterTld = function(urlMatch, schemeUrlMatch) {
      if (!urlMatch) {
        return -1;
      }
      var offset = 0;
      if (schemeUrlMatch) {
        offset = urlMatch.indexOf(":");
        urlMatch = urlMatch.slice(offset);
      }
      var re = new RegExp("^((.?//)?[-." + alphaNumericAndMarksCharsStr + "]*[-" + alphaNumericAndMarksCharsStr + "]\\.[-" + alphaNumericAndMarksCharsStr + "]+)");
      var res = re.exec(urlMatch);
      if (res === null) {
        return -1;
      }
      offset += res[1].length;
      urlMatch = urlMatch.slice(res[1].length);
      if (/^[^-.A-Za-z0-9:\/?#]/.test(urlMatch)) {
        return offset;
      }
      return -1;
    };
    return UrlMatcher2;
  })(Matcher)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/hashtag-matcher.js
var hashtagTextCharRe = new RegExp("[_".concat(alphaNumericAndMarksCharsStr, "]"));
var HashtagMatcher = (
  /** @class */
  (function(_super) {
    __extends(HashtagMatcher2, _super);
    function HashtagMatcher2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.serviceName = "twitter";
      _this.serviceName = cfg.serviceName;
      return _this;
    }
    HashtagMatcher2.prototype.parseMatches = function(text3) {
      var tagBuilder = this.tagBuilder;
      var serviceName = this.serviceName;
      var matches = [];
      var len = text3.length;
      var charIdx = 0, hashCharIdx = -1, state = 0;
      while (charIdx < len) {
        var char = text3.charAt(charIdx);
        switch (state) {
          case 0:
            stateNone(char);
            break;
          case 1:
            stateNonHashtagWordChar(char);
            break;
          case 2:
            stateHashtagHashChar(char);
            break;
          case 3:
            stateHashtagTextChar(char);
            break;
          default:
            throwUnhandledCaseError(state);
        }
        charIdx++;
      }
      captureMatchIfValid();
      return matches;
      function stateNone(char2) {
        if (char2 === "#") {
          state = 2;
          hashCharIdx = charIdx;
        } else if (alphaNumericAndMarksCharRe.test(char2)) {
          state = 1;
        } else ;
      }
      function stateNonHashtagWordChar(char2) {
        if (alphaNumericAndMarksCharRe.test(char2)) ; else {
          state = 0;
        }
      }
      function stateHashtagHashChar(char2) {
        if (hashtagTextCharRe.test(char2)) {
          state = 3;
        } else if (alphaNumericAndMarksCharRe.test(char2)) {
          state = 1;
        } else {
          state = 0;
        }
      }
      function stateHashtagTextChar(char2) {
        if (hashtagTextCharRe.test(char2)) ; else {
          captureMatchIfValid();
          hashCharIdx = -1;
          if (alphaNumericAndMarksCharRe.test(char2)) {
            state = 1;
          } else {
            state = 0;
          }
        }
      }
      function captureMatchIfValid() {
        if (hashCharIdx > -1 && charIdx - hashCharIdx <= 140) {
          var matchedText = text3.slice(hashCharIdx, charIdx);
          var match = new HashtagMatch({
            tagBuilder,
            matchedText,
            offset: hashCharIdx,
            serviceName,
            hashtag: matchedText.slice(1)
          });
          matches.push(match);
        }
      }
    };
    return HashtagMatcher2;
  })(Matcher)
);
var hashtagServices = ["twitter", "facebook", "instagram", "tiktok"];

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/phone-matcher.js
var mostPhoneNumbers = /(?:(?:(?:(\+)?\d{1,3}[-\040.]?)?\(?\d{3}\)?[-\040.]?\d{3}[-\040.]?\d{4})|(?:(\+)(?:9[976]\d|8[987530]\d|6[987]\d|5[90]\d|42\d|3[875]\d|2[98654321]\d|9[8543210]|8[6421]|6[6543210]|5[87654321]|4[987654310]|3[9643210]|2[70]|7|1)[-\040.]?(?:\d[-\040.]?){6,12}\d+))([,;]+[0-9]+#?)*/;
var japanesePhoneRe = /(0([1-9]{1}-?[1-9]\d{3}|[1-9]{2}-?\d{3}|[1-9]{2}\d{1}-?\d{2}|[1-9]{2}\d{2}-?\d{1})-?\d{4}|0[789]0-?\d{4}-?\d{4}|050-?\d{4}-?\d{4})/;
var phoneMatcherRegex = new RegExp("".concat(mostPhoneNumbers.source, "|").concat(japanesePhoneRe.source), "g");
var PhoneMatcher = (
  /** @class */
  (function(_super) {
    __extends(PhoneMatcher2, _super);
    function PhoneMatcher2() {
      var _this = _super !== null && _super.apply(this, arguments) || this;
      _this.matcherRegex = phoneMatcherRegex;
      return _this;
    }
    PhoneMatcher2.prototype.parseMatches = function(text3) {
      var matcherRegex2 = this.matcherRegex, tagBuilder = this.tagBuilder, matches = [], match;
      while ((match = matcherRegex2.exec(text3)) !== null) {
        var matchedText = match[0], cleanNumber = matchedText.replace(/[^0-9,;#]/g, ""), plusSign = !!(match[1] || match[2]), before = match.index == 0 ? "" : text3.substr(match.index - 1, 1), after = text3.substr(match.index + matchedText.length, 1), contextClear = !before.match(/\d/) && !after.match(/\d/);
        if (this.testMatch(match[3]) && this.testMatch(matchedText) && contextClear) {
          matches.push(new PhoneMatch({
            tagBuilder,
            matchedText,
            offset: match.index,
            number: cleanNumber,
            plusSign
          }));
        }
      }
      return matches;
    };
    PhoneMatcher2.prototype.testMatch = function(text3) {
      return nonDigitRe.test(text3);
    };
    return PhoneMatcher2;
  })(Matcher)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/matcher/mention-matcher.js
var twitterRegex = new RegExp("@[_".concat(alphaNumericAndMarksCharsStr, "]{1,50}(?![_").concat(alphaNumericAndMarksCharsStr, "])"), "g");
var instagramRegex = new RegExp("@[_.".concat(alphaNumericAndMarksCharsStr, "]{1,30}(?![_").concat(alphaNumericAndMarksCharsStr, "])"), "g");
var soundcloudRegex = new RegExp("@[-_.".concat(alphaNumericAndMarksCharsStr, "]{1,50}(?![-_").concat(alphaNumericAndMarksCharsStr, "])"), "g");
var tiktokRegex = new RegExp("@[_.".concat(alphaNumericAndMarksCharsStr, "]{1,23}[_").concat(alphaNumericAndMarksCharsStr, "](?![_").concat(alphaNumericAndMarksCharsStr, "])"), "g");
var nonWordCharRegex = new RegExp("[^" + alphaNumericAndMarksCharsStr + "]");
var MentionMatcher = (
  /** @class */
  (function(_super) {
    __extends(MentionMatcher2, _super);
    function MentionMatcher2(cfg) {
      var _this = _super.call(this, cfg) || this;
      _this.serviceName = "twitter";
      _this.matcherRegexes = {
        twitter: twitterRegex,
        instagram: instagramRegex,
        soundcloud: soundcloudRegex,
        tiktok: tiktokRegex
      };
      _this.nonWordCharRegex = nonWordCharRegex;
      _this.serviceName = cfg.serviceName;
      return _this;
    }
    MentionMatcher2.prototype.parseMatches = function(text3) {
      var serviceName = this.serviceName, matcherRegex2 = this.matcherRegexes[this.serviceName], nonWordCharRegex2 = this.nonWordCharRegex, tagBuilder = this.tagBuilder, matches = [], match;
      if (!matcherRegex2) {
        return matches;
      }
      while ((match = matcherRegex2.exec(text3)) !== null) {
        var offset = match.index, prevChar = text3.charAt(offset - 1);
        if (offset === 0 || nonWordCharRegex2.test(prevChar)) {
          var matchedText = match[0].replace(/\.+$/g, ""), mention = matchedText.slice(1);
          matches.push(new MentionMatch({
            tagBuilder,
            matchedText,
            offset,
            serviceName,
            mention
          }));
        }
      }
      return matches;
    };
    return MentionMatcher2;
  })(Matcher)
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/htmlParser/parse-html.js
function parseHtml(html, _a) {
  var onOpenTag = _a.onOpenTag, onCloseTag = _a.onCloseTag, onText = _a.onText, onComment = _a.onComment, onDoctype = _a.onDoctype;
  var noCurrentTag = new CurrentTag();
  var charIdx = 0, len = html.length, state = 0, currentDataIdx = 0, currentTag = noCurrentTag;
  while (charIdx < len) {
    var char = html.charAt(charIdx);
    switch (state) {
      case 0:
        stateData(char);
        break;
      case 1:
        stateTagOpen(char);
        break;
      case 2:
        stateEndTagOpen(char);
        break;
      case 3:
        stateTagName(char);
        break;
      case 4:
        stateBeforeAttributeName(char);
        break;
      case 5:
        stateAttributeName(char);
        break;
      case 6:
        stateAfterAttributeName(char);
        break;
      case 7:
        stateBeforeAttributeValue(char);
        break;
      case 8:
        stateAttributeValueDoubleQuoted(char);
        break;
      case 9:
        stateAttributeValueSingleQuoted(char);
        break;
      case 10:
        stateAttributeValueUnquoted(char);
        break;
      case 11:
        stateAfterAttributeValueQuoted(char);
        break;
      case 12:
        stateSelfClosingStartTag(char);
        break;
      case 13:
        stateMarkupDeclarationOpen();
        break;
      case 14:
        stateCommentStart(char);
        break;
      case 15:
        stateCommentStartDash(char);
        break;
      case 16:
        stateComment(char);
        break;
      case 17:
        stateCommentEndDash(char);
        break;
      case 18:
        stateCommentEnd(char);
        break;
      case 19:
        stateCommentEndBang(char);
        break;
      case 20:
        stateDoctype(char);
        break;
      default:
        throwUnhandledCaseError(state);
    }
    charIdx++;
  }
  if (currentDataIdx < charIdx) {
    emitText();
  }
  function stateData(char2) {
    if (char2 === "<") {
      startNewTag();
    }
  }
  function stateTagOpen(char2) {
    if (char2 === "!") {
      state = 13;
    } else if (char2 === "/") {
      state = 2;
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { isClosing: true }));
    } else if (char2 === "<") {
      startNewTag();
    } else if (letterRe.test(char2)) {
      state = 3;
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { isOpening: true }));
    } else {
      state = 0;
      currentTag = noCurrentTag;
    }
  }
  function stateTagName(char2) {
    if (whitespaceRe.test(char2)) {
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { name: captureTagName() }));
      state = 4;
    } else if (char2 === "<") {
      startNewTag();
    } else if (char2 === "/") {
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { name: captureTagName() }));
      state = 12;
    } else if (char2 === ">") {
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { name: captureTagName() }));
      emitTagAndPreviousTextNode();
    } else if (!letterRe.test(char2) && !digitRe.test(char2) && char2 !== ":") {
      resetToDataState();
    } else ;
  }
  function stateEndTagOpen(char2) {
    if (char2 === ">") {
      resetToDataState();
    } else if (letterRe.test(char2)) {
      state = 3;
    } else {
      resetToDataState();
    }
  }
  function stateBeforeAttributeName(char2) {
    if (whitespaceRe.test(char2)) ; else if (char2 === "/") {
      state = 12;
    } else if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else if (char2 === "<") {
      startNewTag();
    } else if (char2 === "=" || quoteRe.test(char2) || controlCharsRe.test(char2)) {
      resetToDataState();
    } else {
      state = 5;
    }
  }
  function stateAttributeName(char2) {
    if (whitespaceRe.test(char2)) {
      state = 6;
    } else if (char2 === "/") {
      state = 12;
    } else if (char2 === "=") {
      state = 7;
    } else if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else if (char2 === "<") {
      startNewTag();
    } else if (quoteRe.test(char2)) {
      resetToDataState();
    } else ;
  }
  function stateAfterAttributeName(char2) {
    if (whitespaceRe.test(char2)) ; else if (char2 === "/") {
      state = 12;
    } else if (char2 === "=") {
      state = 7;
    } else if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else if (char2 === "<") {
      startNewTag();
    } else if (quoteRe.test(char2)) {
      resetToDataState();
    } else {
      state = 5;
    }
  }
  function stateBeforeAttributeValue(char2) {
    if (whitespaceRe.test(char2)) ; else if (char2 === '"') {
      state = 8;
    } else if (char2 === "'") {
      state = 9;
    } else if (/[>=`]/.test(char2)) {
      resetToDataState();
    } else if (char2 === "<") {
      startNewTag();
    } else {
      state = 10;
    }
  }
  function stateAttributeValueDoubleQuoted(char2) {
    if (char2 === '"') {
      state = 11;
    }
  }
  function stateAttributeValueSingleQuoted(char2) {
    if (char2 === "'") {
      state = 11;
    }
  }
  function stateAttributeValueUnquoted(char2) {
    if (whitespaceRe.test(char2)) {
      state = 4;
    } else if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else if (char2 === "<") {
      startNewTag();
    } else ;
  }
  function stateAfterAttributeValueQuoted(char2) {
    if (whitespaceRe.test(char2)) {
      state = 4;
    } else if (char2 === "/") {
      state = 12;
    } else if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else if (char2 === "<") {
      startNewTag();
    } else {
      state = 4;
      reconsumeCurrentCharacter();
    }
  }
  function stateSelfClosingStartTag(char2) {
    if (char2 === ">") {
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { isClosing: true }));
      emitTagAndPreviousTextNode();
    } else {
      state = 4;
    }
  }
  function stateMarkupDeclarationOpen(char2) {
    if (html.substr(charIdx, 2) === "--") {
      charIdx += 2;
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { type: "comment" }));
      state = 14;
    } else if (html.substr(charIdx, 7).toUpperCase() === "DOCTYPE") {
      charIdx += 7;
      currentTag = new CurrentTag(__assign(__assign({}, currentTag), { type: "doctype" }));
      state = 20;
    } else {
      resetToDataState();
    }
  }
  function stateCommentStart(char2) {
    if (char2 === "-") {
      state = 15;
    } else if (char2 === ">") {
      resetToDataState();
    } else {
      state = 16;
    }
  }
  function stateCommentStartDash(char2) {
    if (char2 === "-") {
      state = 18;
    } else if (char2 === ">") {
      resetToDataState();
    } else {
      state = 16;
    }
  }
  function stateComment(char2) {
    if (char2 === "-") {
      state = 17;
    }
  }
  function stateCommentEndDash(char2) {
    if (char2 === "-") {
      state = 18;
    } else {
      state = 16;
    }
  }
  function stateCommentEnd(char2) {
    if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else if (char2 === "!") {
      state = 19;
    } else if (char2 === "-") ; else {
      state = 16;
    }
  }
  function stateCommentEndBang(char2) {
    if (char2 === "-") {
      state = 17;
    } else if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else {
      state = 16;
    }
  }
  function stateDoctype(char2) {
    if (char2 === ">") {
      emitTagAndPreviousTextNode();
    } else if (char2 === "<") {
      startNewTag();
    } else ;
  }
  function resetToDataState() {
    state = 0;
    currentTag = noCurrentTag;
  }
  function startNewTag() {
    state = 1;
    currentTag = new CurrentTag({ idx: charIdx });
  }
  function emitTagAndPreviousTextNode() {
    var textBeforeTag = html.slice(currentDataIdx, currentTag.idx);
    if (textBeforeTag) {
      onText(textBeforeTag, currentDataIdx);
    }
    if (currentTag.type === "comment") {
      onComment(currentTag.idx);
    } else if (currentTag.type === "doctype") {
      onDoctype(currentTag.idx);
    } else {
      if (currentTag.isOpening) {
        onOpenTag(currentTag.name, currentTag.idx);
      }
      if (currentTag.isClosing) {
        onCloseTag(currentTag.name, currentTag.idx);
      }
    }
    resetToDataState();
    currentDataIdx = charIdx + 1;
  }
  function emitText() {
    var text3 = html.slice(currentDataIdx, charIdx);
    onText(text3, currentDataIdx);
    currentDataIdx = charIdx + 1;
  }
  function captureTagName() {
    var startIdx = currentTag.idx + (currentTag.isClosing ? 2 : 1);
    return html.slice(startIdx, charIdx).toLowerCase();
  }
  function reconsumeCurrentCharacter() {
    charIdx--;
  }
}
var CurrentTag = (
  /** @class */
  /* @__PURE__ */ (function() {
    function CurrentTag2(cfg) {
      if (cfg === void 0) {
        cfg = {};
      }
      this.idx = cfg.idx !== void 0 ? cfg.idx : -1;
      this.type = cfg.type || "tag";
      this.name = cfg.name || "";
      this.isOpening = !!cfg.isOpening;
      this.isClosing = !!cfg.isClosing;
    }
    return CurrentTag2;
  })()
);

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/autolinker.js
var Autolinker = (
  /** @class */
  (function() {
    function Autolinker2(cfg) {
      if (cfg === void 0) {
        cfg = {};
      }
      this.version = Autolinker2.version;
      this.urls = {};
      this.email = true;
      this.phone = true;
      this.hashtag = false;
      this.mention = false;
      this.newWindow = true;
      this.stripPrefix = {
        scheme: true,
        www: true
      };
      this.stripTrailingSlash = true;
      this.decodePercentEncoding = true;
      this.truncate = {
        length: 0,
        location: "end"
      };
      this.className = "";
      this.replaceFn = null;
      this.context = void 0;
      this.sanitizeHtml = false;
      this.matchers = null;
      this.tagBuilder = null;
      this.urls = this.normalizeUrlsCfg(cfg.urls);
      this.email = typeof cfg.email === "boolean" ? cfg.email : this.email;
      this.phone = typeof cfg.phone === "boolean" ? cfg.phone : this.phone;
      this.hashtag = cfg.hashtag || this.hashtag;
      this.mention = cfg.mention || this.mention;
      this.newWindow = typeof cfg.newWindow === "boolean" ? cfg.newWindow : this.newWindow;
      this.stripPrefix = this.normalizeStripPrefixCfg(cfg.stripPrefix);
      this.stripTrailingSlash = typeof cfg.stripTrailingSlash === "boolean" ? cfg.stripTrailingSlash : this.stripTrailingSlash;
      this.decodePercentEncoding = typeof cfg.decodePercentEncoding === "boolean" ? cfg.decodePercentEncoding : this.decodePercentEncoding;
      this.sanitizeHtml = cfg.sanitizeHtml || false;
      var mention = this.mention;
      if (mention !== false && ["twitter", "instagram", "soundcloud", "tiktok"].indexOf(mention) === -1) {
        throw new Error("invalid `mention` cfg '".concat(mention, "' - see docs"));
      }
      var hashtag = this.hashtag;
      if (hashtag !== false && hashtagServices.indexOf(hashtag) === -1) {
        throw new Error("invalid `hashtag` cfg '".concat(hashtag, "' - see docs"));
      }
      this.truncate = this.normalizeTruncateCfg(cfg.truncate);
      this.className = cfg.className || this.className;
      this.replaceFn = cfg.replaceFn || this.replaceFn;
      this.context = cfg.context || this;
    }
    Autolinker2.link = function(textOrHtml, options) {
      var autolinker = new Autolinker2(options);
      return autolinker.link(textOrHtml);
    };
    Autolinker2.parse = function(textOrHtml, options) {
      var autolinker = new Autolinker2(options);
      return autolinker.parse(textOrHtml);
    };
    Autolinker2.prototype.normalizeUrlsCfg = function(urls) {
      if (urls == null)
        urls = true;
      if (typeof urls === "boolean") {
        return { schemeMatches: urls, wwwMatches: urls, tldMatches: urls };
      } else {
        return {
          schemeMatches: typeof urls.schemeMatches === "boolean" ? urls.schemeMatches : true,
          wwwMatches: typeof urls.wwwMatches === "boolean" ? urls.wwwMatches : true,
          tldMatches: typeof urls.tldMatches === "boolean" ? urls.tldMatches : true
        };
      }
    };
    Autolinker2.prototype.normalizeStripPrefixCfg = function(stripPrefix) {
      if (stripPrefix == null)
        stripPrefix = true;
      if (typeof stripPrefix === "boolean") {
        return { scheme: stripPrefix, www: stripPrefix };
      } else {
        return {
          scheme: typeof stripPrefix.scheme === "boolean" ? stripPrefix.scheme : true,
          www: typeof stripPrefix.www === "boolean" ? stripPrefix.www : true
        };
      }
    };
    Autolinker2.prototype.normalizeTruncateCfg = function(truncate) {
      if (typeof truncate === "number") {
        return { length: truncate, location: "end" };
      } else {
        return defaults(truncate || {}, {
          length: Number.POSITIVE_INFINITY,
          location: "end"
        });
      }
    };
    Autolinker2.prototype.parse = function(textOrHtml) {
      var _this = this;
      var skipTagNames = ["a", "style", "script"], skipTagsStackCount = 0, matches = [];
      parseHtml(textOrHtml, {
        onOpenTag: function(tagName) {
          if (skipTagNames.indexOf(tagName) >= 0) {
            skipTagsStackCount++;
          }
        },
        onText: function(text3, offset) {
          if (skipTagsStackCount === 0) {
            var htmlCharacterEntitiesRegex = /(&nbsp;|&#160;|&lt;|&#60;|&gt;|&#62;|&quot;|&#34;|&#39;)/gi;
            var textSplit = splitAndCapture(text3, htmlCharacterEntitiesRegex);
            var currentOffset_1 = offset;
            textSplit.forEach(function(splitText, i2) {
              if (i2 % 2 === 0) {
                var textNodeMatches = _this.parseText(splitText, currentOffset_1);
                matches.push.apply(matches, textNodeMatches);
              }
              currentOffset_1 += splitText.length;
            });
          }
        },
        onCloseTag: function(tagName) {
          if (skipTagNames.indexOf(tagName) >= 0) {
            skipTagsStackCount = Math.max(skipTagsStackCount - 1, 0);
          }
        },
        onComment: function(offset) {
        },
        onDoctype: function(offset) {
        }
        // no need to process doctype nodes
      });
      matches = this.compactMatches(matches);
      matches = this.removeUnwantedMatches(matches);
      return matches;
    };
    Autolinker2.prototype.compactMatches = function(matches) {
      matches.sort(function(a2, b) {
        return a2.getOffset() - b.getOffset();
      });
      var i2 = 0;
      while (i2 < matches.length - 1) {
        var match = matches[i2], offset = match.getOffset(), matchedTextLength = match.getMatchedText().length, endIdx = offset + matchedTextLength;
        if (i2 + 1 < matches.length) {
          if (matches[i2 + 1].getOffset() === offset) {
            var removeIdx = matches[i2 + 1].getMatchedText().length > matchedTextLength ? i2 : i2 + 1;
            matches.splice(removeIdx, 1);
            continue;
          }
          if (matches[i2 + 1].getOffset() < endIdx) {
            matches.splice(i2 + 1, 1);
            continue;
          }
        }
        i2++;
      }
      return matches;
    };
    Autolinker2.prototype.removeUnwantedMatches = function(matches) {
      if (!this.hashtag)
        remove(matches, function(match) {
          return match.getType() === "hashtag";
        });
      if (!this.email)
        remove(matches, function(match) {
          return match.getType() === "email";
        });
      if (!this.phone)
        remove(matches, function(match) {
          return match.getType() === "phone";
        });
      if (!this.mention)
        remove(matches, function(match) {
          return match.getType() === "mention";
        });
      if (!this.urls.schemeMatches) {
        remove(matches, function(m) {
          return m.getType() === "url" && m.getUrlMatchType() === "scheme";
        });
      }
      if (!this.urls.wwwMatches) {
        remove(matches, function(m) {
          return m.getType() === "url" && m.getUrlMatchType() === "www";
        });
      }
      if (!this.urls.tldMatches) {
        remove(matches, function(m) {
          return m.getType() === "url" && m.getUrlMatchType() === "tld";
        });
      }
      return matches;
    };
    Autolinker2.prototype.parseText = function(text3, offset) {
      if (offset === void 0) {
        offset = 0;
      }
      offset = offset || 0;
      var matchers = this.getMatchers(), matches = [];
      for (var i2 = 0, numMatchers = matchers.length; i2 < numMatchers; i2++) {
        var textMatches = matchers[i2].parseMatches(text3);
        for (var j = 0, numTextMatches = textMatches.length; j < numTextMatches; j++) {
          textMatches[j].setOffset(offset + textMatches[j].getOffset());
        }
        matches.push.apply(matches, textMatches);
      }
      return matches;
    };
    Autolinker2.prototype.link = function(textOrHtml) {
      if (!textOrHtml) {
        return "";
      }
      if (this.sanitizeHtml) {
        textOrHtml = textOrHtml.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
      var matches = this.parse(textOrHtml), newHtml = [], lastIndex = 0;
      for (var i2 = 0, len = matches.length; i2 < len; i2++) {
        var match = matches[i2];
        newHtml.push(textOrHtml.substring(lastIndex, match.getOffset()));
        newHtml.push(this.createMatchReturnVal(match));
        lastIndex = match.getOffset() + match.getMatchedText().length;
      }
      newHtml.push(textOrHtml.substring(lastIndex));
      return newHtml.join("");
    };
    Autolinker2.prototype.createMatchReturnVal = function(match) {
      var replaceFnResult;
      if (this.replaceFn) {
        replaceFnResult = this.replaceFn.call(this.context, match);
      }
      if (typeof replaceFnResult === "string") {
        return replaceFnResult;
      } else if (replaceFnResult === false) {
        return match.getMatchedText();
      } else if (replaceFnResult instanceof HtmlTag) {
        return replaceFnResult.toAnchorString();
      } else {
        var anchorTag = match.buildTag();
        return anchorTag.toAnchorString();
      }
    };
    Autolinker2.prototype.getMatchers = function() {
      if (!this.matchers) {
        var tagBuilder = this.getTagBuilder();
        var matchers = [
          new HashtagMatcher({
            tagBuilder,
            serviceName: this.hashtag
          }),
          new EmailMatcher({ tagBuilder }),
          new PhoneMatcher({ tagBuilder }),
          new MentionMatcher({
            tagBuilder,
            serviceName: this.mention
          }),
          new UrlMatcher({
            tagBuilder,
            stripPrefix: this.stripPrefix,
            stripTrailingSlash: this.stripTrailingSlash,
            decodePercentEncoding: this.decodePercentEncoding
          })
        ];
        return this.matchers = matchers;
      } else {
        return this.matchers;
      }
    };
    Autolinker2.prototype.getTagBuilder = function() {
      var tagBuilder = this.tagBuilder;
      if (!tagBuilder) {
        tagBuilder = this.tagBuilder = new AnchorTagBuilder({
          newWindow: this.newWindow,
          truncate: this.truncate,
          className: this.className
        });
      }
      return tagBuilder;
    };
    Autolinker2.version = version;
    Autolinker2.AnchorTagBuilder = AnchorTagBuilder;
    Autolinker2.HtmlTag = HtmlTag;
    Autolinker2.matcher = {
      Email: EmailMatcher,
      Hashtag: HashtagMatcher,
      Matcher,
      Mention: MentionMatcher,
      Phone: PhoneMatcher,
      Url: UrlMatcher
    };
    Autolinker2.match = {
      Email: EmailMatch,
      Hashtag: HashtagMatch,
      Match,
      Mention: MentionMatch,
      Phone: PhoneMatch,
      Url: UrlMatch
    };
    return Autolinker2;
  })()
);
var autolinker_default = Autolinker;

// ../../node_modules/.pnpm/autolinker@3.16.2/node_modules/autolinker/dist/es2015/index.js
var es2015_default = autolinker_default;

// ../../node_modules/.pnpm/remarkable@2.0.1/node_modules/remarkable/dist/esm/linkify.js
var LINK_SCAN_RE = /www|@|\:\/\//;
function isLinkOpen(str) {
  return /^<a[>\s]/i.test(str);
}
function isLinkClose(str) {
  return /^<\/a\s*>/i.test(str);
}
function createLinkifier() {
  var links2 = [];
  var autolinker = new es2015_default({
    stripPrefix: false,
    url: true,
    email: true,
    replaceFn: function(match) {
      switch (match.getType()) {
        /*eslint default-case:0*/
        case "url":
          links2.push({
            text: match.matchedText,
            url: match.getUrl()
          });
          break;
        case "email":
          links2.push({
            text: match.matchedText,
            // normalize email protocol
            url: "mailto:" + match.getEmail().replace(/^mailto:/i, "")
          });
          break;
      }
      return false;
    }
  });
  return {
    links: links2,
    autolinker
  };
}
function parseTokens(state) {
  var i2, j, l, tokens, token, text3, nodes, ln, pos, level, htmlLinkLevel, blockTokens = state.tokens, linkifier = null, links2, autolinker;
  for (j = 0, l = blockTokens.length; j < l; j++) {
    if (blockTokens[j].type !== "inline") {
      continue;
    }
    tokens = blockTokens[j].children;
    htmlLinkLevel = 0;
    for (i2 = tokens.length - 1; i2 >= 0; i2--) {
      token = tokens[i2];
      if (token.type === "link_close") {
        i2--;
        while (tokens[i2].level !== token.level && tokens[i2].type !== "link_open") {
          i2--;
        }
        continue;
      }
      if (token.type === "htmltag") {
        if (isLinkOpen(token.content) && htmlLinkLevel > 0) {
          htmlLinkLevel--;
        }
        if (isLinkClose(token.content)) {
          htmlLinkLevel++;
        }
      }
      if (htmlLinkLevel > 0) {
        continue;
      }
      if (token.type === "text" && LINK_SCAN_RE.test(token.content)) {
        if (!linkifier) {
          linkifier = createLinkifier();
          links2 = linkifier.links;
          autolinker = linkifier.autolinker;
        }
        text3 = token.content;
        links2.length = 0;
        autolinker.link(text3);
        if (!links2.length) {
          continue;
        }
        nodes = [];
        level = token.level;
        for (ln = 0; ln < links2.length; ln++) {
          if (!state.inline.validateLink(links2[ln].url)) {
            continue;
          }
          pos = text3.indexOf(links2[ln].text);
          if (pos) {
            nodes.push({
              type: "text",
              content: text3.slice(0, pos),
              level
            });
          }
          nodes.push({
            type: "link_open",
            href: links2[ln].url,
            title: "",
            level: level++
          });
          nodes.push({
            type: "text",
            content: links2[ln].text,
            level
          });
          nodes.push({
            type: "link_close",
            level: --level
          });
          text3 = text3.slice(pos + links2[ln].text.length);
        }
        if (text3.length) {
          nodes.push({
            type: "text",
            content: text3,
            level
          });
        }
        blockTokens[j].children = tokens = [].concat(tokens.slice(0, i2), nodes, tokens.slice(i2 + 1));
      }
    }
  }
}
function linkify2(md) {
  md.core.ruler.push("linkify", parseTokens);
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
  }).use(linkify2);
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
  const entities2 = input.match(ENTITY_REGEX);
  const entityPlaceholders = [];
  if (entities2 && forApp) {
    const uniqueEntities = [...new Set(entities2)];
    uniqueEntities.forEach((entity2, index) => {
      const placeholder = `\u200B${index}\u200B`;
      entityPlaceholders.push(entity2);
      input = input.split(entity2).join(placeholder);
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
    entityPlaceholders.forEach((entity2, index) => {
      const placeholder = `\u200B${index}\u200B`;
      output = output.split(placeholder).join(entity2);
    });
  }
  output = output.replace(/ xmlns="http:\/\/www.w3.org\/1999\/xhtml"/g, "").replace(/^<\?xml[^?]*\?>/, "").replace(/^<!DOCTYPE[^>]*>/i, "").replace(/<\/?html[^>]*>/g, "").replace(/<head[^>]*>[\s\S]*?<\/head>/g, "").replace('<body id="root">', "").replace("</body>", "").trim();
  return sanitizeHtml(output);
}

// src/methods/simple-markdown-to-html.method.ts
var mdInstance = null;
function getMd() {
  if (!mdInstance) {
    mdInstance = new Remarkable({
      html: true,
      breaks: true,
      typographer: false
    }).use(linkify2);
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
  const key = `${makeEntryCacheKey(obj)}-md-${forApp ? "app" : "site"}-${parentDomain}${seoContext ? `-seo${seoContext.authorReputation ?? ""}-${seoContext.postPayout ?? ""}` : ""}${renderOptions?.embedVideosDirectly ? "-embed" : ""}${renderOptions?.inertAuthorAndTagChips ? "-inert" : ""}${renderOptions?.externalProfileBase ? "-ext" + renderOptions.externalProfileBase : ""}`;
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

// src/catch-post-image.ts
var gifLinkRegex = /\.(gif)$/i;
function isGifLink(link) {
  return gifLinkRegex.test(link);
}
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
  for (let i2 = openAt + 1; i2 < lower.length; i2++) {
    const c = lower[i2];
    if (c === "\n") return NaN;
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return lower[i2 - 1] === "/" ? NaN : i2;
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
  const block2 = new Uint8Array(lower.length);
  const code2 = new Uint8Array(lower.length);
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
        block2.fill(1, lineStart, lineEnd);
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
      code2.fill(1, lineStart, lineEnd);
    } else if (!inBlock) {
      const m = HTML_BLOCK_LINE_RE.exec(line);
      if (m) {
        const tag = m[1] ?? m[2];
        inBlock = tag === void 0 || HTML_BLOCK_TAGS.has(tag);
      }
    }
    if (inBlock && !blank) block2.fill(1, lineStart, lineEnd);
    lineStart = lineEnd + 1;
  }
  return { block: block2, code: code2 };
}
var blankChars = (s) => s.replace(/[^\n]/g, " ");
function blankMatches(text3, re) {
  return text3.replace(re, blankChars);
}
function blankSpans(input, open, close, tagNames, blockMask) {
  const { text: text3, lower } = input;
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
      to = text3.length;
    } else if (tagNames) {
      const gt = lower.indexOf(">", end + close.length);
      to = gt === -1 ? text3.length : gt + 1;
    } else {
      to = end + close.length;
    }
    const blanked = blankChars(lower.slice(start, to));
    textParts.push(text3.slice(from, start), blanked);
    lowerParts.push(lower.slice(from, start), blanked);
    from = to;
    start = to >= text3.length ? -1 : findOpen(to);
  }
  textParts.push(text3.slice(from));
  lowerParts.push(lower.slice(from));
  return { text: textParts.join(""), lower: lowerParts.join("") };
}
function blankMasked(input, mask) {
  let text3 = "";
  let lower = "";
  let from = 0;
  for (let i2 = 0; i2 < mask.length; i2++) {
    if (!mask[i2]) continue;
    let j = i2;
    while (j < mask.length && mask[j]) j++;
    text3 += input.text.slice(from, i2) + blankChars(input.text.slice(i2, j));
    lower += input.lower.slice(from, i2) + blankChars(input.lower.slice(i2, j));
    from = j;
    i2 = j;
  }
  if (from === 0) return input;
  return { text: text3 + input.text.slice(from), lower: lower + input.lower.slice(from) };
}
function stripHiddenRegions(text3) {
  let spellings = { text: text3, lower: text3.toLowerCase() };
  const { block: blockMask, code: codeMask } = markLines(spellings.lower);
  spellings = blankMasked(spellings, codeMask);
  spellings = blankSpans(spellings, "<!--", "-->", false, null);
  spellings = blankSpans(spellings, "<style", "</style", true, null);
  spellings = blankSpans(spellings, "<pre", "</pre", true, blockMask);
  spellings = blankSpans(spellings, "<code", "</code", true, blockMask);
  return spellings.text;
}
var MD_IMAGE_RE = /!\[[^[\]]*\]\(\s*([^)\s]{1,2048})(?:\s+["'][^"']*["'])?\s*\)/;
var MD_IMAGE_PRESENT_RE = /!\[[^[\]]*\]\(\s*[^\s)]/;
var HTML_IMAGE_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i;
var BARE_IMAGE_RE = /https?:\/\/[^\s<>"'()[\]]+\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)(?:[?#][^\s<>"'()[\]]*)?/gi;
var BARE_YOUTUBE_RE = /https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\/[^\s<>"'()[\]]+/gi;
function isAutolinkAt(text3, idx) {
  return /^https?:\/\//i.test(text3.slice(idx, idx + 8));
}
function markInsideTags(text3) {
  const marks = new Uint8Array(text3.length);
  let inTag = false;
  let quote = "";
  for (let i2 = 0; i2 < text3.length; i2++) {
    const c = text3[i2];
    if (!inTag) {
      if (c === "<" && i2 + 1 < text3.length && /[A-Za-z/!?]/.test(text3[i2 + 1]) && !isAutolinkAt(text3, i2 + 1)) {
        inTag = true;
        marks[i2] = 1;
      }
      continue;
    }
    marks[i2] = 1;
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
  const text3 = scan.text;
  const prev = text3[idx - 1];
  if (/[\w/.:%?&=#[-]/.test(prev)) return false;
  const prev2 = idx > 1 ? text3[idx - 2] : "";
  if (prev === "(" && prev2 === "]") return false;
  return true;
}
function* standaloneMatches(scan, re) {
  for (const m of scan.text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (isStandalone(scan, idx)) yield { url: m[0], pos: idx };
  }
}
function firstStandalone(scan, re) {
  for (const hit of standaloneMatches(scan, re)) return hit;
  return null;
}
var HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
var MD_LINK_RE = /\[([^[\]]*)\]\(\s*([^)\s[]+)(?:\s+["'][^"']*["'])?\s*\)/g;
var SAFE_URL_RE = /^https?:\/\//i;
var IMG_EXT_RE = /\.(?:tiff?|jpe?g|gif|png|svg|ico|heic|webp|arw)/i;
var isImageHref = (href) => SAFE_URL_RE.test(href) && IMG_EXT_RE.test(href);
function findFirstImageUrl(body, includeBareUrls = false) {
  return findFirstImageCandidate(prepareBody(body), includeBareUrls).candidate?.url ?? null;
}
function stripCodeRegions(body) {
  let text3 = blankMatches(body, BACKTICK_FENCE_RE);
  text3 = blankMatches(text3, TILDE_FENCE_RE);
  text3 = blankMatches(text3, INLINE_CODE_RE);
  return stripHiddenRegions(text3);
}
function blankUnequalAnchors(cleaned, textContent) {
  const lower = cleaned.toLowerCase();
  let result = cleaned;
  let at = findTag(lower, "<a", 0, OPEN_TAG_NAME_END);
  while (at !== -1) {
    const gt = findOpenTagEnd(lower, at);
    if (Number.isNaN(gt) || gt === -1) {
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
    let text3;
    if (textContent) {
      text3 = stripHtmlTags(inner);
    } else {
      const firstTag = inner.search(/<[A-Za-z/!]/);
      text3 = firstTag === -1 ? inner : inner.slice(0, firstTag);
    }
    if (!href || decodeEntities(text3.trim()) !== decodeEntities(href.trim())) {
      result = result.slice(0, at) + blankChars(result.slice(at, spanEnd)) + result.slice(spanEnd);
    }
    at = spanEnd >= cleaned.length ? -1 : findTag(lower, "<a", spanEnd, OPEN_TAG_NAME_END);
  }
  return result;
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
  for (const hit of standaloneMatches(prepared.video, BARE_YOUTUBE_RE)) {
    const id = hit.url.match(YOUTUBE_REGEX);
    if (id && id[1]) {
      best = { url: id[1], pos: hit.pos };
      break;
    }
  }
  for (const m of cleaned.matchAll(MD_LINK_RE)) {
    const idx = m.index ?? 0;
    if (idx > 0 && cleaned[idx - 1] === "!") continue;
    if (best && idx >= best.pos) break;
    const href = m[2];
    if (href && m[1].trim() === href) {
      const id = href.match(YOUTUBE_REGEX);
      if (id && id[1]) {
        best = { url: id[1], pos: idx };
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
  if (mdMatch) candidates.push({ url: mdMatch[1], pos: mdMatch.index ?? 0 });
  if (htmlMatch && htmlMatch[1] && SAFE_URL_RE.test(htmlMatch[1])) {
    candidates.push({ url: htmlMatch[1], pos: htmlMatch.index ?? 0 });
  }
  if (includeBareUrls) {
    const bareMatch = firstStandalone(prepared.image, BARE_IMAGE_RE);
    if (bareMatch && SAFE_URL_RE.test(bareMatch.url)) {
      candidates.push(bareMatch);
    }
    const deAmp = (s) => s.trim().replace(/&amp;/g, "&");
    for (const m of cleaned.matchAll(MD_LINK_RE)) {
      const idx = m.index ?? 0;
      if (idx > 0 && cleaned[idx - 1] === "!") continue;
      const href = m[2];
      if (href && isImageHref(href) && deAmp(m[1]) === deAmp(href)) {
        candidates.push({ url: href, pos: idx });
        break;
      }
    }
  }
  if (candidates.length === 0) return NONE;
  candidates.sort((a2, b) => a2.pos - b.pos);
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
function proxifyFound(src, width, height, format) {
  const decoded = decodeEntities(src);
  if (isGifLink(decoded)) {
    return proxifyImageSrc(decoded, 0, 0, format);
  }
  return proxifyImageSrc(decoded, width, height, format);
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
    const decodedThumbnail = decodeEntities(thumbnail);
    const proxied = isGifLink(decodedThumbnail) ? proxifyImageSrc(decodedThumbnail, 0, 0, format) : proxifyImageSrc(decodedThumbnail, width, height, format);
    if (proxied) {
      return proxied;
    }
  }
  if (meta && typeof meta.image === "string" && meta.image.length > 0) {
    const decodedImage = decodeEntities(meta.image);
    if (isGifLink(decodedImage)) {
      return proxifyImageSrc(decodedImage, 0, 0, format);
    }
    return proxifyImageSrc(decodedImage, width, height, format);
  }
  if (meta && meta.image && !!meta.image.length && meta.image[0]) {
    if (typeof meta.image[0] === "string") {
      const decodedImage = decodeEntities(meta.image[0]);
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
  const item = cacheGet(key);
  if (item !== void 0) {
    return item;
  }
  const res = getImage(obj, width, height, format, fastMode);
  cacheSet(key, res);
  return res;
}

// src/post-body-summary.ts
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
    for (let i2 = 0; i2 < arr.length; i2++) {
      if (result) {
        result += " ";
      }
      if (result.length > limit) {
        break;
      } else {
        if ((result + arr[i2]).length < limit + 10) {
          result += arr[i2];
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
  const entities2 = entryBody.match(ENTITY_REGEX);
  const entityPlaceholders = [];
  if (entities2 && platform !== "web") {
    const uniqueEntities = [...new Set(entities2)];
    uniqueEntities.forEach((entity2, index) => {
      const placeholder = `\u200B${index}\u200B`;
      entityPlaceholders.push(entity2);
      entryBody = entryBody.split(entity2).join(placeholder);
    });
  }
  let text3 = "";
  try {
    text3 = summaryRenderer.render(entryBody);
  } catch (err) {
    console.error("[postBodySummary] Failed to render markdown:", {
      error: err instanceof Error ? err.message : String(err),
      entryBodyLength: entryBody?.length || 0,
      platform
    });
    text3 = "";
  }
  if (platform !== "web" && entityPlaceholders.length > 0) {
    entityPlaceholders.forEach((entity2, index) => {
      const placeholder = `\u200B${index}\u200B`;
      text3 = text3.split(placeholder).join(entity2);
    });
  }
  text3 = stripHtmlTags(text3).replace(/\r?\n|\r/g, " ").replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim().replace(/ {2,}/g, " ");
  if (length > 0) {
    text3 = joint(text3.split(" "), length);
  }
  if (text3) {
    text3 = decodeEntities(text3);
  }
  return text3;
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