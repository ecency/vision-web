import { sanitizeHtml } from './chunk-G7VRZ5W6.js';
import { withoutLoneSurrogates } from './chunk-6SZO54KO.js';
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
  const html = getMd().render(withoutLoneSurrogates(input));
  return sanitizeHtml(html);
}

export { simpleMarkdownToHTML };
//# sourceMappingURL=chunk-3YR5PCVI.js.map
//# sourceMappingURL=chunk-3YR5PCVI.js.map