'use client';

import { createContext, type ReactNode, useEffect, useMemo } from 'react';
import { InstanceConfigManager } from '@/core';
import { useAuthStore } from '@/store';
import { clearHiveAuthSession, clearUser } from './storage';
import type { AuthContextValue, AuthUser } from './types';
import { availableAuthMethods } from './utils/auth-methods';
import { resolveHivesignerClientId } from './utils/hivesigner';

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, setUser, setSession } = useAuthStore();

  // Get auth config
  const authConfig = InstanceConfigManager.useConfig(
    ({ configuration }) => configuration.instanceConfiguration.features.auth,
  );

  const isAuthEnabled = authConfig?.enabled ?? false;
  const hivesignerClientId = resolveHivesignerClientId(
    InstanceConfigManager.useConfig(
      ({ configuration }) => configuration.general?.hivesigner?.clientId,
    ),
  );

  // Configured methods, minus any this instance cannot actually complete.
  // Offering a method that always fails sends the visitor into an error with no
  // explanation: Hivesigner rejects a redirect_uri its app has not registered,
  // and a hosted blog's origin cannot be registered in advance, so it is offered
  // only when the instance names a client of its own.
  const availableMethods = availableAuthMethods(
    authConfig?.methods,
    hivesignerClientId,
  );

  // Get the instance owner. Falls back to the showcased username for older
  // configs that predate the `owner` field (blog instances where the owner and
  // the showcased account are the same). In community instances the showcased
  // username is the community (hive-NNNNN), so the owner must be used instead.
  // Read from the BASELINE config: the Configuration Editor's preview overlays
  // a drafted document over every ordinary read, and a drafted identity field
  // must not change who the owner is mid-preview.
  const blogOwner = InstanceConfigManager.getBaseConfigValue(
    ({ configuration }) =>
      configuration.instanceConfiguration.owner ||
      configuration.instanceConfiguration.username,
  );

  // Check if current user is the instance owner
  const isBlogOwner = useMemo(() => {
    if (!user || !blogOwner) return false;
    return (
      (user.username ?? '').toLowerCase() === (blogOwner ?? '').toLowerCase()
    );
  }, [user, blogOwner]);

  // Periodically check token expiry and auto-logout if expired
  useEffect(() => {
    if (!user?.expiresAt) return;

    const checkExpiry = () => {
      if (user.expiresAt && Date.now() > user.expiresAt) {
        // Token expired, logout
        setUser(undefined);
        setSession(undefined);
        clearUser();
        clearHiveAuthSession();
      }
    };

    // Check every minute
    const interval = setInterval(checkExpiry, 60 * 1000);

    // Also check immediately
    checkExpiry();

    return () => clearInterval(interval);
  }, [user?.expiresAt]);

  // The Hivesigner callback is handled by the /auth route, not here. Running it
  // on every route meant any page carrying ?access_token=&username= counted as a
  // completed login, which treated URL input as a credential.

  // Check if session is expiring within 5 minutes
  const isSessionExpiringSoon = useMemo(() => {
    if (!user?.expiresAt) return false;
    const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
    return user.expiresAt < fiveMinutesFromNow;
  }, [user?.expiresAt]);

  const value: AuthContextValue = useMemo(
    () => ({
      user: user ?? null,
      isAuthenticated: !!user,
      isAuthEnabled,
      availableMethods,
      isBlogOwner,
      isSessionExpiringSoon,
    }),
    [user, isAuthEnabled, availableMethods, isBlogOwner, isSessionExpiringSoon],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
