import { PostBase } from "../_types";
import { useEntryTypeDetection } from "./entry-type-detection";
import useLocalStorage from "react-use/lib/useLocalStorage";
import useMount from "react-use/lib/useMount";
import { PREFIX } from "@/utils/local-storage";

/**
 * The local draft is the unsaved new post, and it belongs to /submit only.
 * `isNewPostRoute` says whether this page may touch it at all: the draft and
 * entry-edit routes carry their own content and must neither restore it nor,
 * on the caller's side, overwrite it.
 */
export function useLocalDraftManager(
  path: string,
  username: string | undefined,
  permlink: string | undefined,
  draftId: string | undefined,
  onDraftLoaded: (
    title: string,
    tags: string[],
    body: string,
    description: string | null
  ) => void
) {
  const [localDraft, setLocalDraft] = useLocalStorage<PostBase>(PREFIX + "_local_draft");

  const { isEntry, isDraft } = useEntryTypeDetection(path, username, permlink, draftId);
  const isNewPostRoute = !isEntry && !isDraft;

  useMount(() => {
    if (!isNewPostRoute) {
      return;
    }

    if (!localDraft || JSON.stringify(localDraft) === "{}") {
      return;
    }

    // description is restored too: the publish composer hands a post over
    // through this key when leaving for the classic editor, and dropping it
    // here meant a custom meta description was silently replaced by whatever
    // the persisted advanced state still held - and then written back over the
    // transferred one by the local-draft effect.
    const { title = "", tags = [], body = "", description = null } = localDraft;
    onDraftLoaded(title, tags, body, description);
  });

  return {
    localDraft,
    setLocalDraft,
    isNewPostRoute
  };
}
