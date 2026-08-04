import { describe, expect, it } from 'vitest';
import {
  isConfirmationHeld,
  publishConfirmationKey,
  type PublishVariables,
} from './publish-variables';

/**
 * A confirmation is granted to a payload, not to a button.
 *
 * The finding this exists for: the arm was withdrawn only when the reward
 * selection changed, so an author could confirm, then edit the title, the body
 * or the tags, and publish the revised post with one further press. What went
 * out was not what was agreed to, which is the whole point of asking.
 *
 * The fix has to survive a field being added to the payload, so the key is
 * derived from the object rather than from a list of field names, and the
 * tests below prove that by changing a field this module has never heard of.
 */

const DRAFT: PublishVariables = {
  title: 'A post',
  body: 'Some body text',
  tags: ['photography', 'hive'],
  rewardType: 'dp',
};

/** Same draft, so the same key, regardless of how it was assembled. */
describe('the identity of a publish payload', () => {
  it('is the same for the same draft', () => {
    expect(publishConfirmationKey({ ...DRAFT })).toBe(
      publishConfirmationKey(DRAFT),
    );
  });

  it('does not depend on the order the fields were written in', () => {
    const reordered = {
      rewardType: DRAFT.rewardType,
      tags: DRAFT.tags,
      body: DRAFT.body,
      title: DRAFT.title,
    } as PublishVariables;
    expect(publishConfirmationKey(reordered)).toBe(
      publishConfirmationKey(DRAFT),
    );
  });

  it.each([
    ['title', { title: 'A post ' }],
    ['body', { body: 'Some body text.' }],
    ['a tag', { tags: ['photography', 'hive', 'art'] }],
    ['tag order', { tags: ['hive', 'photography'] }],
    ['tag spelling', { tags: ['photograph', 'hive'] }],
    ['the reward selection', { rewardType: 'default' as const }],
  ])('changes when %s changes', (_label, change) => {
    expect(publishConfirmationKey({ ...DRAFT, ...change })).not.toBe(
      publishConfirmationKey(DRAFT),
    );
  });

  it('covers a field this module has never heard of', () => {
    // The property that matters for the next person: the key is derived from
    // whatever the payload carries, so a thumbnail, a scheduled time or a poll
    // added to PublishVariables is covered without editing this file.
    const withNewField = { ...DRAFT, thumbnail: 'a.jpg' } as PublishVariables;
    const changed = { ...DRAFT, thumbnail: 'b.jpg' } as PublishVariables;

    expect(publishConfirmationKey(withNewField)).not.toBe(
      publishConfirmationKey(DRAFT),
    );
    expect(publishConfirmationKey(changed)).not.toBe(
      publishConfirmationKey(withNewField),
    );
  });

  it('sees inside a nested field', () => {
    // A future field is as likely to be an object as a string, and a key that
    // stopped at the top level would call two different drafts the same.
    const one = {
      ...DRAFT,
      metadata: { poll: { question: 'a' } },
    } as PublishVariables;
    const two = {
      ...DRAFT,
      metadata: { poll: { question: 'b' } },
    } as PublishVariables;

    expect(publishConfirmationKey(one)).not.toBe(publishConfirmationKey(two));
  });

  it('ignores the key order of a nested field', () => {
    const one = { ...DRAFT, metadata: { a: 1, b: 2 } } as PublishVariables;
    const two = { ...DRAFT, metadata: { b: 2, a: 1 } } as PublishVariables;
    expect(publishConfirmationKey(one)).toBe(publishConfirmationKey(two));
  });
});

describe('a confirmation is held for one payload only', () => {
  it('is not held before anything was confirmed', () => {
    expect(isConfirmationHeld(null, DRAFT)).toBe(false);
  });

  it('is held for the draft it was granted for', () => {
    const armedFor = publishConfirmationKey(DRAFT);
    expect(isConfirmationHeld(armedFor, DRAFT)).toBe(true);
    // Including a copy of it: identity is the payload, not the object.
    expect(isConfirmationHeld(armedFor, { ...DRAFT })).toBe(true);
  });

  it.each([
    ['the title is edited', { title: 'A different post' }],
    ['the body is edited', { body: 'Rewritten' }],
    ['a tag is added', { tags: ['photography', 'hive', 'art'] }],
    ['a tag is removed', { tags: ['photography'] }],
    ['the tags are reordered', { tags: ['hive', 'photography'] }],
    ['the reward choice changes', { rewardType: 'sp' as const }],
  ])('is withdrawn when %s', (_label, change) => {
    const armedFor = publishConfirmationKey(DRAFT);
    expect(isConfirmationHeld(armedFor, { ...DRAFT, ...change })).toBe(false);
  });

  it('comes back if the draft is edited back', () => {
    // Not a rule anyone needs, but it says what the check actually is: the
    // payload, and nothing about the sequence of edits that produced it.
    const armedFor = publishConfirmationKey(DRAFT);
    const edited = { ...DRAFT, title: 'Changed' };
    expect(isConfirmationHeld(armedFor, edited)).toBe(false);
    expect(isConfirmationHeld(armedFor, { ...edited, title: DRAFT.title })).toBe(
      true,
    );
  });

  it('is withdrawn when a field this module cannot name changes', () => {
    const armedFor = publishConfirmationKey({
      ...DRAFT,
      thumbnail: 'a.jpg',
    } as PublishVariables);
    expect(
      isConfirmationHeld(armedFor, {
        ...DRAFT,
        thumbnail: 'b.jpg',
      } as PublishVariables),
    ).toBe(false);
  });
});
