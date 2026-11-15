import { RENDER_HELPER_DATA_ATTRIBUTES, stripMarkdownClasses } from '../consts'

/**
 * Removes render-helper's own link markers from author-written markup before
 * the DOM transforms run (#1919): `markdown-*` class tokens and the `data-*`
 * attributes the transforms set. Clients read those to route taps (post cards,
 * mentions, tags, click-to-play embeds), so an author must not be able to
 * forge them. The transforms add their own afterwards, so render-helper's
 * output is unchanged.
 */
export function stripAuthorMarkers(doc: Document): void {
  const elements = doc.getElementsByTagName('*')
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    const names: string[] = []
    for (let j = 0; j < el.attributes.length; j++) {
      names.push(el.attributes[j].name)
    }
    for (const name of names) {
      const lower = name.toLowerCase()
      if (RENDER_HELPER_DATA_ATTRIBUTES.has(lower)) {
        el.removeAttribute(name)
      } else if (lower === 'class') {
        const value = el.getAttribute(name) || ''
        const kept = stripMarkdownClasses(value)
        if (kept === value) continue
        if (kept) {
          el.setAttribute(name, kept)
        } else {
          el.removeAttribute(name)
        }
      }
    }
  }
}
