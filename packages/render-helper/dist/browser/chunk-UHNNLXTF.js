import { isInternalThumbnail } from './chunk-NQZM6AV2.js';
import { authorPixelSize } from './chunk-LUI6MD5L.js';
import { getProxyBase, proxifyImageSrc, buildSrcSet, buildPictureSources } from './chunk-LT2KELO7.js';
import { decodeDomImageSrc, trimTrailingSlash } from './chunk-QVFPA3RG.js';

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
function img(el, state, forApp = true, renderOptions) {
  const src = el.getAttribute("src") || "";
  const decodedSrc = decodeDomImageSrc(src);
  const reserved = renderOptions?.preserveImageDimensions ? authorPixelSize(el.getAttribute("width"), el.getAttribute("height")) : null;
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
  if (reserved) {
    el.setAttribute("width", reserved.width);
    el.setAttribute("height", reserved.height);
  }
  el.setAttribute("itemprop", "image");
  const avatarRoute = new RegExp(`^${trimTrailingSlash(getProxyBase()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/u/[^/]+/avatar(?:/[a-z]+)?$`);
  const classTokens = (el.getAttribute("class") || "").split(/\s+/);
  const isAvatar = avatarRoute.test(decodedSrc) || classTokens.includes("er-author-link-image");
  if (isAvatar) {
    el.setAttribute("loading", "lazy");
    el.setAttribute("decoding", "async");
  }
  const imageIndex = !state || isAvatar ? 3 : state.imageCount ?? (state.firstImageFound ? 1 : 0);
  if (state && !isAvatar) {
    state.imageCount = imageIndex + 1;
    state.firstImageFound = true;
  }
  if (isAvatar) ; else if (imageIndex === 0) {
    el.setAttribute("loading", "eager");
    el.setAttribute("fetchpriority", "high");
  } else if (imageIndex === 1) {
    el.setAttribute("loading", "eager");
    el.setAttribute("decoding", "async");
  } else {
    el.setAttribute("loading", "lazy");
    el.setAttribute("decoding", "async");
  }
  if (isAvatar || imageIndex !== 0) {
    el.removeAttribute("fetchpriority");
  }
  const shouldReplace = !isInternalThumbnail(el);
  const base = trimTrailingSlash(getProxyBase());
  const hasAlreadyProxied = src.startsWith(`${base}/p/`) || src.startsWith(`${base}/u/`) || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d+x\\d+/`).test(src);
  if (shouldReplace && !hasAlreadyProxied) {
    const proxified = proxifyImageSrc(decodedSrc, 0, 0, "match", { forceProxy: true });
    if (proxified) {
      el.setAttribute("src", proxified);
      const srcset2 = buildSrcSet(decodedSrc);
      if (srcset2) {
        el.setAttribute("srcset", srcset2);
        el.setAttribute("sizes", IMAGE_SIZES);
      }
      if (!forApp) {
        wrapInPicture(el, decodedSrc);
      }
    } else if (/^https?:\/\//i.test(decodedSrc)) {
      el.removeAttribute("src");
      el.removeAttribute("srcset");
      el.removeAttribute("sizes");
    }
  } else if (shouldReplace && hasAlreadyProxied) {
    if (src.startsWith(`${base}/p/`)) {
      const srcset2 = buildSrcSet(src);
      if (srcset2) {
        el.setAttribute("srcset", srcset2);
        el.setAttribute("sizes", IMAGE_SIZES);
      }
    }
  }
  const srcset = shouldReplace ? el.getAttribute("srcset") : null;
  if (srcset && srcset.split(",").some((c) => !c.trim().startsWith(`${base}/`))) {
    el.removeAttribute("srcset");
    el.removeAttribute("sizes");
  }
}
var quoteAttr = (value) => value.replace(/"/g, "&quot;");
function createImageHTML(src, isLCP, forApp = true) {
  const decoded = decodeDomImageSrc(src);
  const proxified = proxifyImageSrc(decoded, 0, 0, "match", { forceProxy: true });
  if (!proxified) return "";
  const base = trimTrailingSlash(getProxyBase());
  const isAlreadyProxied = decoded.startsWith(`${base}/u/`) || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d+x\\d+/`).test(decoded);
  const srcset = isAlreadyProxied ? "" : buildSrcSet(decoded);
  const loading = isLCP ? "eager" : "lazy";
  const fetch = isLCP ? 'fetchpriority="high"' : 'decoding="async"';
  const srcsetAttr = srcset ? `srcset="${quoteAttr(srcset)}" sizes="${IMAGE_SIZES}"` : "";
  const imgTag = `<img
    class="markdown-img-link"
    src="${quoteAttr(proxified)}"
    ${srcsetAttr}
    loading="${loading}"
    ${fetch}
    itemprop="image"
  />`;
  if (!forApp) {
    const sources = buildPictureSources(decoded);
    if (sources) {
      return `<picture><source type="image/avif" srcset="${quoteAttr(sources.avif)}" sizes="${IMAGE_SIZES}" /><source type="image/webp" srcset="${quoteAttr(sources.webp)}" sizes="${IMAGE_SIZES}" />${imgTag}</picture>`;
    }
  }
  return imgTag;
}

export { IMAGE_SIZES, createImageHTML, img };
//# sourceMappingURL=chunk-UHNNLXTF.js.map
//# sourceMappingURL=chunk-UHNNLXTF.js.map