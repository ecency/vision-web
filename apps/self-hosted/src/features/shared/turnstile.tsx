import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { t } from '../../core/i18n';

/**
 * Cloudflare Turnstile widget for the managed-blog newsletter form.
 *
 * A deliberate second implementation rather than a shared one. `apps/web` has its own in
 * `features/shared/turnstile.tsx`, but that file imports i18next and lives in the Next
 * bundle; this app is a separate Rsbuild SPA with its own string table, and the two are
 * kept apart on purpose. The logic that matters -- load the script once, render an
 * explicit widget, hand back a single-use token -- is about thirty lines.
 *
 * The sitekey is a literal, NOT read from an env var. Rsbuild provides no `process`, and
 * `check-node-globals` fails the build on a chunk that reads one; a missed define would
 * blank every hosted blog rather than fall back. The value is public and is bound to
 * ecency.com plus the tenant custom domains registered on the widget.
 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const TURNSTILE_SITEKEY = '0x4AAAAAADe6jH7FIi9dBzgR';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined' || window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Cleared so a later mount retries instead of inheriting the rejection forever.
        scriptPromise = null;
        reject(new Error('Failed to load Turnstile'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Discard the spent single-use token and ask for a fresh challenge. */
  reset: () => void;
}

interface Props {
  onVerify: (token: string) => void;
  /** Token expired or was cleared: the caller must drop the one it holds. */
  onExpire?: () => void;
  /** Challenge errored or the script never loaded. Falls back to onExpire. */
  onError?: () => void;
  /** Scopes the token; the relay rejects a token issued for anything else. */
  action?: string;
  className?: string;
}

export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile(
  { onVerify, onExpire, onError, action, className },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Callbacks held in refs so the widget renders once and still calls the current props.
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;
  onErrorRef.current = onError;

  const [failedToLoad, setFailedToLoad] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch {
            // widget already gone
          }
        }
        onExpireRef.current?.();
      },
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITEKEY,
          ...(action ? { action } : {}),
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () => (onErrorRef.current ?? onExpireRef.current)?.(),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailedToLoad(true);
          (onErrorRef.current ?? onExpireRef.current)?.();
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // widget already gone
        }
        widgetIdRef.current = null;
      }
    };
  }, [action]);

  if (failedToLoad) {
    return (
      <div className={className}>
        <small className="text-theme-muted">{t('newsletterCaptchaFailed')}</small>
      </div>
    );
  }

  return <div ref={containerRef} className={className} />;
});
