// @ts-ignore
import { strikethrough } from "@joplin/turndown-plugin-gfm";
import Turndown from "turndown";

import { TEXT_COLOR_CLASS_PREFIX } from "@/app/publish/_constants/text-colors";

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

/**
 * Content that must keep its paragraph wrapper inside a cell.
 *
 * Block tags are obvious. `img` is here because `.markdown-view p img` sets
 * `display: inline-block` to keep images aligned with surrounding text; an
 * image promoted to a bare cell child loses that and can break a line like
 * "before <img> after" across rows.
 */
const CELL_WRAPPER_REQUIRED =
  "p, ul, ol, li, blockquote, table, pre, h1, h2, h3, h4, h5, h6, div, img";

/**
 * Strips markup from a table that carries no information.
 *
 * Post size is charged directly: the chain prices a comment mostly on
 * `history_bytes`, which is the serialized transaction size, so wrapper bytes
 * are a real cost to the author. TipTap writes `colspan="1" rowspan="1"` on
 * every cell whether or not the cell spans anything, and wraps every cell's
 * content in a paragraph. On a 75-row table that was ~29KB of the ~44KB the
 * two tables occupied, and it contributed to a post being rejected for
 * insufficient RC.
 *
 * Nothing here changes what renders. Spans of 1 are the default, and a lone
 * unstyled paragraph in a cell displays identically to its own contents.
 */
function slimTableMarkup(table: HTMLElement) {
  (Array.from(table.querySelectorAll("th, td")) as HTMLElement[]).forEach((cell) => {
    if (cell.getAttribute("colspan") === "1") {
      cell.removeAttribute("colspan");
    }
    if (cell.getAttribute("rowspan") === "1") {
      cell.removeAttribute("rowspan");
    }

    // Unwrap <td><p>text</p></td> only when that paragraph IS the cell: no
    // sibling nodes, no attributes worth keeping (alignment lives on the
    // paragraph), and nothing inside that depends on the paragraph to render
    // correctly. Cells that keep their paragraph are untouched.
    const [child] = Array.from(cell.children) as HTMLElement[];
    if (
      cell.childNodes.length === 1 &&
      child &&
      child.tagName === "P" &&
      child.attributes.length === 0 &&
      !child.querySelector(CELL_WRAPPER_REQUIRED)
    ) {
      cell.innerHTML = child.innerHTML;
    }
  });
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
        const table = node as HTMLElement;
        table.querySelector("colgroup")?.remove();
        slimTableMarkup(table);

        return table.outerHTML;
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
    .turndown(html);
}
