import { describe, expect, it } from 'vitest';
import { isModeratorRole } from './community-role';

describe('isModeratorRole', () => {
  it('accepts the roles that can act on the pending queue', () => {
    expect(isModeratorRole('owner')).toBe(true);
    expect(isModeratorRole('admin')).toBe(true);
    expect(isModeratorRole('mod')).toBe(true);
  });

  it('rejects every other role', () => {
    for (const role of ['member', 'guest', 'muted', '']) {
      expect(isModeratorRole(role)).toBe(false);
    }
  });

  it('rejects the absent role a logged-out visitor has', () => {
    // The community-context query is disabled without a username, so this is
    // the value the sidebar actually sees for a reader who is not signed in.
    for (const role of [undefined, null, true, 1, {}, ['mod']]) {
      expect(isModeratorRole(role)).toBe(false);
    }
  });
});
