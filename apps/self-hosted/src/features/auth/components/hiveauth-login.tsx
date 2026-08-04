'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';
import { login } from '../auth-actions';
import { LoginMethodButton } from './login-method-button';

interface HiveAuthLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function HiveAuthLogin({ onSuccess, onError }: HiveAuthLoginProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'error'>('idle');

  // Listen for HiveAuth events
  useEffect(() => {
    const handleQRCode = (e: CustomEvent<string>) => {
      setQrData(e.detail);
      setStatus('waiting');
    };

    const handleWaiting = () => {
      setStatus('waiting');
    };

    const handleError = (e: CustomEvent<string>) => {
      setStatus('error');
      onError?.(e.detail);
      setLoading(false);
    };

    window.addEventListener('hiveauth:qrcode', handleQRCode as EventListener);
    window.addEventListener('hiveauth:waiting', handleWaiting as EventListener);
    window.addEventListener('hiveauth:error', handleError as EventListener);

    return () => {
      window.removeEventListener('hiveauth:qrcode', handleQRCode as EventListener);
      window.removeEventListener('hiveauth:waiting', handleWaiting as EventListener);
      window.removeEventListener('hiveauth:error', handleError as EventListener);
    };
  }, [onError]);

  const handleLogin = useCallback(async () => {
    if (!username.trim()) {
      onError?.('Please enter your username');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setQrData(null);

    try {
      await login('hiveauth', username.trim().toLowerCase());
      onSuccess?.();
    } catch (error) {
      // Error is handled by the event listener
      if (status !== 'error') {
        onError?.(error instanceof Error ? error.message : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  }, [username, onSuccess, onError, status]);

  const handleCancel = () => {
    setShowInput(false);
    setLoading(false);
    setQrData(null);
    setStatus('idle');
  };

  if (!showInput) {
    return (
      <LoginMethodButton
        icon={<HiveAuthIcon />}
        label="HiveAuth"
        description="Scan QR code with HiveAuth mobile app"
        onClick={() => setShowInput(true)}
      />
    );
  }

  return (
    <div className="w-full p-4 rounded-theme border border-theme-strong bg-theme-secondary">
      <div className="flex items-center gap-3 mb-4">
        <HiveAuthIcon />
        <span className="font-medium text-theme-primary font-theme-ui">HiveAuth</span>
      </div>

      {!qrData ? (
        <div className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your Hive username"
            className="w-full px-3 py-2 rounded-theme input-theme font-theme-ui"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleLogin();
              }
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-4 py-2 rounded-theme border border-theme text-theme-primary hover:bg-theme-tertiary transition-theme font-theme-ui"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading || !username.trim()}
              className="btn-theme-primary flex-1 px-4 py-2 transition-theme disabled:opacity-50 disabled:cursor-not-allowed font-theme-ui"
            >
              {loading ? 'Connecting...' : 'Generate QR'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-theme-muted mb-3 font-theme-ui">
              Scan this QR code with the HiveAuth app on your phone
            </p>
            <div className="inline-block p-4 bg-white rounded-theme">
              <QRCode data={qrData} />
            </div>
          </div>
          {status === 'waiting' && (
            <p className="text-center text-sm text-theme-muted animate-pulse font-theme-ui">
              Waiting for approval...
            </p>
          )}
          <button
            type="button"
            onClick={handleCancel}
            className="w-full px-4 py-2 rounded-theme border border-theme text-theme-primary hover:bg-theme-tertiary transition-theme font-theme-ui"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// Local QR Code component - keeps sensitive data on-device
function QRCode({ data }: { data: string }) {
  return (
    <QRCodeSVG
      value={data}
      size={200}
      level="M"
      includeMargin={false}
    />
  );
}

function HiveAuthIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17 2H7C5.9 2 5 2.9 5 4V20C5 21.1 5.9 22 7 22H17C18.1 22 19 21.1 19 20V4C19 2.9 18.1 2 17 2ZM12 20C11.45 20 11 19.55 11 19C11 18.45 11.45 18 12 18C12.55 18 13 18.45 13 19C13 19.55 12.55 20 12 20ZM17 17H7V4H17V17Z"
        fill="currentColor"
      />
    </svg>
  );
}
