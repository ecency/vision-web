"use client";

import i18next from "i18next";
import { Button } from "@ui/button";
import dayjs from "@/utils/dayjs";

interface Props {
  /** When the draft was last autosaved, in milliseconds. */
  savedAt: number;
  onResume: () => void;
  onDismiss: () => void;
}

/**
 * Offers the draft a previous /publish session autosaved into. Sits in the
 * page flow above the action bar rather than floating over the editor, so it
 * never covers what the writer is typing.
 */
export function PublishResumeDraftBar({ savedAt, onResume, onDismiss }: Props) {
  return (
    <div className="container max-w-[1024px] mx-auto px-2 md:px-4 pb-2">
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-dark-sky bg-white dark:bg-dark-200 px-3 py-2 text-sm"
      >
        <span>
          {i18next.t("publish.resume-draft-prompt", { time: dayjs(savedAt).fromNow() })}
        </span>
        <span className="flex items-center gap-2">
          <Button size="sm" appearance="gray" onClick={onDismiss}>
            {i18next.t("publish.resume-draft-dismiss")}
          </Button>
          <Button size="sm" onClick={onResume}>
            {i18next.t("publish.resume-draft-resume")}
          </Button>
        </span>
      </div>
    </div>
  );
}
