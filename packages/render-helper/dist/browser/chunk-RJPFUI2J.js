import { sanitizeHtml } from './chunk-OPUVENT7.js';
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
//# sourceMappingURL=chunk-RJPFUI2J.js.map
//# sourceMappingURL=chunk-RJPFUI2J.js.map