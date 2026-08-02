import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { t } from '@/core';
import { saveUser } from '@/features/auth/storage';
import type { AuthUser } from '@/features/auth/types';
import {
  consumeHivesignerState,
  parseHivesignerCallback,
  verifyHivesignerToken,
} from '@/features/auth/utils/hivesigner';
import { useAuthStore } from '@/store';

export const Route = createFileRoute('/auth')({
  component: RouteComponent,
});

/**
 * The Hivesigner callback lands here and nowhere else.
 *
 * It used to be handled by an effect that ran on every route, so any page
 * carrying ?access_token=&username= was treated as a completed login. That
 * accepted URL input as a credential: a crafted link logged the visitor in as
 * whoever the token belonged to, and everything they wrote afterwards was
 * attributed to that account.
 *
 * A dedicated route lets the callback be checked properly: the state nonce must
 * match the one this tab issued, and the token must actually belong to the
 * claimed account.
 */
function RouteComponent() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      const search = window.location.search;
      const params = new URLSearchParams(search);
      const callback = parseHivesignerCallback(search);

      // Consumed unconditionally so a failed attempt cannot be replayed.
      const stateOk = consumeHivesignerState(params.get('state'));

      if (!callback) {
        setError(t('hivesigner_login_failed'));
        return;
      }
      if (!stateOk) {
        // The login did not start in this tab, so the token is unsolicited.
        setError(t('hivesigner_login_failed'));
        return;
      }

      const verified = await verifyHivesignerToken(
        callback.accessToken,
        callback.username,
      );
      if (cancelled) return;
      if (!verified) {
        setError(t('hivesigner_login_failed'));
        return;
      }

      const user: AuthUser = {
        username: callback.username,
        accessToken: callback.accessToken,
        loginType: 'hivesigner',
        expiresAt: Date.now() + callback.expiresIn * 1000,
      };
      setUser(user);
      saveUser(user);

      // Drop the credential from the address bar before leaving this page.
      window.history.replaceState({}, '', window.location.pathname);
      navigate({ to: '/blog', search: { filter: 'posts' } });
    }

    completeLogin();
    return () => {
      cancelled = true;
    };
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-theme-primary">
      <div className="container mx-auto container-padding-theme">
        <div className="text-center py-12 text-theme-muted">
          {error ?? t('loading')}
        </div>
      </div>
    </div>
  );
}
