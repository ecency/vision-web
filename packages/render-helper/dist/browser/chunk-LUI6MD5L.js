// src/methods/image-dimensions.ts
var MAX_IMAGE_DIMENSION_PX = 8192;
var MAX_IMAGE_DIMENSION_RATIO = 40;
function parsePixelDimension(value) {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (n < 1 || n > MAX_IMAGE_DIMENSION_PX) return null;
  return n;
}
function authorPixelSize(width, height) {
  const w = parsePixelDimension(width);
  const h = parsePixelDimension(height);
  if (w == null || h == null) return null;
  const larger = Math.max(w, h);
  const smaller = Math.min(w, h);
  if (larger / smaller > MAX_IMAGE_DIMENSION_RATIO) return null;
  return { width: String(w), height: String(h) };
}

export { MAX_IMAGE_DIMENSION_PX, MAX_IMAGE_DIMENSION_RATIO, authorPixelSize, parsePixelDimension };
//# sourceMappingURL=chunk-LUI6MD5L.js.map
//# sourceMappingURL=chunk-LUI6MD5L.js.map