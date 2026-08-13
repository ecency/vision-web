// @ts-ignore
import { strikethrough, tables } from "@joplin/turndown-plugin-gfm";
import Turndown from "turndown";

import { TEXT_COLOR_CLASS_PREFIX } from "@/app/publish/_constants/text-colors";

/** Total <td>/<th> in a table, used to spot the single-cell case GFM cannot express. */
function countTableCells(node: Node): number {
  const el = node as HTMLElement;
  return typeof el.querySelectorAll === "function" ? el.querySelectorAll("th, td").length : 0;
}

const CENTERED_TEXT_RULE_NODES = ["P", "H1", "H2", "H3", "H4", "H5", "H6"];
const CENTERED_TEXT_ALIGNMENTS = new Set(["center", "right", "left", "justify"]);

function extractTextAlignValue(styles: string | null): string | undefined {
  if (!styles) {
    return undefined;
  }

  return styles
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(":");

      if (separatorIndex === -1) {
        return undefined;
      }

      const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
      const value = declaration.slice(separatorIndex + 1).trim();

      if (property === "text-align" && value) {
        return value.replace(/!important$/i, "").trim().toLowerCase();
      }

      return undefined;
    })
    .find((value): value is string => !!value);
}

export function markdownToHtml(html: string | undefined) {
  if (!html) {
    return "";
  }

  // Strip TipTap mention/tag nodes to plain text before Turndown processes HTML.
  // Turndown normally strips inline spans, but custom rules using outerHTML (e.g. tables)
  // would preserve the raw <span data-type="mention"> markup in the output.
  html = html.replace(/<span[^>]*data-type="mention"[^>]*>([^<]*)<\/span>/gi, "$1");
  html = html.replace(/<span[^>]*data-type="tag"[^>]*>([^<]*)<\/span>/gi, "$1");

  // TipTap renders tables as <table><colgroup>…</colgroup><tbody>…, with the
  // header cells as <th> in the first <tbody> row rather than in a <thead>.
  // The GFM table rule only accepts a <tbody> whose previous sibling is absent
  // or an empty <thead>, so the <colgroup> makes it miss the heading row and
  // emit an empty one above the real headers. Dropping <colgroup> (it carries
  // only editor column widths, which markdown cannot express anyway) restores
  // the check without touching the plugin.
  html = html.replace(/<colgroup[\s\S]*?<\/colgroup>/gi, "");

  return new Turndown({
    codeBlockStyle: "fenced"
  })
    .addRule("centeredText", {
      filter: function (node) {
        const styles = node.getAttribute("style");
        const align = extractTextAlignValue(styles) || node.getAttribute("data-align");

        return (
          CENTERED_TEXT_RULE_NODES.includes(node.nodeName) &&
          !!align &&
          CENTERED_TEXT_ALIGNMENTS.has(align)
        );
      },
      replacement: function (_, node) {
        const element = node as HTMLElement;
        const styles = element.getAttribute("style");
        const align = extractTextAlignValue(styles) || element.getAttribute("data-align") || "auto";

        const child = element.firstElementChild as HTMLElement | null;
        const onlyImage =
          element.childNodes.length === 1 &&
          child &&
          (child.tagName === "IMG" ||
            (child.tagName === "A" &&
              child.childNodes.length === 1 &&
              (child.firstElementChild as HTMLElement | null)?.tagName === "IMG"));

        if (onlyImage && child) {
          const content = child.outerHTML;

          if (align === "center") {
            return `<center>${content}</center>`;
          }

          if (align === "right") {
            return `<div class="pull-right">${content}</div>`;
          }

          if (align === "left") {
            return `<div class="pull-left">${content}</div>`;
          }

          return content;
        }

        element.setAttribute("data-align", align);
        element.removeAttribute("dir");
        return element.outerHTML;
      }
    })
    .addRule("textColor", {
      filter: function (node) {
        if (node.nodeName !== "SPAN") {
          return false;
        }

        const element = node as HTMLElement;
        const classList = Array.from(element.classList ?? []);
        const hasColorClass = classList.some((className) =>
          className.startsWith(TEXT_COLOR_CLASS_PREFIX)
        );

        return !!element.style.color || hasColorClass;
      },
      replacement: function (_, node) {
        const element = node as HTMLElement;
        const color = element.style.color;
        const clone = element.cloneNode(true) as HTMLElement;
        const colorClass = Array.from(element.classList ?? []).find((className) =>
          className.startsWith(TEXT_COLOR_CLASS_PREFIX)
        );

        if (color) {
          clone.setAttribute("style", `color: ${color}`);
        } else {
          const classColorValue = colorClass?.slice(TEXT_COLOR_CLASS_PREFIX.length);
          if (classColorValue) {
            clone.setAttribute("style", `color: #${classColorValue}`);
          } else {
            clone.removeAttribute("style");
          }
        }

        if (colorClass) {
          clone.classList.add(colorClass);
        }

        return clone.outerHTML;
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
        const src = element.getAttribute("src") ?? "";
        const alt = element.getAttribute("alt") ?? "";
        const cls = element.getAttribute("class");
        const attrs = [
          `src="${src}"`,
          `alt="${alt}"`,
          cls ? `class="${cls}"` : undefined
        ].filter(Boolean);
        const imgHtml = `<img ${attrs.join(" ")} />`;

        if (cls === "pull-left" || cls === "pull-right") {
          return `<div class="${cls}">${imgHtml}</div>`;
        }

        return imgHtml;
      }
    })
    .use(strikethrough)
    // Turndown has no built-in table rule. Without this the editor's
    // HTML -> markdown pass drops every <table> and leaves the cell text
    // stacked as loose paragraphs, so a pasted or inserted table is
    // destroyed on the next serialization.
    .use(tables)
    // Added AFTER the plugin so it takes precedence (Turndown checks the most
    // recently added rule first). The GFM rule deliberately skips single-cell
    // tables, treating them as layout markup, but the editor can produce one
    // from the toolbar: insert a table, then deleteColumn and deleteRow. Such a
    // table serialized to bare cell text, or to nothing at all when the cell was
    // empty, so it disappeared on the next draft load or publish. GFM cannot
    // express a headerless single-cell table, so keep it as HTML, which the
    // renderer accepts and the sanitizer allows.
    .addRule("singleCellTable", {
      filter: (node) => node.nodeName === "TABLE" && countTableCells(node) <= 1,
      replacement: (_content, node) => `\n\n${(node as HTMLElement).outerHTML}\n\n`
    })
    .turndown(html);
}
