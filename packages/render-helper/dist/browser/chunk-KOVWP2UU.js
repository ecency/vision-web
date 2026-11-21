import { getProxyBase, proxifyImageSrc } from './chunk-LT2KELO7.js';
import { decodeDomImageSrc, trimTrailingSlash } from './chunk-6SZO54KO.js';

// src/methods/video.method.ts
function video(el) {
  const poster = el.getAttribute("poster");
  if (poster === null) {
    return;
  }
  const decoded = decodeDomImageSrc(poster);
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
//# sourceMappingURL=chunk-KOVWP2UU.js.map
//# sourceMappingURL=chunk-KOVWP2UU.js.map