import { TextStyle } from "@tiptap/extension-text-style";
import {
  TEXT_COLOR_CLASS_PREFIX,
  getTextColorClassName,
  getTextColorFromClassName,
  normalizeTextColor
} from "../_constants/text-colors";

function hasTextColorClass(element: HTMLElement): boolean {
  return (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .some((className) => getTextColorFromClassName(className) !== null);
}

// mergeNestedSpanStyles defaults to true in TipTap 3 and false in TipTap 2.
// Kept false so pasted nested spans parse exactly as before.
export const PublishTextStyle = TextStyle.extend({
  parseHTML() {
    return [
      ...(this.parent?.() ?? []),
      // A saved draft keeps the colour class but the sanitiser strips the
      // style, and TextStyle itself only parses spans that carry a style.
      {
        tag: "span",
        consuming: false,
        getAttrs: (element) =>
          !element.hasAttribute("style") && hasTextColorClass(element) ? {} : false
      }
    ];
  },
  addAttributes() {
    const parentAttributes = (this.parent?.() ?? {}) as Record<string, unknown>;
    const parentColor = (parentAttributes.color ?? {}) as Record<string, unknown>;

    return {
      ...parentAttributes,
      color: {
        ...parentColor,
        parseHTML: (element) => {
          const classAttribute = element.getAttribute("class");

          if (classAttribute) {
            const classes = classAttribute
              .split(/\s+/)
              .map((className) => className.trim())
              .filter(Boolean);

            for (const className of classes) {
              const parsed = getTextColorFromClassName(className);

              if (parsed) {
                return parsed;
              }
            }
          }

          const inlineColor = element.style.color || element.getAttribute("color");

          const normalizedInlineColor = normalizeTextColor(inlineColor);
          if (normalizedInlineColor) {
            return normalizedInlineColor;
          }

          const parentParseHTML =
            typeof (parentColor as { parseHTML?: unknown }).parseHTML === "function"
              ? (parentColor as { parseHTML: (element: HTMLElement) => unknown }).parseHTML
              : null;

          if (parentParseHTML) {
            const parsed = parentParseHTML(element);

            if (typeof parsed === "string") {
              const normalized = normalizeTextColor(parsed);

              if (normalized) {
                return normalized;
              }
            }
          }

          return null;
        },
        renderHTML: (attributes) => {
          const {
            color,
            class: className,
            style,
            ...otherAttributes
          } = (attributes ?? {}) as Record<string, string | undefined>;

          const normalizedColor = normalizeTextColor(color);

          const classNames = new Set<string>();

          if (className) {
            className
              .split(/\s+/)
              .map((item) => item.trim())
              .filter(Boolean)
              .forEach((item) => {
                if (!item.startsWith(TEXT_COLOR_CLASS_PREFIX)) {
                  classNames.add(item);
                }
              });
          }

          if (normalizedColor) {
            classNames.add(getTextColorClassName(normalizedColor));
          }

          const renderedAttributes: Record<string, string> = {};

          Object.entries(otherAttributes ?? {}).forEach(([key, value]) => {
            if (typeof value === "string" && value.length > 0) {
              renderedAttributes[key] = value;
            }
          });

          if (typeof style === "string" && style.length > 0) {
            renderedAttributes.style = style;
          }

          if (classNames.size > 0) {
            renderedAttributes.class = Array.from(classNames).join(" ");
          }

          return renderedAttributes;
        }
      }
    };
  }
}).configure({ mergeNestedSpanStyles: false });
