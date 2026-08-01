import Turndown from "turndown";
import { marked } from "marked";
import DOMPurify from "dompurify";

const ALIGNMENT_BLOCK_NODES = ["P", "H1", "H2", "H3", "H4", "H5", "H6"];
const ALIGNMENT_VALUES = new Set(["center", "right", "left", "justify"]);

/**
 * Hive wraps aligned content in <center> / <div class="pull-left|pull-right">.
 * Tiptap's schema has no node for either, so loading a post that uses them drops
 * the wrapper and the alignment is lost on the next save.
 *
 * A wrapper is only converted to an aligned paragraph when its content is
 * exactly one image, because that is precisely what the outbound "alignment"
 * rule below can turn back into the original wrapper. Anything else is reported
 * as lossy so the post is edited as raw markdown instead of being rewritten.
 */
const ALIGNMENT_WRAPPERS: { selector: string; align: string }[] = [
  { selector: "center", align: "center" },
  { selector: "div.pull-left", align: "left" },
  { selector: "div.pull-right", align: "right" }
];

const IMAGE_MARKDOWN = /^!\[([^\]]*)\]\(\s*(\S+?)\s*\)$/;

/**
 * Tags the editor schema can represent. Anything else is unwrapped by Tiptap,
 * which silently flattens the post, so its presence routes the post to the raw
 * markdown editor instead.
 *
 * This is an allowlist on purpose. The set of markup Hive authors reach for is
 * open ended (details, figure, abbr, kbd, input, sub, sup, span, ...), so a
 * denylist of known-bad tags is never finished.
 */
const SUPPORTED_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "COL", "COLGROUP", "DEL", "EM",
  "H1", "H2", "H3", "H4", "H5", "H6", "HR", "I", "IMG", "LI", "OL", "P",
  "PRE", "S", "STRONG", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "UL"
]);

/**
 * Markup the sanitiser deletes outright. These leave no node behind, so the
 * document walk below cannot see them and the source has to be checked instead.
 * HTML comments are included: DOMPurify strips them, so an edit would drop them
 * from the post.
 */
const SANITIZER_REMOVED = /<\s*(iframe|script|object|embed|style|form)\b|<!--/i;

interface ParsedMarkdown {
  html: string;
  /** True when the conversion could not be represented without losing content. */
  lossy: boolean;
}

/**
 * True when the document holds anything the editor schema would flatten.
 * Covers raw HTML the author wrote, markup marked generated (task list
 * checkboxes become <input>), and links whose scheme DOMPurify rejected:
 * those keep the anchor but lose the href, so they would save as plain text.
 * Checking the parsed document rather than the markdown source means reference
 * links and raw HTML anchors are caught the same way inline links are.
 */
function containsUnsupportedMarkup(doc: Document): boolean {
  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    if (!SUPPORTED_TAGS.has(element.tagName)) return true;
    if (element.tagName === "A" && !element.getAttribute("href")) return true;
  }

  return false;
}

function holdsOnlyImage(element: Element): boolean {
  if (element.children.length !== 1) return false;
  if (element.textContent?.trim()) return false;

  const child = element.children[0];
  if (child.tagName === "IMG") return true;

  return (
    child.tagName === "A" &&
    child.children.length === 1 &&
    child.children[0].tagName === "IMG"
  );
}

function normalizeAlignmentWrappers(doc: Document): boolean {
  let lossy = false;

  for (const { selector, align } of ALIGNMENT_WRAPPERS) {
    for (const element of Array.from(doc.body.querySelectorAll(selector))) {
      if (element.children.length === 0) {
        // <center>![alt](src)</center>: marked leaves the image markdown as text
        // because the wrapper is a raw HTML block. Only a wrapper that is wholly
        // one image can be rebuilt; a caption or a second image alongside it
        // would end up as literal "![" text in the saved body.
        const match = IMAGE_MARKDOWN.exec(element.textContent?.trim() ?? "");
        if (!match) {
          lossy = true;
          continue;
        }

        const image = doc.createElement("img");
        image.setAttribute("src", match[2]);
        if (match[1]) image.setAttribute("alt", match[1]);
        element.replaceChildren(image);
      } else if (!holdsOnlyImage(element)) {
        lossy = true;
        continue;
      }

      const paragraph = doc.createElement("p");
      paragraph.setAttribute("style", `text-align: ${align}`);
      while (element.firstChild) {
        paragraph.appendChild(element.firstChild);
      }
      element.replaceWith(paragraph);
    }
  }

  return lossy;
}

function parseMarkdown(markdown: string): ParsedMarkdown {
  // breaks: true matches how @ecency/render-helper renders stored posts, so a
  // single newline stays a line break instead of collapsing into the paragraph.
  const parsed = marked.parse(markdown, { async: false, breaks: true }) as string;
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(parsed),
    "text/html"
  );

  // Run the wrappers first: a <center> that becomes an aligned paragraph must
  // not then be reported as an unsupported tag.
  const wrappersLossy = normalizeAlignmentWrappers(doc);

  return {
    html: doc.body.innerHTML,
    lossy: wrappersLossy || containsUnsupportedMarkup(doc)
  };
}

