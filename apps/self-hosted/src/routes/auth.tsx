import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { t } from '@/core';
import { saveUser } from '@/features/auth/storage';
import { completeHivesignerCallback } from '@/features/auth/utils/hivesigner-callback';
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

    completeHivesignerCallback().then((outcome) => {
      if (cancelled) return;

      if (!outcome.ok) {
        setError(t('hivesigner_login_failed'));
        return;
      }

      setUser(outcome.user);
      saveUser(outcome.user);
      navigate({ to: '/blog', search: { filter: 'posts' } });
    });

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
