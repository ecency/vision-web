import type { ConfigPrimitive } from './types';

/** Shown when the text in the box is not a JSON array at all. */
export const INVALID_ARRAY_MESSAGE = 'Invalid JSON array';

/**
 * Shown when the list holds anything but a plain value.
 *
 * The hosting API rejects an array element that is null or an object, and a
 * rejected value is dropped behind a 200 OK, so the owner has no way to tell
 * the setting never changed.
 */
export const NON_PRIMITIVE_ARRAY_MESSAGE =
  'A list can only contain text, numbers or true and false.';

export interface ArrayDraftResult {
  /** The array to apply, or null when the draft must not be applied. */
  value: ConfigPrimitive[] | null;
  /** What to tell the owner, or null when the draft is fine. */
  error: string | null;
}

/** `Not a valid option: "hivesign". Choose from: keychain, hivesigner, hiveauth.` */
function unknownEntriesMessage(
  unknown: readonly unknown[],
  allowedValues: readonly string[],
): string {
  const listed = unknown.map((entry) => JSON.stringify(entry)).join(', ');
  return `Not a valid option: ${listed}. Choose from: ${allowedValues.join(', ')}.`;
}

/**
 * Check the entries of a list field, returning a message or null when fine.
 *
 * `allowedValues` turns a free-text list into a checked set: an entry outside it
 * is a name nothing in the app reads, so it is accepted by the config and then
 * does nothing. Rejecting it here is the only point where the owner can still
 * see what they typed.
 */
export function validateArrayEntries(
  entries: readonly unknown[],
  allowedValues?: readonly string[],
): string | null {
  if (entries.some((entry) => entry === null || typeof entry === 'object')) {
    return NON_PRIMITIVE_ARRAY_MESSAGE;
  }

  if (!allowedValues) return null;

  const unknown = entries.filter(
    (entry) => typeof entry !== 'string' || !allowedValues.includes(entry),
  );
  return unknown.length > 0
    ? unknownEntriesMessage(unknown, allowedValues)
    : null;
}

/**
 * Parse and check what the owner typed into a list field.
 *
 * `value` is non-null only when there is no error, so an invalid draft is never
 * written into the config: it stays in the box, with the reason under it, until
 * it is fixed.
 */
export function validateArrayDraft(
  draft: string,
  allowedValues?: readonly string[],
): ArrayDraftResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft);
  } catch {
    return { value: null, error: INVALID_ARRAY_MESSAGE };
  }

  if (!Array.isArray(parsed)) {
    return { value: null, error: INVALID_ARRAY_MESSAGE };
  }

  const error = validateArrayEntries(parsed, allowedValues);
  return error ? { value: null, error } : { value: parsed, error: null };
}
