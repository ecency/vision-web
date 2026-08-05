/**
 * x402 Payment Signing Orchestrator
 *
 * Dispatches transaction signing to the appropriate method:
 * - Keychain (browser extension)
 * - Manual (active key input)
 *
 * Note: HiveAuth is not supported for x402 payments because its protocol
 * only accepts operations (not full transactions), so the signed result
 * won't match the prebuilt transaction from buildPaymentTx.
 */

import { signTx } from '../auth/utils/keychain';
import { resolveKeychainLikeInstance } from '../auth/utils/hive-extensions';
import {
  buildPaymentTx,
  encodePaymentHeader,
  type PaymentRequirements,
} from './x402-client';

export type PaymentSignMethod = 'keychain' | 'manual';

export interface SignX402PaymentOptions {
  /** Active private key in WIF format (required when method is 'manual') */
  activeKey?: string;
}

/**
 * Build, sign, and encode a payment for the x-payment header.
 *
 * Returns the base64-encoded header value ready to send.
 */
export async function signX402Payment(
  username: string,
  requirements: PaymentRequirements,
  method: PaymentSignMethod,
  options?: SignX402PaymentOptions
): Promise<string> {
  // Validate method-specific prerequisites before network I/O
  if (method === 'manual' && !options?.activeKey) {
    throw new Error('Active key required for manual signing');
  }

  // Step 1: Build unsigned transaction
  const { transaction, nonce } = await buildPaymentTx(username, requirements);

  // Step 2: Sign based on method
  let signedTx: Record<string, unknown>;

  switch (method) {
    case 'keychain': {
      // Transaction signing needs the callback API (Keychain/Keeper); resolve the
      // account's chosen extension. Peak Vault has no requestSignTx, and a user who
      // chose it must get a clear error, not a prompt from a wallet they didn't pick.
      const instance = resolveKeychainLikeInstance(username);
      if (!instance) {
        throw new Error(
          'No compatible extension available to sign this payment. Use the active key option instead.',
        );
      }
      const resp = await signTx(username, transaction as any, 'Active', instance);
      if (!resp.result) {
        throw new Error('The extension did not return a signed transaction');
      }
      try {
        signedTx = JSON.parse(resp.result);
      } catch (e) {
        // The line above already says "the extension"; this one named Keychain,
        // which is the login type rather than the product that signed.
        throw new Error(`Failed to parse the signed transaction from the extension: ${e instanceof Error ? e.message : e}`);
      }
      break;
    }

    case 'manual': {
      // Dynamic import hive-tx only when needed (keeps bundle small for other methods)
      const { HiveTxTransaction, PrivateKey } = await import('@ecency/sdk');
      const privKey = PrivateKey.fromString(options!.activeKey!);
      const tx = new HiveTxTransaction({ transaction: transaction as any });
      const signed = tx.sign(privKey);
      signedTx = signed as unknown as Record<string, unknown>;
      break;
    }

    default:
      throw new Error(`Unsupported signing method: ${method}`);
  }

  // Step 3: Encode for x-payment header
  return encodePaymentHeader(signedTx, nonce);
}
