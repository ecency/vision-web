import { describe, expect, it } from 'vitest';
import {
  getExtensionName,
  VALID_EXTENSION_IDS as EXTENSION_IDS,
} from './hive-extensions';
import { extensionCancelledMessage } from './hosting-token';

/**
 * `keychain` is the login type for every Hive browser extension, not the
 * Keychain product. The same branch of `getHostingToken` runs for Hive Keeper
 * and Peak Vault, so a message naming Keychain told a Keeper user to go and
 * check a wallet they never installed, at the moment their config save failed.
 *
 * The app leads with Hive Keeper in both its install list and its detection
 * order, so the wrong name is most likely to be shown to exactly the users it
 * is most wrong for.
 */
describe('extension cancelled message', () => {
  it('names the extension that was actually asked to sign', () => {
    for (const id of EXTENSION_IDS) {
      const message = extensionCancelledMessage(id);
      expect(message, id).toContain(getExtensionName(id));
    }
  });

  /**
   * The real point: no message may name a product the signer is not using.
   * Asserting only that the right name appears would pass on
   * "Signing with Hive Keeper (Keychain) was cancelled."
   */
  it('names no other wallet', () => {
    for (const id of EXTENSION_IDS) {
      const message = extensionCancelledMessage(id);
      const others = EXTENSION_IDS.filter((other) => other !== id).map(
        getExtensionName,
      );
      for (const name of others) {
        // Hive Keeper and Keychain share no substring, so a plain check holds.
        expect(message, `${id} must not mention ${name}`).not.toContain(name);
      }
    }
  });

  /**
   * A session can carry no recorded extension: the preference is stored per
   * username, and a browser that cleared storage still signs. Falling back to a
   * product name would be a guess.
   */
  it('stays generic when no extension was recorded', () => {
    const message = extensionCancelledMessage(undefined);
    expect(message).toMatch(/browser extension/i);
    for (const id of EXTENSION_IDS) {
      expect(message).not.toContain(getExtensionName(id));
    }
  });
});
