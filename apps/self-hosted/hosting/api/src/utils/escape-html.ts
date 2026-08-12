/**
 * XML 1.0 forbids most control characters and non-characters outright, and
 * lone surrogate halves are invalid in any well-formed document. One
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
