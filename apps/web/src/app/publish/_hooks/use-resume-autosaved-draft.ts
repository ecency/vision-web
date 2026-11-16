"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getDraftsQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getAccessToken } from "@/utils";
import {
  AutosavePointer,
  clearAutosavePointer,
  readAutosavePointer
} from "../_utils/autosave-pointer";

interface Options {
  /** Whether the composer holds nothing worth saving. */
  composerEmpty: boolean;
  /** The draft this session's autosave has created, if any. */
  draftId?: string;
}

/**
 * Offers to resume the draft a previous /publish session autosaved into.
 *
 * Autosave never navigates, so a writer who closed the tab comes back to an
 * empty composer while their post sits in a draft they are never shown. This
 * surfaces it, but only as an offer: someone who came here to start a new post
 * must not have an old one poured into the editor.
 *
 * The offer belongs to the moment the page opens on an empty composer. Once the
 * composer holds anything - content handed in from a wave, deck or raid report,
 * or the writer starting a new post - it is withdrawn for the rest of the visit,
 * since resuming would navigate away from that content.
 */
export function useResumeAutosavedDraft({ composerEmpty, draftId }: Options) {
  const router = useRouter();
  const { username } = useActiveAccount();
  const [pointer, setPointer] = useState<AutosavePointer>();
  const [withdrawn, setWithdrawn] = useState(false);

  // Read in an effect, not during render: storage does not exist on the server.
  useEffect(() => {
    setPointer(username ? readAutosavePointer(username) : undefined);
  }, [username]);

  const shouldWithdraw = !composerEmpty || !!draftId;
  useEffect(() => {
    if (shouldWithdraw) {
      setWithdrawn(true);
    }
  }, [shouldWithdraw]);

  const draftsQueryOptions = getDraftsQueryOptions(
    username ?? undefined,
    getAccessToken(username ?? "")
  );
  // Keeps the SDK's own gate: without an access token its queryFn resolves an
  // empty list, which would read as "the draft is gone" and drop the pointer.
  const draftsQuery = useQuery({
    ...draftsQueryOptions,
    enabled: draftsQueryOptions.enabled !== false && !!pointer && !withdrawn
  });

  const exists = useMemo(
    () => !!pointer && !!draftsQuery.data?.some((draft) => draft._id === pointer.id),
    [draftsQuery.data, pointer]
  );

  // Only a list the server actually returned proves the draft is gone. A
  // pending, refetching or failed request proves nothing.
  const isGone = !!pointer && draftsQuery.isSuccess && !draftsQuery.isFetching && !exists;
  useEffect(() => {
    if (isGone && username && pointer) {
      clearAutosavePointer(username, pointer.id);
      setPointer(undefined);
    }
  }, [isGone, pointer, username]);

  const prompt = pointer && exists && !withdrawn && !shouldWithdraw ? pointer : undefined;

  const resume = useCallback(() => {
    if (prompt) {
      router.push(`/publish/drafts/${prompt.id}`);
    }
  }, [prompt, router]);

  // Dismiss only: the draft stays in the Drafts list. Forgetting the pointer
  // means the next save here starts a new draft rather than overwriting it.
  const dismiss = useCallback(() => {
    if (username && pointer) {
      clearAutosavePointer(username, pointer.id);
    }
    setPointer(undefined);
  }, [pointer, username]);

  return { prompt, resume, dismiss };
}
