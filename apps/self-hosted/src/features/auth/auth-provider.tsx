'use client';

import { createContext, type ReactNode, useEffect, useMemo } from 'react';
import { InstanceConfigManager } from '@/core';
import { useAuthStore } from '@/store';
import { clearHiveAuthSession, clearUser } from './storage';
import type { AuthContextValue, AuthMethod, AuthUser } from './types';
import { resolveHivesignerClientId } from './utils/hivesigner';

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, setUser, setSession } = useAuthStore();

  // Get auth config
  const authConfig = InstanceConfigManager.getConfigValue(
    ({ configuration }) => configuration.instanceConfiguration.features.auth,
  );

  const isAuthEnabled = authConfig?.enabled ?? false;
  const hivesignerClientId = resolveHivesignerClientId(
    InstanceConfigManager.getConfigValue(
      ({ configuration }) => configuration.general?.hivesigner?.clientId,
    ),
  );

  // Configured methods, minus any this instance cannot actually complete.
  // Offering a method that always fails sends the visitor into an error with no
  // explanation: Hivesigner rejects a redirect_uri its app has not registered,
  // and a hosted blog's origin cannot be registered in advance, so it is offered
  // only when the instance names a client of its own.
  const availableMethods = ((authConfig?.methods ?? []) as AuthMethod[]).filter(
    (method) => (method === 'hivesigner' ? hivesignerClientId !== null : true),
  );

  // Get the instance owner. Falls back to the showcased username for older
  // configs that predate the `owner` field (blog instances where the owner and
  // the showcased account are the same). In community instances the showcased
  // username is the community (hive-NNNNN), so the owner must be used instead.
  const blogOwner = InstanceConfigManager.getConfigValue(
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
