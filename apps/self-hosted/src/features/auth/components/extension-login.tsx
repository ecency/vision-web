'use client';

import { useEffect, useState } from 'react';
import { login } from '../auth-actions';
import type { HiveExtensionId } from '../types';
import {
  getDetectedExtensions,
  type DetectedExtension,
} from '../utils/hive-extensions';
import { LoginMethodButton } from './login-method-button';

interface ExtensionLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

const INSTALL_LINKS: Array<{ name: string; url: string }> = [
  {
    name: 'Hive Keeper',
    url: 'https://chromewebstore.google.com/detail/hive-keeper/eehlplhgiofbbanbjiodipefljadfehe',
  },
  { name: 'Keychain', url: 'https://hive-keychain.com/' },
  {
    name: 'Peak Vault',
    url: 'https://chromewebstore.google.com/detail/peak-vault/mcocapccicdidkhhghnopbddglkpjcoi',
  },
];

/**
 * "Sign with extension" login: detects the installed Hive browser extensions
 * (Hive Keeper, Keychain, Peak Vault) and, when more than one is present,
 * lets the user pick which one signs, like the main Ecency app. The choice is
 * remembered per username and used by every later signing request.
 */
export function ExtensionLogin({ onSuccess, onError }: ExtensionLoginProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInput, setShowInput] = useState(false);

  // Extensions inject before app code runs; re-detect when opening the form in
  // case one was enabled after page load.
  const [extensions, setExtensions] = useState<DetectedExtension[]>(() =>
    typeof window === 'undefined' ? [] : getDetectedExtensions(),
  );
  const [selectedId, setSelectedId] = useState<HiveExtensionId | null>(null);
  const selected =
    extensions.find((e) => e.id === selectedId) ??
    (extensions.length === 1 ? extensions[0] : null);

  // Extensions can inject AFTER React mounts (slow devices, MV3 startup); a
  // one-time detection would then show "no extension found" forever. Poll
  // briefly and re-check on window focus (e.g. returning from the web store).
  useEffect(() => {
    if (extensions.length > 0) return;

    const detect = () => {
      const found = getDetectedExtensions();
      if (found.length > 0) setExtensions(found);
      return found.length > 0;
    };

    let tries = 0;
    const interval = setInterval(() => {
      tries += 1;
      if (detect() || tries >= 10) clearInterval(interval);
    }, 500);
    const onFocus = () => detect();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [extensions.length]);

  const handleLogin = async () => {
    if (!username.trim()) {
      onError?.('Please enter your username');
      return;
    }
    if (!selected) {
      onError?.('Please choose an extension to sign with');
      return;
    }

    setLoading(true);
    try {
      await login('keychain', username.trim().toLowerCase(), selected.id);
      onSuccess?.();
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  if (extensions.length === 0) {
    return (
      <div className="w-full p-4 rounded-theme border border-theme bg-theme-primary opacity-75">
        <div className="font-medium text-theme-primary">
          Sign with extension
        </div>
        <div className="text-sm text-theme-muted mt-0.5">
          No Hive extension found. Install{' '}
          {INSTALL_LINKS.map((link, i) => (
            <span key={link.name}>
              {i > 0 && (i === INSTALL_LINKS.length - 1 ? ' or ' : ', ')}
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {link.name}
              </a>
            </span>
          ))}
          .
        </div>
      </div>
    );
  }

  if (!showInput) {
    return (
      <LoginMethodButton
        icon={<ExtensionIcon />}
        label="Sign with extension"
        description={`Use ${extensions.map((e) => e.name).join(', ')} to login`}
        onClick={() => {
          setExtensions(getDetectedExtensions());
          setShowInput(true);
        }}
      />
    );
  }

  return (
    <div className="w-full p-4 rounded-theme border border-theme-strong bg-theme-secondary">
      <div className="flex items-center gap-3 mb-4">
        <ExtensionIcon />
        <span className="font-medium text-theme-primary font-theme-ui">
          Sign with extension
        </span>
      </div>
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

        {extensions.length > 1 && (
          <div className="space-y-2">
            <div className="text-xs text-theme-muted font-theme-ui">
              Sign with
            </div>
            {extensions.map((ext) => {
              const isActive = selected?.id === ext.id;
              return (
                <button
                  key={ext.id}
                  type="button"
                  onClick={() => setSelectedId(ext.id)}
                  disabled={loading}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-theme border text-left transition-theme font-theme-ui ${
                    isActive
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-theme hover:border-theme-strong'
                  }`}
                >
                  <img
                    src={ext.icon}
                    alt={ext.name}
                    className="size-6 rounded"
                  />
                  <span className="flex-1 text-sm font-medium text-theme-primary">
                    {ext.name}
                  </span>
                  {isActive && <span className="text-blue-500 text-sm">✓</span>}
                </button>
              );
            })}
          </div>
        )}

        {extensions.length === 1 && (
          <div className="flex items-center gap-2 text-sm text-theme-muted font-theme-ui">
            <img
              src={extensions[0].icon}
              alt={extensions[0].name}
              className="size-5 rounded"
            />
            via {extensions[0].name}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowInput(false)}
            className="flex-1 px-4 py-2 rounded-theme border border-theme text-theme-primary hover:bg-theme-tertiary transition-theme font-theme-ui"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLogin}
            disabled={loading || !username.trim() || !selected}
            className="btn-theme-primary flex-1 px-4 py-2 transition-theme disabled:opacity-50 disabled:cursor-not-allowed font-theme-ui"
          >
            {loading ? 'Connecting...' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExtensionIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Browser extension</title>
      <path
        d="M12 2C9.24 2 7 4.24 7 7V10H6C4.9 10 4 10.9 4 12V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V12C20 10.9 19.1 10 18 10H17V7C17 4.24 14.76 2 12 2ZM12 4C13.66 4 15 5.34 15 7V10H9V7C9 5.34 10.34 4 12 4ZM12 14C13.1 14 14 14.9 14 16C14 17.1 13.1 18 12 18C10.9 18 10 17.1 10 16C10 14.9 10.9 14 12 14Z"
        fill="currentColor"
      />
    </svg>
  );
}
