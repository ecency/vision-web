function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merge of the served config over the build-time defaults.
 *
 * The served config used to replace the build-time one wholesale, so a document
 * that omits a nested section (hand edited, or written against an older schema)
 * left those paths undefined. applyConfig dereferences several of them before
 * React renders, which turned a partial config into a permanently blank page.
 *
 * Arrays and scalars from the served config win outright; only objects are
 * merged, so an array such as postsFilters is replaced rather than combined
 * with the default.
 */
export function mergeConfig<T>(base: T, override: T): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(value)
      ? mergeConfig(merged[key], value)
      : value;
  }

  return merged as T;
}
