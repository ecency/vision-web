import { sanitizeHtml } from './chunk-6TIHYBTO.js';
import { Remarkable } from 'remarkable';
import { linkify } from 'remarkable/linkify';

var mdInstance = null;
function getMd() {
  if (!mdInstance) {
    mdInstance = new Remarkable({
      html: true,
      breaks: true,
      typographer: false
    }).use(linkify);
  }
  return mdInstance;
}
function simpleMarkdownToHTML(input) {
  if (!input) return "";
  const html = getMd().render(input);
  return sanitizeHtml(html);
}

export { simpleMarkdownToHTML };
//# sourceMappingURL=chunk-2O3Z3S44.js.map
//# sourceMappingURL=chunk-2O3Z3S44.js.map