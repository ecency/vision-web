/**
 * The link enhancers swap nodes React does not own: the body is set through
 * dangerouslySetInnerHTML. Their cleanup has to put the original nodes back,
 * or a re-run on the same DOM (Strict Mode, an effect re-run, the entry page
 * opening and closing Edit History) finds nothing to enhance and leaves an
 * empty wrapper whose root was unmounted (#2083).
 */

/** Puts `replacement` where `original` is and returns how to put `original` back. */
export function swapIn(original: HTMLElement, replacement: HTMLElement): () => void {
  original.parentElement?.replaceChild(replacement, original);
  return () => {
    replacement.parentNode?.replaceChild(original, replacement);
    delete original.dataset.enhanced;
  };
}

/** Replaces the children of `host` with `child` and returns how to restore them. */
export function fillWith(host: HTMLElement, child: HTMLElement): () => void {
  const previous = Array.from(host.childNodes);
  host.replaceChildren(child);
  return () => {
    host.replaceChildren(...previous);
    delete host.dataset.enhanced;
  };
}

export function runUndos(undos: (() => void)[]): void {
  for (const undo of undos.reverse()) {
    try {
      undo();
    } catch (error) {
      console.warn("Failed to restore an enhanced post element:", error);
    }
  }
  undos.length = 0;
}
