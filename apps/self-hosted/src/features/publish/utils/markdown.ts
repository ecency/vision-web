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
 * Rebuilding an image from wrapper text turns inert markdown into a live
 * attribute, so the URL is parsed and re-serialised rather than copied through:
 * without this, `<center>![x](javascript:...)</center>` would produce an
 * executable src. Only absolute http(s) URLs are accepted, which is what Hive
 * image markdown carries.
 */
function toSafeImageSrc(candidate: string): string | null {
  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

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

type AttributeCheck = (value: string, element: Element) => boolean;

const anyValue: AttributeCheck = () => true;
const isInteger: AttributeCheck = (value) => /^\d+$/.test(value.trim());
const isAlignment: AttributeCheck = (value) =>
  ALIGNMENT_VALUES.has(value.trim().toLowerCase());

/** Only `language-x` survives: Tiptap rebuilds the class from the language. */
const isLanguageClass = (value: string): boolean =>
  /^language-[\w+#.-]+$/.test(value.trim());

function everyDeclaration(
  style: string,
  predicate: (property: string, value: string) => boolean
): boolean {
  const declarations = style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean);

  return (
    declarations.length > 0 &&
    declarations.every((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator === -1) return false;

      return predicate(
        declaration.slice(0, separator).trim().toLowerCase(),
        declaration
          .slice(separator + 1)
          .replace(/!important$/i, "")
          .trim()
          .toLowerCase()
      );
    })
  );
}

/**
 * The schema keeps text-align and nothing else, so a style carrying any other
 * property (a colour, a font) would lose it silently.
 */
const isAlignmentStyle: AttributeCheck = (value) =>
  everyDeclaration(
    value,
    (property, declared) =>
      property === "text-align" && ALIGNMENT_VALUES.has(declared)
  );

/**
 * Only the table style Tiptap emits itself round-trips. The extension always
 * re-serialises min-width from its own cellMinWidth, so any other width is
 * silently rewritten: a table carrying min-width:100px would come back as
 * 25px. Matching the exact emitted value keeps that table on the markdown
 * path, and a future cellMinWidth change fails safe the same way.
 */
const TIPTAP_TABLE_STYLE = "min-width:25px";
const isTableStyle: AttributeCheck = (value) =>
  value.replace(/\s+/g, "").replace(/;$/, "").toLowerCase() === TIPTAP_TABLE_STYLE;

/**
 * A language class only survives on the <code> inside a <pre>, which is what
 * the code block node rebuilds. On an inline <code> the mark carries no
 * attributes, so the class is dropped.
 */
const isCodeBlockLanguage: AttributeCheck = (value, element) =>
  element.parentElement?.tagName === "PRE" && isLanguageClass(value);

/**
 * Sanitising runs after this inspection, so URLs are checked here instead.
 * A scheme the sanitiser would reject (hive:, javascript:) means the link or
 * image would come back stripped, which is exactly the silent loss to avoid.
 */
const isSafeHref: AttributeCheck = (value) =>
  /^(https?:\/\/|mailto:|\/|#|\.{0,2}\/)/i.test(value.trim());
const isSafeSrc: AttributeCheck = (value) =>
  /^(https?:\/\/|\/)/i.test(value.trim());

const ALIGNABLE_ATTRIBUTES: Record<string, AttributeCheck> = {
  style: isAlignmentStyle,
  "data-align": isAlignment
};

/**
 * Attributes the schema round-trips, per tag, and what each may contain.
 * Checking only the name is not enough: `style` is preserved for alignment but
 * discards a colour, and `class` is preserved for a code language but not for
 * an arbitrary class. Tags absent from this map round-trip only bare.
 */
const SUPPORTED_ATTRIBUTES: Record<string, Record<string, AttributeCheck>> = {
  A: { href: isSafeHref },
  CODE: { class: isCodeBlockLanguage },
  H1: ALIGNABLE_ATTRIBUTES,
  H2: ALIGNABLE_ATTRIBUTES,
  H3: ALIGNABLE_ATTRIBUTES,
  H4: ALIGNABLE_ATTRIBUTES,
  H5: ALIGNABLE_ATTRIBUTES,
  H6: ALIGNABLE_ATTRIBUTES,
  IMG: { src: isSafeSrc, alt: anyValue, title: anyValue },
  OL: { start: isInteger },
  P: ALIGNABLE_ATTRIBUTES,
  TABLE: { style: isTableStyle },
  TD: { colspan: isInteger, rowspan: isInteger },
  TH: { colspan: isInteger, rowspan: isInteger }
};

interface ParsedMarkdown {
  html: string;
  /** True when the conversion could not be represented without losing content. */
  lossy: boolean;
}

/**
 * True when the document holds anything the editor schema would flatten.
 *
 * This runs on the document as parsed from marked's output, BEFORE sanitising.
 * Inspecting the sanitised document instead would miss everything DOMPurify
 * removes on our behalf: an unknown element such as <foo> is unwrapped to its
 * text, <meta>/<link>/<base> are dropped, and comments disappear, all of which
 * would then look like ordinary content and be classified as safe.
 */
function containsUnsupportedMarkup(doc: Document): boolean {
  // The parser hoists <meta>, <link>, <base> and <title> out of the body.
  if (doc.head.children.length > 0) return true;

  const comments = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  if (comments.nextNode()) return true;

  for (const element of Array.from(doc.body.querySelectorAll("*"))) {
    if (!SUPPORTED_TAGS.has(element.tagName)) return true;
    if (element.tagName === "A" && !element.getAttribute("href")) return true;

    const allowed = SUPPORTED_ATTRIBUTES[element.tagName];
    for (const attribute of Array.from(element.attributes)) {
      const check = allowed?.[attribute.name];
      if (!check || !check(attribute.value, element)) return true;
    }
  }

  return false;
}

function restoreAlignmentFromDataAttribute(doc: Document): void {
  for (const element of Array.from(doc.body.querySelectorAll("[data-align]"))) {
    const align = element.getAttribute("data-align");
    if (!align || !ALIGNMENT_VALUES.has(align)) continue;

    const style = element.getAttribute("style") ?? "";
    if (!extractTextAlign(style)) {
      element.setAttribute(
        "style",
        `${style ? `${style.replace(/;\s*$/, "")}; ` : ""}text-align: ${align}`
      );
    }
  }
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
        const source = match && toSafeImageSrc(match[2]);
        if (!match || !source) {
          lossy = true;
          continue;
        }

        const image = doc.createElement("img");
        image.setAttribute("src", source);
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

  // Parsed with DOMParser, which produces an inert document: scripts do not
  // run and resources are not fetched, so the unsanitised markup is safe to
  // inspect. Sanitising happens at the end, on the way to the editor.
  const doc = new DOMParser().parseFromString(parsed, "text/html");

  // Wrappers first: a <center> that becomes an aligned paragraph must not then
  // be reported as an unsupported tag.
  const wrappersLossy = normalizeAlignmentWrappers(doc);
  restoreAlignmentFromDataAttribute(doc);

  return {
    html: DOMPurify.sanitize(doc.body.innerHTML),
    lossy: wrappersLossy || containsUnsupportedMarkup(doc)
  };
}

/**
 * True when loading `markdown` into the rich text editor would lose content.
 * Callers fall back to plain markdown editing rather than rewrite the post.
 */
export function hasUnsupportedMarkup(markdown: string | undefined): boolean {
  if (!markdown) return false;

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
