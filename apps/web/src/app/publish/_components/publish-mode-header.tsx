import i18next from "i18next";
import { QuestStreakChip } from "@/features/shared/quest-streak-chip";

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
        {/* gap-y keeps the row readable if it wraps on a narrow phone, and the
            items stay on one line each so a timestamp never splits. */}
        <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {lastSaved && (
            <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {/* The label is dropped on phones, where this shares the row with
                  the open-draft link and the quest chip. The bare time still
                  reads as "saved at", and the tooltip-free strip stays one
                  line. */}
              <span className="hidden sm:inline">{i18next.t("publish.auto-save")}: </span>
              {/* Hours and minutes only. The default format spells out seconds
                  too, which is noise here and costs real width on mobile. */}
              {lastSaved.toLocaleTimeString(i18next.language || undefined, {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
          )}
          {/* Sits next to the saved time so "where did my work go" is answered
              in the same glance that raises it. Deliberately not the Button
              primitive: its smallest size still carries h-[2rem], which would
              nearly double the height of this text-xs strip on every screen. */}
          {lastSaved && onOpenDraft && (
            <button
              type="button"
              disabled={isOpeningDraft}
              onClick={onOpenDraft}
              className="text-blue-dark-sky hover:text-blue-dark-sky-hover focus:text-blue-dark-sky-active disabled:opacity-50 disabled:cursor-not-allowed hover:underline underline-offset-2 whitespace-nowrap"
            >
              {i18next.t("publish.open-draft")}
            </button>
          )}
          <QuestStreakChip />
        </span>
      </div>
    </div>
  );
}
