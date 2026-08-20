import { describe, expect, it } from 'vitest';
import {
  newsletterSignupTarget,
  newsletterSubscribeBody,
  sidebarShowsNewsletter,
} from './newsletter-signup-target';

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
    expect(newsletterSubscribeBody(t, '  reader@example.com ', 'monthly', 'tok')).toEqual({
      email: 'reader@example.com',
      type: 'creator',
      target: 'alice',
      cadence: 'monthly',
      source: 'self-hosted-blog',
      // The site title is NOT sent any more: it used to let a caller write part of a
      // sentence in mail our domain sends to an address they chose. The service derives
      // the label from the target now. targetLabel still exists on the TARGET above,
      // for the copy this app renders itself.
      captchaToken: 'tok',
    });
  });
});

describe('sidebarShowsNewsletter', () => {
  it('stands down on the About page, which carries its own', () => {
    // One form per page: the About page renders it in the content column, and
    // it is the only surface every template has.
    expect(sidebarShowsNewsletter('/about')).toBe(false);
    expect(sidebarShowsNewsletter('/about/')).toBe(false);
    expect(sidebarShowsNewsletter('/about//')).toBe(false);
  });

  it('shows it everywhere else, including paths that merely start with it', () => {
    expect(sidebarShowsNewsletter('/')).toBe(true);
    expect(sidebarShowsNewsletter('/@alice/hello')).toBe(true);
    expect(sidebarShowsNewsletter('/search')).toBe(true);
    // Not a prefix match: a post that happens to live under /about-something
    // is an ordinary page and still gets the rail's form.
    expect(sidebarShowsNewsletter('/aboutus')).toBe(true);
    expect(sidebarShowsNewsletter('/about/extra')).toBe(true);
  });
});
