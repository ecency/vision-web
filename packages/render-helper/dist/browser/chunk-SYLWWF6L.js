import { getProxyBase, proxifyImageSrc } from './chunk-LT2KELO7.js';
import { trimTrailingSlash } from './chunk-OEOVNYVL.js';

// src/methods/video.method.ts
function video(el) {
  const poster = el.getAttribute("poster");
  if (poster === null) {
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(poster).trim();
  } catch {
    decoded = poster.trim();
  }
  if (decoded.startsWith(`${trimTrailingSlash(getProxyBase())}/`)) {
    return;
  }
  const proxied = /^https?:\/\//i.test(decoded) ? proxifyImageSrc(decoded, 0, 0, "match", { forceProxy: true }) : "";
  if (proxied) {
    el.setAttribute("poster", proxied);
  } else {
    el.removeAttribute("poster");
  }
}

export { video };
//# sourceMappingURL=chunk-SYLWWF6L.js.map
//# sourceMappingURL=chunk-SYLWWF6L.js.map