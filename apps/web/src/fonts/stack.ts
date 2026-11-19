/**
 * One CSS font stack from per-subset faces. Each subset is its own family
 * with its unicode-range, as the Google CSS declared them, so the browser
 * downloads only the subsets a page uses.
 *
 * Order matters where Google's subset ranges overlap (\u0131, \u0153, \u0491 and
 * others). Google declares latin last and, inside one family, the last face
 * wins; in a family list the FIRST family wins. So `faces` is given latin
 * first, in reverse of Google's declaration order, to resolve every character
 * to the same file as before. The size-adjusted fallback (declared in
 * fallbacks.css with next/font/google's metrics) goes last: ahead of a
 * subset it would cover that subset's glyphs and the webfont would never load.
 */
export function fontStack(faces: { style: { fontFamily: string } }[], fallbackFamily: string) {
  const family = (f: { style: { fontFamily: string } }) => f.style.fontFamily.split(",")[0].trim();
  return [...faces.map(family), `"${fallbackFamily}"`].join(", ");
}
