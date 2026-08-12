/**
 * XML 1.0 forbids C0 control characters (beyond tab, LF, CR), U+FFFE/FFFF
 * and lone surrogate halves outright. The C1 controls (U+007F-9F ranges)
 * and the U+FDD0-FDEF non-characters are Char-valid but sit on the spec's
 * own discouraged list (XML 1.0 5e, section 2.2) and are flagged by the
 * W3C feed validator; neither kind carries content, so both sets go. One
 * chain-authored post carrying a stray \u000B must not make a tenant's
 * entire feed or sitemap unparsable, so invalid code points are REMOVED
 * before entity escaping. HTML meta snippets go through the same path;
 * control characters are junk there too.
 */
const INVALID_XML_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u0084\u0086-\u009F\uFDD0-\uFDEF\uFFFE\uFFFF]/g;
const LONE_SURROGATES =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Escape a string for safe interpolation into HTML/XML text and attributes. */
export function escapeHtml(value: string): string {
  return value
    .replace(LONE_SURROGATES, '')
    .replace(INVALID_XML_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
