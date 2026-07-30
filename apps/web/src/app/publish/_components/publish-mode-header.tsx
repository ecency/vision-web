import i18next from "i18next";
import { QuestStreakChip } from "@/features/shared/quest-streak-chip";
import { Button } from "@ui/button";

interface Props {
  /**
   * The current editing-mode label, one of New Content / Draft Editing / Post
   * Editing. These are mutually exclusive: a given editor view shows exactly
   * one, so this header is the single source of truth for the mode indicator.
   */
  label: string;
  lastSaved?: Date | null;
  /**
   * Opens the draft autosave has been writing to. Only passed by the composer,
   * which is the one view that can be sitting on an autosaved draft without
   * showing it - the draft and entry editors are already on their content.
   */
  onOpenDraft?: () => void;
  isOpeningDraft?: boolean;
}

/**
 * Status header shown directly above the publish action bar. Renders the
 * mutually-exclusive mode label on the left and, while a draft is being
 * auto-saved, the last-saved time on the right. Its horizontal padding matches
 * the action bar (`px-2 md:px-4`) so the label lines up with the community
 * selector below it on every breakpoint.
 */
export function PublishModeHeader({
  label,
  lastSaved,
  onOpenDraft,
  isOpeningDraft
}: Props) {
  return (
    <div className="container max-w-[1024px] mx-auto text-xs text-gray-600 dark:text-gray-400 px-2 md:px-4 py-2 md:py-0">
      <div className="flex flex-wrap justify-between items-center">
        <span>{label}</span>
        <span className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-gray-500 dark:text-gray-400">
              {i18next.t("publish.auto-save")}:{" "}
              {lastSaved.toLocaleTimeString(i18next.language || undefined)}
            </span>
          )}
          {/* Sits next to the saved time so "where did my work go" is answered
              in the same glance that raises it. */}
          {lastSaved && onOpenDraft && (
            <Button
              size="xs"
              appearance="link"
              noPadding={true}
              disabled={isOpeningDraft}
              onClick={onOpenDraft}
            >
              {i18next.t("publish.open-draft")}
            </Button>
          )}
          <QuestStreakChip />
        </span>
      </div>
    </div>
  );
}
