import { t } from '@/core';

/**
 * The disclosure floor: three statements about what a click costs the visitor.
 *
 * These have NO config key. No default, no editor control, nothing a malformed
 * document can switch off, and this module deliberately imports nothing from
 * the Hive layer resolver so there is no path by which one could be added
 * quietly. A source-scanning guard pins both halves of that.
 *
 * The person protected is not the site owner. It is a commenter on someone
 * else's domain who may not know the word Hive and is one click from a
 * permanent public write with their own key. The owner has no standing to waive
 * a stranger's warning, and the owner is the one exposed when that commenter
 * later says nobody told them.
 *
 * Explaining is optional, warning is not: the "Published on Hive" note and the
 * learn-more link are promotional and an owner can suppress them. These cannot
 * be suppressed.
 *
 * Accepted cost, stated rather than buried: on a white-label site the word Hive
 * appears under the comment box and above the publish button regardless of how
 * the owner has configured the rest.
 *
 * Each is one muted line. On a phone, one more line above a button matters.
 */

const LINE = 'text-xs text-theme-muted';

/** Liking is an on-chain vote that spends the reader's own voting power. */
export function VoteDisclosure() {
  return <p className={LINE}>{t('hive_disclosure_vote')}</p>;
}

/** A comment is a permanent public write that cannot be deleted. */
export function CommentDisclosure() {
  return <p className={LINE}>{t('hive_disclosure_comment')}</p>;
}

/** Publishing is permanent, and rewards close seven days after it. */
export function PublishDisclosure() {
  return <p className={LINE}>{t('hive_disclosure_publish')}</p>;
}
