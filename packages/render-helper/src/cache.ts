import { LRUCache } from 'lru-cache'

// A single feed page calls catchPostImage 3× per entry (blur 0×0, grid, row)
// plus postBodySummary, so 20 entries already produce ~80 keys. The previous
// max of 60 caused constant eviction and forced re-rendering of full markdown
// during SSR fan-out.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cache = new LRUCache<string, any>({ max: 500 })

export function setCacheSize(size: number): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cache = new LRUCache<string, any>({ max: size })
}

export function cacheGet<T extends unknown>(key: string): T {
  return cache.get(key) as T
}

export function cacheSet(key: string, value: unknown): void {
  cache.set(key, value)
}

// An entry memo slot keeps the inputs its value was computed from, and a lookup
// is a hit only when they are the same ones. The key carries a cheap digest of
// the body to spread entries over slots, but a digest can collide, and an
// author who crafted a body colliding with the takedown notice would otherwise
// keep serving the original after the takedown. The body is stored by
// reference (the entry already holds that string), and the comparison is O(1)
// for the same string instance.
interface EntryMemo {
  body: unknown
  meta: unknown
  value: unknown
}

export const MEMO_MISS: unique symbol = Symbol('memo-miss')

export function entryMemoGet<T>(key: string, body: unknown, meta?: unknown): T | typeof MEMO_MISS {
  const slot = cache.get(key) as EntryMemo | undefined
  if (slot === undefined || slot.body !== body || slot.meta !== meta) {
    return MEMO_MISS
  }
  return slot.value as T
}

export function entryMemoSet(key: string, body: unknown, meta: unknown, value: unknown): void {
  cache.set(key, { body, meta, value })
}
