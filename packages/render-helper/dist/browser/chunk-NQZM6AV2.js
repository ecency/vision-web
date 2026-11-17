// src/methods/internal-thumbnail.ts
var internalThumbnails = /* @__PURE__ */ new WeakSet();
function markInternalThumbnail(el) {
  internalThumbnails.add(el);
}
function isInternalThumbnail(el) {
  return internalThumbnails.has(el);
}

export { isInternalThumbnail, markInternalThumbnail };
//# sourceMappingURL=chunk-NQZM6AV2.js.map
//# sourceMappingURL=chunk-NQZM6AV2.js.map