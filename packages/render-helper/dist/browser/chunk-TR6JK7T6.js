import { lookupPostImage } from './chunk-UU7WU3PI.js';
import { createDoc } from './chunk-OU4P2ED6.js';
import { markdown2Html } from './chunk-7BBSYAFH.js';

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
//# sourceMappingURL=chunk-TR6JK7T6.js.map
//# sourceMappingURL=chunk-TR6JK7T6.js.map