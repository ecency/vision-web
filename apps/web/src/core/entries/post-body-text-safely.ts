import { getPostBodyText } from "@ecency/render-helper";
import { reportRenderHelperFailureOnce } from "./report-render-helper-failure";

/**
 * Summary text without the markdown renderer (getPostBodyText, #2113), for
 * feed cards, their slimmed rows and the list items that run in the browser:
 * both sides of hydration compute the same text and the card bundle leaves the
 * renderer out. Server-only text (page metadata, structured data, RSS) keeps
 * postBodySummarySafely and the exact rendered text.
 */
export function postBodyTextSafely(...args: Parameters<typeof getPostBodyText>): string {
  try {
    return getPostBodyText(...args) ?? "";
  } catch (e) {
    reportRenderHelperFailureOnce("getPostBodyText", args[0], e);
    return "";
  }
}
