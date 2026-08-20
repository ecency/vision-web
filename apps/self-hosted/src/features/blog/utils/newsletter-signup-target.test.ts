import { describe, expect, it } from 'vitest';
import { newsletterSignupTarget, newsletterSubscribeBody } from './newsletter-signup-target';

describe('newsletterSignupTarget', () => {
  const managedBlog = { username: 'Alice', managed: true, siteTitle: 'Alice Writes' };

  it('offers the form only on a managed, claimed instance with the feature on', () => {
    expect(newsletterSignupTarget(managedBlog)).toEqual({ type: 'creator', target: 'alice', targetLabel: 'Alice Writes' });
    // A true self-host never gets it: the config has no managed marker.
    expect(newsletterSignupTarget({ username: 'alice' })).toBeNull();
    expect(newsletterSignupTarget({ ...managedBlog, managed: undefined })).toBeNull();
    // The unclaimed template, though served as managed, is not a tenant.
    expect(newsletterSignupTarget({ ...managedBlog, template: true })).toBeNull();
    // The owner's toggle.
    expect(newsletterSignupTarget({ ...managedBlog, enabled: false })).toBeNull();
    expect(newsletterSignupTarget({ ...managedBlog, enabled: true })).not.toBeNull();
    expect(newsletterSignupTarget({ managed: true })).toBeNull();
  });

  it('a hive-… instance subscribes to the community digest; labels fall back to the handle', () => {
    expect(newsletterSignupTarget({ username: 'hive-125125', managed: true, siteTitle: 'Town Square' })).toEqual({
      type: 'community',
      target: 'hive-125125',
      targetLabel: 'Town Square',
    });
    expect(newsletterSignupTarget({ username: 'HIVE-125125', managed: true, siteTitle: '  ' })).toEqual({
      type: 'community',
      target: 'hive-125125',
      targetLabel: 'hive-125125',
    });
    expect(newsletterSignupTarget({ username: 'bob', managed: true })).toEqual({ type: 'creator', target: 'bob', targetLabel: '@bob' });
  });

  it('builds the exact relay body, source self-hosted-blog', () => {
    const t = newsletterSignupTarget(managedBlog)!;
    expect(newsletterSubscribeBody(t, '  reader@example.com ', 'monthly')).toEqual({
      email: 'reader@example.com',
      type: 'creator',
      target: 'alice',
      targetLabel: 'Alice Writes',
      cadence: 'monthly',
      source: 'self-hosted-blog',
    });
  });
});
