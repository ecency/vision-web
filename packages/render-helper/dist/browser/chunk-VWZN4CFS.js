import { lookupPostImage } from './chunk-SUBNIG5L.js';
import { createDoc } from './chunk-RTLMD7GV.js';
import { markdown2Html } from './chunk-AFTHCOLP.js';

// src/catch-post-image.ts
function firstRenderedImageSrc(obj) {
  const doc = createDoc(markdown2Html(obj));
  if (!doc) {
    return null;
  }
  const imgEls = doc.getElementsByTagName("img");
  return imgEls.length >= 1 ? imgEls[0].getAttribute("src") || null : null;
}
function catchPostImage(obj, width = 0, height = 0, format = "match", options = {}) {
  return lookupPostImage(obj, width, height, format, options.fast === true ? null : firstRenderedImageSrc);
}

export { catchPostImage };
//# sourceMappingURL=chunk-VWZN4CFS.js.map
//# sourceMappingURL=chunk-VWZN4CFS.js.map