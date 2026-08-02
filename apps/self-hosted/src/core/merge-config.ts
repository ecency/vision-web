function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merge of the served config over a structural skeleton.
 *
 * The served config used to replace the fallback wholesale, so a document that
 * omits a nested section (hand edited, or written against an older schema) left
 * those paths undefined. applyConfig dereferences several of them before React
 * renders, which turned a partial config into a permanently blank page.
 *
 * The base is a shape with no values in it, so the merge can only ever restore
 * structure. It must never be given a populated config: whatever the served
 * document omitted would then silently become that tenant's content.
 *
 * Arrays and scalars from the served config win outright; only objects are
 * merged, so an array such as postsFilters is replaced rather than combined.
 */
export function mergeConfig<T>(base: T, override: T): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    // JSON.parse produces __proto__ as an own enumerable key, and assigning it
    // would invoke the inherited setter and replace this section's prototype.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    // null means "not provided", not "erase the shape". Letting it through
    // would overwrite the structure this merge exists to guarantee and
    // reproduce the crash it prevents. The hosting API's own sanitiser takes
    // the same position, for the same reason.
    if (value === null) continue;

    // Type agreement, matching mergeConfigGuarded in the hosting API: a value
    // of the wrong shape cannot stand in for a section. Letting a scalar
    // replace an object would restore the exact failure the skeleton exists to
    // prevent, because applyConfig's try/catch only protects the boot path
    // while components go on dereferencing configuration.general.* during
    // render, which lands the whole blog in the root error boundary.
    const current = merged[key];
    if (isPlainObject(current) && !isPlainObject(value)) {
      console.warn('[Config] Ignoring type-mismatched value for key:', key);
      continue;
    }
    if (Array.isArray(current) && !Array.isArray(value)) {
      console.warn('[Config] Ignoring type-mismatched value for key:', key);
      continue;
    }

    merged[key] = isPlainObject(value) ? mergeConfig(current, value) : value;
  }

  return merged as T;
}
