import { isInternalThumbnail } from './chunk-NQZM6AV2.js';
import { authorPixelSize } from './chunk-LUI6MD5L.js';
import { getProxyBase, buildSrcSet, proxifyImageSrc, buildPictureSources } from './chunk-6323QD2U.js';
import { decodeDomImageSrc, trimTrailingSlash } from './chunk-EHL62ZCR.js';

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
  if (shouldReplace) {
    const sources = bodyImageSources(src);
    if (sources) {
      if (sources.src !== src) el.setAttribute("src", sources.src);
      if (sources.srcSet) {
        el.setAttribute("srcset", sources.srcSet);
        el.setAttribute("sizes", IMAGE_SIZES);
      }
      if (!forApp && !sources.kept) {
        wrapInPicture(el, decodedSrc);
      }
    } else if (/^https?:\/\//i.test(decodedSrc)) {
      el.removeAttribute("src");
      el.removeAttribute("srcset");
      el.removeAttribute("sizes");
    }
  }
  const srcset = shouldReplace ? el.getAttribute("srcset") : null;
  if (srcset && srcset.split(",").some((c) => !c.trim().startsWith(`${base}/`))) {
    el.removeAttribute("srcset");
    el.removeAttribute("sizes");
  }
}
function bodyImageSources(src) {
  const base = trimTrailingSlash(getProxyBase());
  const written = src.trim();
  const kept = written.startsWith(`${base}/p/`) || written.startsWith(`${base}/u/`) || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\d+x\\d+/`).test(written);
  if (kept) return { src: written, srcSet: written.startsWith(`${base}/p/`) ? buildSrcSet(written) : "", kept };
  const decoded = decodeDomImageSrc(src);
  const proxified = proxifyImageSrc(decoded, 0, 0, "match", { forceProxy: true });
  if (!proxified) return null;
  return { src: proxified, srcSet: buildSrcSet(proxified.startsWith(`${base}/p/`) ? proxified : decoded), kept };
}
var quoteAttr = (value) => value.replace(/"/g, "&quot;");
function createImageHTML(src, isLCP, forApp = true) {
  const decoded = decodeDomImageSrc(src);
  const sources = bodyImageSources(src);
  if (!sources) return "";
  const proxified = sources.src;
  const srcset = sources.srcSet;
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
    const sources2 = buildPictureSources(decoded);
    if (sources2) {
      return `<picture><source type="image/avif" srcset="${quoteAttr(sources2.avif)}" sizes="${IMAGE_SIZES}" /><source type="image/webp" srcset="${quoteAttr(sources2.webp)}" sizes="${IMAGE_SIZES}" />${imgTag}</picture>`;
    }
  }
  return imgTag;
}

export { IMAGE_SIZES, bodyImageSources, createImageHTML, img };
//# sourceMappingURL=chunk-TIHPKFVC.js.map
//# sourceMappingURL=chunk-TIHPKFVC.js.map