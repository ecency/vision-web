import { markdown2Html } from './markdown-2-html'
import { createDoc } from './create-doc'
import { Entry } from './types'
import { lookupPostImage } from './card-image'

export { getEntryCardImageRawUrl, getEntryImageRawUrl, getEntryCardImage } from './card-image'

/** The first <img> src of the full render, catchPostImage's last tier. */
function firstRenderedImageSrc(obj: Entry | string): string | null {
  const doc = createDoc(markdown2Html(obj as Entry))
  if (!doc) {
    return null
  }
  const imgEls = doc.getElementsByTagName('img')
  return imgEls.length >= 1 ? imgEls[0].getAttribute('src') || null : null
}

export interface CatchPostImageOptions {
  /**
   * Stop after the metadata and regex tiers. The last tier is a full
   * markdown2Html + DOM parse, which on a long body with no image at all costs
   * hundreds of milliseconds of synchronous CPU; a feed of such rows can hold a
   * server's event loop for seconds. Callers that can live without the rare
   * markdown-only finds (video embed posters, for instance) set this and get
   * null back instead. Default false keeps every existing caller byte-identical.
   * A browser bundle that only needs this should import getEntryCardImage,
   * which leaves the markdown renderer out (#2113).
   */
  fast?: boolean
}

export function catchPostImage(
  obj: Entry | string,
  width = 0,
  height = 0,
  format = 'match',
  options: CatchPostImageOptions = {}
): string | null {
  return lookupPostImage(obj, width, height, format, options.fast === true ? null : firstRenderedImageSrc)
}
