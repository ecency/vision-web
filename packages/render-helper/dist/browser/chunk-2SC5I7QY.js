import { LRUCache } from 'lru-cache';

// src/cache.ts
var cache = new LRUCache({ max: 500 });
function setCacheSize(size) {
  cache = new LRUCache({ max: size });
}
function cacheGet(key) {
  return cache.get(key);
}
function cacheSet(key, value) {
  cache.set(key, value);
}
var MEMO_MISS = /* @__PURE__ */ Symbol("memo-miss");
function entryMemoGet(key, body, meta) {
  const slot = cache.get(key);
  if (slot === void 0 || slot.body !== body || slot.meta !== meta) {
    return MEMO_MISS;
  }
  return slot.value;
}
function entryMemoSet(key, body, meta, value) {
  cache.set(key, { body, meta, value });
}

export { MEMO_MISS, cacheGet, cacheSet, entryMemoGet, entryMemoSet, setCacheSize };
//# sourceMappingURL=chunk-2SC5I7QY.js.map
//# sourceMappingURL=chunk-2SC5I7QY.js.map