/**
 * Video thumbnails render-helper builds itself. Their src is already proxied,
 * so img() leaves it as is. Tracked by element rather than by class: the
 * sanitizer lets an author set any class on <img>, so a class marker would let
 * author markup skip the image proxy (#1999). The class stays on the element
 * for styling only.
 */
const internalThumbnails = new WeakSet<object>()

export function markInternalThumbnail(el: HTMLElement): void {
  internalThumbnails.add(el)
}

export function isInternalThumbnail(el: HTMLElement): boolean {
  return internalThumbnails.has(el)
}
