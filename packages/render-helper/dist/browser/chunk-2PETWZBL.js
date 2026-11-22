import { sanitizeHtml } from './chunk-EPV2SMEM.js';
import { linearLinkify } from './chunk-2NIW25TO.js';
import { withoutLoneSurrogates } from './chunk-EHL62ZCR.js';
import { Remarkable } from 'remarkable';
import { linkify } from 'remarkable/linkify';

var mdInstance = null;
function getMd() {
  if (!mdInstance) {
    mdInstance = new Remarkable({
      html: true,
      breaks: true,
      typographer: false
    }).use(linkify).use(linearLinkify);
  }
  return mdInstance;
}
function simpleMarkdownToHTML(input) {
  if (!input) return "";
  const html = getMd().render(withoutLoneSurrogates(input));
  return sanitizeHtml(html);
}

export { simpleMarkdownToHTML };
//# sourceMappingURL=chunk-2PETWZBL.js.map
//# sourceMappingURL=chunk-2PETWZBL.js.map