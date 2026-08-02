import { describe, expect, it } from 'vitest';
import { canEditEntry } from './can-edit-entry';

describe('canEditEntry', () => {
  it('lets an author edit their own post', () => {
    expect(canEditEntry('alice', 'alice')).toBe(true);
  });

  it('lets a community member edit their own post on an instance they do not own', () => {
    // The regression: the route required `isBlogOwner && username === author`,
    // so on a community instance, where any authenticated user can publish,
    // the author of a post could never reopen it.
    expect(canEditEntry('member', 'member')).toBe(true);
  });

  it("does not let the instance owner edit someone else's post", () => {
    // The Edit control used to render on ownership alone and then bounced the
    // owner back to /blog, because an edit is broadcast as the post's author.
    expect(canEditEntry('owner', 'someone-else')).toBe(false);
  });

  it('rejects a signed-out visitor', () => {
    expect(canEditEntry(undefined, 'alice')).toBe(false);
    expect(canEditEntry(null, 'alice')).toBe(false);
    expect(canEditEntry('', 'alice')).toBe(false);
  });

  it('rejects a missing author rather than matching an empty username', () => {
    expect(canEditEntry(undefined, undefined)).toBe(false);
    expect(canEditEntry('', '')).toBe(false);
    expect(canEditEntry('alice', undefined)).toBe(false);
  });

  it('accepts the @-prefixed form the route param carries', () => {
    expect(canEditEntry('alice', '@alice')).toBe(true);
    expect(canEditEntry('@alice', 'alice')).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(canEditEntry('Alice', ' alice ')).toBe(true);
  });

  it('does not treat a prefix as a match', () => {
    expect(canEditEntry('alice', 'alice2')).toBe(false);
    expect(canEditEntry('alice', 'ali')).toBe(false);
  });
});
