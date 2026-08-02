import { describe, expect, it } from 'vitest';
import { isPublishableTenant } from './config-service';

/**
 * nginx serves any file that exists in the config directory with no
 * subscription check, so publishing for a tenant that has never paid puts a
 * free blog live until the next sweep removes it. POST /v1/tenants already
 * avoids writing the file for that reason; every other publication path has to
 * agree with the rule syncAllConfigs uses.
 */
describe('isPublishableTenant', () => {
  it('publishes for an active subscription', () => {
    expect(isPublishableTenant({ subscriptionStatus: 'active' })).toBe(true);
  });

  it('does not publish for a tenant that has never been activated', () => {
    expect(isPublishableTenant({ subscriptionStatus: 'inactive' })).toBe(false);
    expect(isPublishableTenant({ subscriptionStatus: 'abandoned' })).toBe(false);
  });

  it('does not republish for a lapsed subscription', () => {
    // These keep whatever file they already have (accepted grace behaviour),
    // but nothing re-publishes them, matching syncAllConfigs.
    expect(isPublishableTenant({ subscriptionStatus: 'expired' })).toBe(false);
    expect(isPublishableTenant({ subscriptionStatus: 'suspended' })).toBe(false);
  });

  it('does not publish for an unrecognised status', () => {
    expect(isPublishableTenant({ subscriptionStatus: 'something-new' as never })).toBe(
      false,
    );
  });
});
