/**
 * Length the way the desk counts it.
 *
 * Both backends measure a limit in Unicode code points: Python's `len()` on the
 * desk, `EnumerateRunes()` at the gateway. JavaScript's `String.length` counts
 * UTF-16 code units, so every emoji measures two and a 200 emoji answer the desk
 * accepts is cut in half before it is sent. `maxLength` on an input has the same
 * problem, which is why these two replace it rather than sit beside it.
 */
export function textLength(value: string): number {
  return [...value].length;
}

/** The value truncated to `max` code points, so typing stops where the desk would. */
export function clampText(value: string, max: number): string {
  const points = [...value];
  return points.length <= max ? value : points.slice(0, max).join("");
}

/**
 * The value capped where the desk caps it. Both backends TRIM before they measure,
 * so clamping the raw value spends the budget on whitespace: a leading space and
 * 500 characters became 499 the server would have taken. A value that fits once
 * trimmed is returned untouched, spaces and all.
 */
export function clampTrimmed(value: string, max: number): string {
  const trimmed = value.trim();
  return textLength(trimmed) <= max ? value : clampText(trimmed, max);
}
