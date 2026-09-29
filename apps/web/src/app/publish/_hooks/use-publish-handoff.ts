import { PREFIX } from "@/utils/local-storage";
import { useCallback } from "react";
import useLocalStorage from "react-use/lib/useLocalStorage";
import useMount from "react-use/lib/useMount";

/**
 * One-shot channel for handing content to the publish composer from another
 * surface: a wave or a deck thread that outgrew its character limit and has
 * to become a post instead, or a Raidstead raid report (which brings a title).
 *
 * It deliberately does not reuse the submit page's local draft key. That key
 * holds a full PostBase which the submit page rewrites on every keystroke, so
 * writing a partial object into it both corrupted that draft's shape (a draft
 * with no title crashed the submit page in applyTitle) and risked eating a
 * post the user had in progress there.
 */
export interface PublishHandoff {
  body: string;
  title?: string;
}

export const PUBLISH_HANDOFF_KEY = PREFIX + "_pub_handoff";

/**
 * Stage content for the composer. The caller is expected to open /publish
 * right after, in this tab or a new one.
 */
export function usePublishHandoffWriter() {
  const [, setHandoff] = useLocalStorage<PublishHandoff>(PUBLISH_HANDOFF_KEY);

  return useCallback(
    (body: string, title?: string) => setHandoff(title ? { body, title } : { body }),
    [setHandoff]
  );
}

/**
 * Consume anything staged for the composer, exactly once. The entry is dropped
 * before it is handed over so that content which the editor cannot swallow
 * fails a single time rather than on every subsequent visit.
 */
export function usePublishHandoff(onReceive: (body: string, title?: string) => void) {
  const [handoff, , removeHandoff] = useLocalStorage<PublishHandoff>(PUBLISH_HANDOFF_KEY);

  useMount(() => {
    const body = handoff?.body;
    const title = typeof handoff?.title === "string" ? handoff.title : undefined;

    // Dropped before anything else, so that an entry the composer cannot use,
    // whether malformed or simply empty, is cleared rather than re-examined on
    // every later visit, and content it chokes on fails once rather than on
    // every one.
    removeHandoff();

    if (!body) {
      return;
    }

    if (title) onReceive(body, title);
    else onReceive(body);
  });
}
