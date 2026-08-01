/** The shape of a ProseMirror node this needs, kept structural so it is testable
 *  without constructing a real document. */
interface NodeBeforeLike {
  isText: boolean;
  text?: string | null;
  type: { name: string };
}

/**
 * Whether a dictated segment needs a leading space.
 *
 * Not `doc.textBetween(from - 1, from)`: that renders non-text leaves as an empty
 * string, so an inline image directly before the cursor looked identical to the start
 * of a block and the transcript was concatenated straight onto it.
 *
 * `nodeBefore` distinguishes the four cases that actually differ.
 */
export function dictationSeparator(nodeBefore: NodeBeforeLike | null | undefined): string {
  // Start of the block: nothing to separate from.
  if (!nodeBefore) {
    return "";
  }

  // Text: only if it does not already end in whitespace.
  if (nodeBefore.isText) {
    return /\s$/.test(nodeBefore.text ?? "") ? "" : " ";
  }

  // A line break already separates.
  if (nodeBefore.type.name === "hardBreak") {
    return "";
  }

  // Any other inline atom -- image, mention, emoji -- is content, and running text
  // straight onto it is exactly the bug this exists to prevent.
  return " ";
}
