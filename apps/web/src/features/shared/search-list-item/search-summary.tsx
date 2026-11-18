import { ReactNode } from "react";
import { postBodyTextSafely } from "@/core/entries/post-body-text-safely";
import { transformMarkedContent } from "@/utils/transform-marked-content";

/**
 * A search result's summary: the server's highlighted text (HTML with <mark>)
 * when it sent one, else the post's summary text, shown as text. The summary
 * is never parsed as HTML: `a<b` would lose what follows the `<`, and a tag
 * written in a post must not become an element.
 */
export function searchSummary(bodyMarked: string | undefined | null, body: string): ReactNode {
  return bodyMarked ? transformMarkedContent(bodyMarked) : postBodyTextSafely(body, 200);
}
