import { earnsQuestContentCredit } from "@ecency/sdk";

interface ShortContentHintInput {
  /** Signed-in account name, if any. */
  username?: string | null;
  /** Editing existing content rather than creating new content. */
  isEditing?: boolean;
  /** Current composer body. */
  text?: string | null;
}

/**
 * Whether to warn that this content is too short to earn points or quest credit.
 *
 * The points backend drops a comment whose body is at or under a minimum length once
 * URLs are stripped, so a one-word reply, an emoji, or an image-only post earns nothing
 * and never reaches the daily comment quest. The rule is deliberate but invisible, and
 * it is the single biggest source of "quests do not show my action" reports.
 *
 * Shared by the reply composer and the wave composer, because a wave is a comment on the
 * chain and goes through exactly the same rule. Kept in one place so the two cannot
 * drift apart, and so the rule is testable without standing up either composer.
 *
 * Quiet for logged-out users (nothing to earn), while editing (the original already
 * claimed the reward), and on an untouched composer (nothing to nag about yet).
 */
export function shouldShowShortContentHint({
  username,
  isEditing,
  text
}: ShortContentHintInput): boolean {
  if (!username || isEditing) {
    return false;
  }

  if (!text?.trim()) {
    return false;
  }

  return !earnsQuestContentCredit(text);
}
