import { decodeImageSrc, trimTrailingSlash } from '../helper'
import { getProxyBase, proxifyImageSrc } from '../proxify-image-src'

/**
 * An author's `<video poster>` loads like an image, so it goes through the
 * image proxy like an `<img>` src: readers never fetch it from the author's
 * host (#1919). A poster the proxy refuses is dropped, and the sanitizer drops
 * any poster that is still off the proxy (the sanitize-only fallback path).
 */
export function video(el: HTMLElement): void {
  const poster = el.getAttribute('poster')
  if (poster === null) {
    return
  }
  const decoded = decodeImageSrc(poster)
  if (decoded.startsWith(`${trimTrailingSlash(getProxyBase())}/`)) {
    return
  }
  const proxied = /^https?:\/\//i.test(decoded)
    ? proxifyImageSrc(decoded, 0, 0, 'match', { forceProxy: true })
    : ''
  if (proxied) {
    el.setAttribute('poster', proxied)
  } else {
    el.removeAttribute('poster')
  }
}
