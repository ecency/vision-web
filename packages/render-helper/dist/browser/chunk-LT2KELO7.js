import querystring from 'querystring';
import { LRUCache } from 'lru-cache';

// src/proxify-image-src.ts
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
function setProxyBase(p) {
  proxyBase = p;
}
function getProxyBase() {
  return proxyBase;
}
var PROXY_P_PREFIXES = () => [`${proxyBase}/p/`, "https://images.ecency.com/p/"];
function extractPHash(url) {
  const prefix = PROXY_P_PREFIXES().find((p) => url.startsWith(p));
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
  return isPictureEligible(rawUrl, true);
}
function isPictureEligible(rawUrl, mayUnwrapLegacy) {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (mayUnwrapLegacy && isLegacySizedProxyUrl(rawUrl)) {
    const nested = extractLegacySizedSource(rawUrl);
    return nested !== null && isPictureEligible(nested, false);
  }
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

export { buildPictureSources, buildSrcSet, buildSrcSetForFormat, extractPHash, getLatestUrl, getProxyBase, isLegacySizedProxyUrl, isPictureEligibleRawUrl, isValidUrl, proxifyImageSrc, setProxyBase };
//# sourceMappingURL=chunk-LT2KELO7.js.map
//# sourceMappingURL=chunk-LT2KELO7.js.map