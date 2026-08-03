import { describe, expect, it } from 'vitest';
import { resolveCreatePostTarget } from './create-post-target';

/** Blog instance unless a case says otherwise. */
const blog = (createPostUrl: string | null | undefined) =>
  resolveCreatePostTarget({ createPostUrl, isCommunityMode: false });

describe('resolveCreatePostTarget', () => {
  it('uses the built-in editor when nothing is configured', () => {
    expect(blog(undefined)).toEqual({ kind: 'internal' });
    expect(blog(null)).toEqual({ kind: 'internal' });
    expect(blog('')).toEqual({ kind: 'internal' });
    expect(blog('   ')).toEqual({ kind: 'internal' });
  });

  // Every live tenant carries this exact string because managed hosting wrote it
  // at signup, so reading it as a configured composer would keep all of them on
  // the old hand-off and the built-in editor would reach nobody.
  it('treats the legacy hosting default as not configured', () => {
    expect(blog('https://ecency.com/publish')).toEqual({ kind: 'internal' });
  });

  it('treats legacy default spellings as not configured', () => {
    for (const value of [
      'https://ecency.com/publish/',
      'HTTPS://Ecency.com/Publish',
      '  https://ecency.com/publish  ',
      'http://ecency.com/publish',
      'https://www.ecency.com/publish',
    ]) {
      expect(blog(value)).toEqual({ kind: 'internal' });
    }
  });

  it('treats the built-in route itself as the built-in editor', () => {
    // config.template.json ships "/publish"; that is this page, not a hand-off.
    expect(blog('/publish')).toEqual({ kind: 'internal' });
    expect(blog('/publish/')).toEqual({ kind: 'internal' });
  });

  it('keeps the escape hatch for a deliberately configured composer', () => {
    expect(blog('https://example.com/write')).toEqual({
      kind: 'external',
      href: 'https://example.com/write',
    });
  });

  it('does not mistake another ecency.com page for a seeded default', () => {
    // Only the two spellings provisioning actually wrote are non-decisions.
    // An owner who deliberately points at some other ecency.com page keeps it.
    expect(blog('https://ecency.com/@someone/drafts')).toEqual({
      kind: 'external',
      href: 'https://ecency.com/@someone/drafts',
    });
  });

  it('returns the configured url unchanged apart from trimming', () => {
    expect(blog('  https://example.com/write?x=1&Y=2  ')).toEqual({
      kind: 'external',
      href: 'https://example.com/write?x=1&Y=2',
    });
  });

  // An external composer cannot carry parentPermlink = communityId, so a member
  // sent there would publish to their own blog instead of into the community.
  it('ignores createPostUrl on a community instance', () => {
    expect(
      resolveCreatePostTarget({
        createPostUrl: 'https://example.com/write',
        isCommunityMode: true,
      }),
    ).toEqual({ kind: 'internal' });
  });

  it('treats the add-tenant.sh seeded default as unset too', () => {
    // hosting/scripts/add-tenant.sh wrote /submit rather than /publish. Same
    // non-decision, so a scripted tenant must not be stranded on the hand-off.
    for (const url of [
      'https://ecency.com/submit',
      'http://www.ecency.com/submit/',
      '  HTTPS://Ecency.com/Submit  ',
    ]) {
      expect(
        resolveCreatePostTarget({ createPostUrl: url, isCommunityMode: false }),
      ).toEqual({ kind: 'internal' });
    }
  });

  /**
   * The configured value becomes an href. A scheme that executes must not reach
   * the DOM, and a value that cannot resolve must not render a dead button.
   */
  it('refuses a configured value that is not an http(s) destination', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/relative/path',
      'not a url',
    ]) {
      expect(
        resolveCreatePostTarget({ createPostUrl: url, isCommunityMode: false }),
      ).toEqual({ kind: 'internal' });
    }
  });

  it('still honours a real external composer', () => {
    expect(
      resolveCreatePostTarget({
        createPostUrl: 'https://write.example.com/new',
        isCommunityMode: false,
      }),
    ).toEqual({ kind: 'external', href: 'https://write.example.com/new' });
  });
});
