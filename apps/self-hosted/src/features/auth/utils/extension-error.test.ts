// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  extensionErrorMessage,
  isExplicitUserCancellation,
} from './extension-error';

/**
 * A cancelled signing request used to throw `resp.error` verbatim, so the user
 * saw the bare code `user_cancel`. It now resolves to the translated sentence,
 * while every other failure keeps the detail that says what went wrong.
 */
describe('extensionErrorMessage', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('lang');
  });

  it.each([
    [{ error: 'user_cancel', message: 'Request was canceled by the user.' }],
    [{ error: 'user_cancel' }],
    [{ error: 'cancelled' }],
    [{ message: 'Request was canceled by the user.' }],
    [{ error: { code: 4001, message: 'User rejected request' } }],
  ])('translates the cancellation for %o', (resp) => {
    const result = extensionErrorMessage(resp, 'Operation cancelled');
    expect(result).toBe('Transaction cancelled by user.');
    expect(result).not.toContain('user_cancel');
  });

  it('follows the language on the document', () => {
    document.documentElement.lang = 'es';
    expect(extensionErrorMessage({ error: 'user_cancel' }, 'fallback')).toBe(
      'Transacción cancelada por el usuario.',
    );
  });

  it('falls back to English for a language with no translation', () => {
    document.documentElement.lang = 'xx';
    expect(extensionErrorMessage({ error: 'user_cancel' }, 'fallback')).toBe(
      'Transaction cancelled by user.',
    );
  });

  it.each([
    [{ message: 'transaction rejected: missing required active authority' }],
    [{ error: { message: 'Assert Exception:limit_order_cancel: no order' } }],
    [{ message: 'Broadcast rejected by the node' }],
    [
      {
        error: 'rejected',
        message: 'Invalid transaction: duplicate transaction',
      },
    ],
  ])('keeps the real failure detail for %o', (resp) => {
    expect(extensionErrorMessage(resp, 'Extension broadcast failed')).not.toBe(
      'Transaction cancelled by user.',
    );
  });

  it('joins the readable reason and the underlying error', () => {
    const result = extensionErrorMessage(
      {
        message: 'There was an error broadcasting.',
        error: { message: 'missing required active authority' },
      },
      'fallback',
    );
    expect(result).toContain('There was an error broadcasting.');
    expect(result).toContain('missing required active authority');
  });

  it('uses the fallback when the response says nothing', () => {
    expect(extensionErrorMessage({}, 'Extension broadcast failed')).toBe(
      'Extension broadcast failed',
    );
  });
});

describe('isExplicitUserCancellation', () => {
  it.each([
    [{ error: 'user_cancel' }],
    [{ error: 'USER_CANCEL' }],
    [{ error: 'rejected' }],
    [{ message: 'User declined the transaction' }],
    [{ error: { code: 4001, message: 'User rejected request' } }],
  ])('treats %o as an explicit cancellation', (resp) => {
    expect(isExplicitUserCancellation(resp)).toBe(true);
  });

  it.each([
    [{}],
    [{ message: 'transaction rejected: missing required active authority' }],
    [{ message: 'Request declined: insufficient resource credits' }],
    [{ error: 'unauthorized' }],
    [{ error: 'cancel_transfer_from_savings failed' }],
    [
      {
        error: 'rejected',
        message: 'Invalid transaction: duplicate transaction',
      },
    ],
  ])('treats %o as NOT an explicit cancellation', (resp) => {
    expect(isExplicitUserCancellation(resp)).toBe(false);
  });
});
