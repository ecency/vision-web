'use client';

import clsx from 'clsx';
import { useState } from 'react';
import type { PaymentRequirements } from '../x402-client';
import { signX402Payment, type PaymentSignMethod } from '../sign-payment';
import {
  callbackCapableExtensions,
  extensionMethodLabel,
  hasKeychainLikeExtension,
} from '../../auth/utils/hive-extensions';

interface PaymentDialogProps {
  requirements: PaymentRequirements;
  username: string;
  onPaymentSigned: (paymentHeader: string) => void;
  onCancel: () => void;
}

export function PaymentDialog({
  requirements,
  username,
  onPaymentSigned,
  onCancel,
}: PaymentDialogProps) {
  const [loadingMethod, setLoadingMethod] = useState<PaymentSignMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Transaction signing needs the callback API (Keychain or Hive Keeper).
  const keychainAvailable = hasKeychainLikeExtension();
  // From the SAME list the gate above reads. Labelling from every detected
  // wallet named Peak Vault as the method while the button said "Extension not
  // detected" and stayed disabled, because Peak Vault cannot sign here.
  const extensionLabel = extensionMethodLabel(callbackCapableExtensions());

  async function handleSign(method: PaymentSignMethod) {
    setLoadingMethod(method);
    setError(null);

    try {
      const header = await signX402Payment(username, requirements, method, {
        activeKey: method === 'manual' ? activeKey : undefined,
      });
      setActiveKey('');
      onPaymentSigned(header);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment signing failed');
    } finally {
      setLoadingMethod(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-theme-primary rounded-theme border border-theme shadow-lg max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-theme-primary mb-2">
          Payment Required
        </h2>

        <div className="space-y-2 mb-6 text-sm text-theme-muted">
          <div className="flex justify-between">
            <span>Amount:</span>
            <span className="font-medium text-theme-primary">
              {requirements.maxAmountRequired}
            </span>
          </div>
          <div className="flex justify-between">
            <span>To:</span>
            <span className="font-mono text-theme-primary">
              @{requirements.payTo}
            </span>
          </div>
          {requirements.description && (
            <div className="flex justify-between">
              <span>For:</span>
              <span className="text-theme-primary">
                {requirements.description}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-theme bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* Keychain */}
          <button
            type="button"
            onClick={() => handleSign('keychain')}
            disabled={!keychainAvailable || !!loadingMethod}
            className={clsx(
              'w-full p-3 rounded-theme border border-theme transition-theme',
              'flex items-center gap-3 text-left bg-theme-primary',
              'hover:bg-theme-secondary hover:border-theme-strong',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-theme-accent'
            )}
          >
            <div className="flex-1">
              <div className="font-medium text-theme-primary">
                {extensionLabel}
              </div>
              <div className="text-xs text-theme-muted">
                {keychainAvailable
                  ? 'Sign with browser extension'
                  : 'Extension not detected'}
              </div>
            </div>
            {loadingMethod === 'keychain' && <Spinner />}
          </button>

          {/* Manual Active Key */}
          {!showKeyInput ? (
            <button
              type="button"
              onClick={() => setShowKeyInput(true)}
              disabled={!!loadingMethod}
              className={clsx(
                'w-full p-3 rounded-theme border border-theme transition-theme',
                'flex items-center gap-3 text-left bg-theme-primary',
                'hover:bg-theme-secondary hover:border-theme-strong',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-theme-accent'
              )}
            >
              <div className="flex-1">
                <div className="font-medium text-theme-primary">
                  Active Key
                </div>
                <div className="text-xs text-theme-muted">
                  Enter your private active key
                </div>
              </div>
            </button>
          ) : (
            <div className="space-y-2">
              <input
                type="password"
                value={activeKey}
                onChange={(e) => setActiveKey(e.target.value)}
                placeholder="Enter active private key (WIF)"
                className={clsx(
                  'w-full p-3 rounded-theme border border-theme',
                  'bg-theme-primary text-theme-primary text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-theme-accent'
                )}
              />
              <button
                type="button"
                onClick={() => handleSign('manual')}
                disabled={!activeKey || !!loadingMethod}
                className={clsx(
                  'btn-theme-primary w-full p-2 text-sm font-medium',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {loadingMethod === 'manual' ? 'Signing...' : 'Sign Payment'}
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={!!loadingMethod}
          className="w-full mt-4 p-2 text-sm text-theme-muted hover:text-theme-primary transition-theme"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin size-5 text-theme-muted flex-shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
