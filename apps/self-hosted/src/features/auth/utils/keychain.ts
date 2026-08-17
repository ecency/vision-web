import type { Operation } from '@ecency/sdk';
import type { KeychainResponse, KeychainSignTxResponse } from '../types';
import { extensionErrorMessage } from './extension-error';

export type AuthorityType = 'Owner' | 'Active' | 'Posting' | 'Memo';

/**
 * The Keychain callback API, implemented by Hive Keychain and Keychain-compatible
 * extensions (Hive Keeper). Every wrapper below takes the instance to talk to;
 * resolution of WHICH extension lives in hive-extensions.ts (per-user choice),
 * with window.hive_keychain kept only as a legacy fallback.
 */
export interface HiveKeychain {
  requestHandshake: (callback: () => void) => void;
  requestSignBuffer: (
    account: string,
    message: string,
    authType: AuthorityType,
    callback: (response: KeychainResponse) => void,
    rpc?: string | null,
  ) => void;
  requestBroadcast: (
    account: string,
    operations: Operation[],
    authType: AuthorityType,
    callback: (response: KeychainResponse) => void,
    rpc?: string | null,
  ) => void;
  requestSignTx?: (
    account: string,
    tx: Record<string, unknown>,
    authType: AuthorityType,
    callback: (response: KeychainSignTxResponse) => void,
    rpc?: string | null,
  ) => void;
}

declare global {
  interface Window {
    hive_keychain?: HiveKeychain;
  }
}

function defaultInstance(): HiveKeychain | undefined {
  return typeof window !== 'undefined' ? window.hive_keychain : undefined;
}

/**
 * Check if Keychain extension is available.
 * Prefer hasAnyHiveExtension/hasKeychainLikeExtension from hive-extensions.ts,
 * which also see Hive Keeper and Peak Vault.
 */
export function isKeychainAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.hive_keychain;
}

/**
 * Request handshake with the extension
 */
export function handshake(instance?: HiveKeychain): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const keychain = instance ?? defaultInstance();
    if (!keychain) {
      reject(new Error('Hive extension is unavailable or disabled.'));
      return;
    }
    keychain.requestHandshake(() => {
      resolve();
    });
  });
}

/**
 * Sign a buffer/message with the extension
 */
export function signBuffer(
  account: string,
  message: string,
  authType: AuthorityType = 'Posting',
  instance?: HiveKeychain,
): Promise<KeychainResponse> {
  return new Promise<KeychainResponse>((resolve, reject) => {
    const keychain = instance ?? defaultInstance();
    if (!keychain) {
      reject(new Error('Hive extension is unavailable or disabled.'));
      return;
    }

    // A wedged MV3 worker can silently never call back; without a deadline the
    // caller's spinner runs forever.
    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) {
        reject(
          new Error(
            "The extension didn't respond. If no popup appeared, click its icon to wake it, then try again.",
          ),
        );
      }
    }, 30000);

    keychain.requestSignBuffer(account, message, authType, (resp) => {
      finished = true;
      clearTimeout(timeout);
      if (!resp.success) {
        reject(new Error(extensionErrorMessage(resp, 'Operation cancelled')));
        return;
      }
      resolve(resp);
    });
  });
}

/**
 * Broadcast operations with the extension
 */
export function broadcast(
  account: string,
  operations: Operation[],
  authType: AuthorityType = 'Posting',
  instance?: HiveKeychain,
): Promise<KeychainResponse> {
  return new Promise<KeychainResponse>((resolve, reject) => {
    const keychain = instance ?? defaultInstance();

    if (!keychain) {
      reject(new Error('Hive extension is unavailable or disabled.'));
      return;
    }

    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) {
        reject(new Error('Hive extension response timeout'));
      }
    }, 30000);

    keychain.requestBroadcast(account, operations, authType, (resp) => {
      finished = true;
      clearTimeout(timeout);
      if (!resp.success) {
        reject(new Error(extensionErrorMessage(resp, 'Operation cancelled')));
        return;
      }
      resolve(resp);
    });
  });
}

/**
 * Sign a transaction without broadcasting (for x402 payments)
 * Requires an extension with requestSignTx support
 */
export function signTx(
  account: string,
  tx: Record<string, unknown>,
  authType: AuthorityType = 'Active',
  instance?: HiveKeychain,
): Promise<KeychainSignTxResponse> {
  return new Promise<KeychainSignTxResponse>((resolve, reject) => {
    const keychain = instance ?? defaultInstance();

    if (!keychain) {
      reject(new Error('Hive extension is unavailable or disabled.'));
      return;
    }

    if (!keychain.requestSignTx) {
      reject(
        new Error(
          'This extension does not support requestSignTx. Please update it.',
        ),
      );
      return;
    }

    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) {
        reject(new Error('Hive extension response timeout'));
      }
    }, 60000);

    keychain.requestSignTx(account, tx, authType, (resp) => {
      finished = true;
      clearTimeout(timeout);
      if (!resp.success) {
        reject(
          new Error(
            extensionErrorMessage(resp, 'Transaction signing cancelled'),
          ),
        );
        return;
      }
      resolve(resp);
    });
  });
}
