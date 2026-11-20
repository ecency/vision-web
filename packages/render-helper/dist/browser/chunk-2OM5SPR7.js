import { lookupPostImage } from './chunk-6ZI6JXEI.js';
import { createDoc } from './chunk-4JMAJI4T.js';
import { markdown2Html } from './chunk-66OZL65Z.js';

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
//# sourceMappingURL=chunk-2OM5SPR7.js.map
//# sourceMappingURL=chunk-2OM5SPR7.js.map