/**
 * True when loading `markdown` into the rich text editor would lose content.
 * Callers fall back to plain markdown editing rather than rewrite the post.
 */
export function hasUnsupportedMarkup(markdown: string | undefined): boolean {
  if (!markdown) return false;

  if (SANITIZER_REMOVED.test(markdown)) return true;

  try {
    return parseMarkdown(markdown).lossy;
  } catch {
    // Unparseable content is never worth risking the rich editor on.
    return true;
  }
}

/**
 * Escapes alt text for the `![alt](src)` form. The backslash has to be escaped
 * first: escaping only the brackets turns an alt ending in a backslash into
 * "\\]", which escapes the closing bracket and breaks the whole image.
 */
function escapeMarkdownText(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

/** Escapes the optional `"title"` part of an image, same reasoning. */
function escapeMarkdownTitle(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function extractTextAlign(style: string | null): string | undefined {
  if (!style) return undefined;
  return style
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((decl) => {
      const i = decl.indexOf(":");
      if (i === -1) return undefined;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (prop === "text-align" && val) return val.replace(/!important$/i, "").trim().toLowerCase();
      return undefined;
    })
    .find((v): v is string => !!v);
}

/**
 * Converts HTML from Tiptap editor to Markdown for publishing (preserves alignment as HTML)
 */
export function htmlToMarkdown(html: string | undefined): string {
  if (!html) {
    return "";
  }

  return new Turndown({
    codeBlockStyle: "fenced",
    headingStyle: "atx",
    // Turndown defaults to two trailing spaces before the newline; Hive renders
    // a bare newline as a break, so the padding is only noise in the stored body.
    br: ""
  })
    .addRule("alignment", {
      filter: function (node) {
        const style = node.getAttribute("style");
        const align = extractTextAlign(style);
        return (
          ALIGNMENT_BLOCK_NODES.includes(node.nodeName) &&
          !!align &&
          ALIGNMENT_VALUES.has(align)
        );
      },
      replacement: function (_, node) {
        const el = node as HTMLElement;
        const style = el.getAttribute("style");
        const align = extractTextAlign(style) ?? "left";
        const child = el.firstElementChild as HTMLElement | null;
        const onlyImage =
          el.childNodes.length === 1 &&
          child &&
          (child.tagName === "IMG" ||
            (child.tagName === "A" &&
              child.childNodes.length === 1 &&
              (child.firstElementChild as HTMLElement | null)?.tagName === "IMG"));
        if (onlyImage && child) {
          const content = child.outerHTML;
          if (align === "center") return `<center>${content}</center>`;
          if (align === "right") return `<div class="pull-right">${content}</div>`;
          if (align === "left") return `<div class="pull-left">${content}</div>`;
          return content;
        }
        el.setAttribute("data-align", align);
        el.removeAttribute("dir");
        return DOMPurify.sanitize(el.outerHTML);
      }
    })
    .addRule("table", {
      filter: function (node) {
        return node.nodeName === "TABLE";
      },
      replacement: function (_, node) {
        const colgroup = (node as HTMLElement).querySelector("colgroup");
        colgroup?.remove();
        return (node as HTMLElement).outerHTML;
      }
    })
    .addRule("image", {
      filter: "img",
      replacement: function (_, node) {
        const element = node as HTMLElement;
        const src = (element.getAttribute("src") ?? "").replace(/[()]/g, encodeURIComponent);
        const alt = escapeMarkdownText(element.getAttribute("alt") ?? "");
        const title = element.getAttribute("title");
        return title
          ? `![${alt}](${src} "${escapeMarkdownTitle(title)}")`
          : `![${alt}](${src})`;
      }
    })
    .addRule("autolink", {
      // marked's GFM autolinking turns a bare URL into an anchor before Tiptap
      // sees it. Without this rule every plain "https://..." in the post would
      // be rewritten as "[https://...](https://...)" on the first edit.
      filter: (node) => {
        if (node.nodeName !== "A") return false;

        const href = node.getAttribute("href");
        const text = node.textContent;
        if (!href || !text) return false;

        // marked normalises bare autolinks, so the href does not always equal
        // the text: "me@example.com" gains a mailto: prefix and
        // "www.example.com" gains http://.
        return (
          href === text ||
          href === `mailto:${text}` ||
          href === `http://${text}`
        );
      },
      replacement: (content) => content
    })
    .addRule("strikethrough", {
      // Turndown core has no strikethrough rule, so StarterKit's Strike mark
      // would be unwrapped to plain text and "~~$100~~ $80" would save as
      // "$100 $80", inverting the meaning.
      filter: ["del", "s"],
      replacement: (content) => `~~${content}~~`
    })
    .turndown(html);
}

/**
 * Converts Markdown to HTML for loading into Tiptap editor
 */
export function markdownToHtml(markdown: string | undefined): string {
  if (!markdown) {
    return "";
  }

  try {
    return parseMarkdown(markdown).html;
  } catch (error) {
    console.error("Failed to parse markdown:", error);
    return "";
  }
}
