/**
 * Opens a URL in a new tab with no link back to this one.
 *
 * A bare `window.open(url, "_blank")` creates the new tab as an auxiliary of
 * this page: it keeps `window.opener` pointing back here, and the browser may
 * seed it with a copy of our origin's sessionStorage. Anchors with
 * target="_blank" have implied noopener for years, `window.open` never has.
 *
 * noreferrer as well, since no destination opened this way needs to know which
 * page sent it, and our own URLs (editor, drafts) can carry identifiers.
 *
 * With noopener `window.open` returns null, so there is no handle to return. A
 * caller that genuinely needs the window (to focus it, write to it, poll
 * `.closed` or detect a blocked popup) calls `window.open` itself and says why
 * next to the lint suppression.
 */
export function openInNewTab(url: string): void {
  // eslint-disable-next-line no-restricted-syntax -- the sanctioned call, see above
  window.open(url, "_blank", "noopener,noreferrer");
}
