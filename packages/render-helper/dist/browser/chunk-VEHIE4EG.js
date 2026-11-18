import { sanitizeHtml } from './chunk-O2PEXDUT.js';
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
//# sourceMappingURL=chunk-VEHIE4EG.js.map
//# sourceMappingURL=chunk-VEHIE4EG.js.map