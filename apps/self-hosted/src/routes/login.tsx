'use client';

import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  useIsAuthenticated,
  useIsAuthEnabled,
  useAvailableAuthMethods,
  orderAuthMethods,
} from '@/features/auth';
import { ExtensionLogin } from '@/features/auth/components/extension-login';
import { HiveAuthLogin } from '@/features/auth/components/hiveauth-login';
import { HivesignerLogin } from '@/features/auth/components/hivesigner-login';
import { InstanceConfigManager, t } from '@/core';

/**
 * Validates that a redirect URL is safe (internal path only).
 * Prevents open redirect vulnerabilities by only allowing:
 * - Relative paths starting with a single '/'
 * - Not starting with '//' (protocol-relative URLs)
 * - Not containing URL schemes like 'http:', 'javascript:', etc.
 */
function sanitizeRedirect(redirect: string | undefined): string {
  if (!redirect || typeof redirect !== 'string') {
    return '/';
  }

  const trimmed = redirect.trim();

  // Must start with exactly one '/' and not be a protocol-relative URL
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }

  // Check for URL schemes (http:, https:, javascript:, data:, etc.)
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(trimmed)) {
    return '/';
  }

  // Block encoded characters that could bypass the checks
  if (trimmed.includes('%2f') || trimmed.includes('%2F') || trimmed.includes('%5c') || trimmed.includes('%5C')) {
    return '/';
  }

  return trimmed;
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: sanitizeRedirect(search.redirect as string),
  }),
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: '/login' });
  const isAuthenticated = useIsAuthenticated();
  const isAuthEnabled = useIsAuthEnabled();
  const availableMethods = useAvailableAuthMethods();
  const [error, setError] = useState<string | null>(null);

  const blogTitle = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.instanceConfiguration.meta.title
  );

  // Which method can actually complete depends on the device, not on the order
  // the config happens to list them in. See orderAuthMethods.
  const orderedMethods = useMemo(
    () => orderAuthMethods(availableMethods),
    [availableMethods]
  );

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: redirect || '/' });
    }
  }, [isAuthenticated, navigate, redirect]);

  // Redirect if auth is disabled
  useEffect(() => {
    if (!isAuthEnabled) {
      navigate({ to: '/' });
    }
  }, [isAuthEnabled, navigate]);

  const handleSuccess = () => {
    setError(null);
    navigate({ to: redirect || '/' });
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  if (!isAuthEnabled) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-theme-primary">
      <div className="w-full max-w-md">
        <div className="card-theme p-6 sm:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold heading-theme mb-1 text-center">
              {t('login')}
            </h1>
            {blogTitle && (
              <p className="text-theme-muted font-theme-ui text-center">
                {blogTitle}
              </p>
            )}
            {/* The only place a hosted site says it is configurable at all.
                Deliberately not gated on anything: who the owner is cannot be
                known before they authenticate, and this page is what tells them
                authenticating is worth doing. Without it a site can run
                indefinitely on the stock template, because the panel that
                changes it only exists once you are already signed in. Phrased so
                a reader who is not the owner reads one sentence that does not
                apply to them and moves on. */}
            <p className="mt-4 text-sm text-theme-muted font-theme-ui">
              {t('login_owner_hint')}
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm font-theme-ui">
              {error}
            </div>
          )}

          <div className="space-y-3">
            {orderedMethods.map((method) => {
              switch (method) {
                case 'keychain':
                  return (
                    <ExtensionLogin
                      key={method}
                      onSuccess={handleSuccess}
                      onError={handleError}
                    />
                  );
                case 'hivesigner':
                  return <HivesignerLogin key={method} />;
                case 'hiveauth':
                  return (
                    <HiveAuthLogin
                      key={method}
                      onSuccess={handleSuccess}
                      onError={handleError}
                    />
                  );
                default:
                  // A method name the config accepted but this page cannot
                  // render. Nothing, rather than a blank card.
                  return null;
              }
            })}
          </div>

          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => navigate({ to: '/' })}
              className="text-sm text-theme-muted hover:text-theme-primary transition-theme font-theme-ui"
            >
              {t('back_to_blog')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
