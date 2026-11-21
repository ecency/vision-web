"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHydrated } from "@/api/queries";
import * as ls from "@/utils/local-storage";
import {
  clearSession,
  loadSession,
  raidsteadApi,
  saveSession,
  signIn,
  signerFor
} from "@/features/raidstead/client";

/// - none: no Ecency login, so nothing to sign in as;
/// - signing: signing in;
/// - ready: a game session for the Ecency user;
/// - sign: the reader has to sign once with their wallet (a tap, never by itself);
/// - failed: signing in did not work.
export type AdventSessionStatus = "none" | "signing" | "ready" | "sign" | "failed";

/// The game session is for this account, now (another tab may have replaced it).
export const sessionIsFor = (account: string | null | undefined) =>
  !!account && loadSession()?.account === account;

/// The game session for the Ecency user of the page, shared with Raidstead. A
/// login that needs no wallet prompt signs in by itself; otherwise the page
/// asks for one signature. A session made for someone else is ended, never
/// used. Nothing is decided before the page knows its Ecency user (hydrated).
export function useAdventSession(username: string | null) {
  const hydrated = useHydrated();
  const [status, setStatus] = useState<AdventSessionStatus>("none");
  const [boot, setBoot] = useState(0);
  const userRef = useRef(username);
  userRef.current = username;

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    let session = loadSession();
    // an Ecency logout ends the session made for that login; a session for
    // someone other than the page's Ecency user is not used. A guest session
    // (signed with a wallet, no Ecency login) is left alone while logged out.
    const loggedOut = !username && !!session?.ecency;
    if (session && (loggedOut || (username && session.account !== username))) {
      raidsteadApi.signOut().catch(() => undefined);
      clearSession();
      session = null;
    }
    if (session && username && !session.ecency) {
      session = { ...session, ecency: true };
      saveSession(session);
    }
    if (!username) {
      setStatus("none");
      return;
    }
    if (session) {
      setStatus("ready");
      return;
    }
    const kind = signerFor(username);
    if (kind === null) {
      setStatus("failed");
      return;
    }
    if (kind === "extension") {
      setStatus("sign");
      return;
    }
    setStatus("signing");
    signIn(username, kind, true)
      .then((s) => {
        if (cancelled || userRef.current !== username || s.account !== username) return;
        saveSession(s);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus(signerFor(username) === "extension" ? "sign" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, username, boot]);

  // the session is shared by every tab: one ended or replaced elsewhere is looked at again here
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith(`${ls.PREFIX}_raidstead_session`)) setBoot((n) => n + 1);
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);

  /// Signs in on the reader's tap, asking a wallet when nothing else works.
  const signNow = useCallback(async () => {
    const asUser = userRef.current;
    if (!asUser) return;
    setStatus("signing");
    try {
      const s = await signIn(asUser, signerFor(asUser) ?? "extension", true, true);
      if (userRef.current !== asUser) return;
      if (s.account !== asUser) {
        setStatus("failed");
        return;
      }
      saveSession(s);
      setStatus("ready");
    } catch {
      if (userRef.current === asUser) setStatus("failed");
    }
  }, []);

  /// The server no longer takes the session (a 401): drop it and sign in again.
  const lost = useCallback(() => {
    clearSession();
    setBoot((n) => n + 1);
  }, []);

  return { status, signNow, lost };
}
