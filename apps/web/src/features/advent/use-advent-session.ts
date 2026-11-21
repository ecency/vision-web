"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHydrated } from "@/api/queries";
import { useGlobalStore } from "@/core/global-store";
import * as ls from "@/utils/local-storage";
import {
  clearSession,
  loadSession,
  raidsteadApi,
  saveSession,
  signIn,
  signerFor,
  type RaidsteadSession
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

/// The Ecency login every tab shares, as it is now (this tab's copy only changes on a reload).
const liveEcencyUser = (): string | null => {
  const u = ls.get("active_user");
  return typeof u === "string" && u ? u : null;
};

/// Saves a session signed in for `account` unless another tab has meanwhile
/// stored one for someone else: that one is newer and is not overwritten.
function saveIfStillWanted(s: RaidsteadSession, account: string): boolean {
  if (s.account !== account || liveEcencyUser() !== account) return false;
  const now = loadSession();
  if (now && now.account !== account) return false;
  saveSession(s);
  return true;
}

/// The game session for the Ecency user of the page, shared with Raidstead. A
/// login that needs no wallet prompt signs in by itself; otherwise the page
/// asks for one signature. A session made for someone else is ended, never
/// used. Nothing is decided before the page knows its Ecency user (hydrated),
/// and a login changed in another tab is followed here, as Raidstead does.
export function useAdventSession(username: string | null) {
  const hydrated = useHydrated();
  const [status, setStatus] = useState<AdventSessionStatus>("none");
  const [boot, setBoot] = useState(0);
  const userRef = useRef(username);
  userRef.current = username;
  // refusals since the last sign-in the reader asked for: a server that keeps
  // refusing fresh sessions must not start an endless sign-in loop
  const refusals = useRef(0);

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
        if (cancelled || userRef.current !== username) return;
        setStatus(saveIfStillWanted(s, username) ? "ready" : "failed");
      })
      .catch(() => {
        if (!cancelled) setStatus(signerFor(username) === "extension" ? "sign" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, username, boot]);

  // Every tab shares the Ecency login and the game session. A login changed in
  // another tab becomes this tab's too (so a session is never ended for an
  // account that is still in use elsewhere), and a session ended or replaced
  // elsewhere is looked at again here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== `${ls.PREFIX}_active_user` && !e.key.startsWith(`${ls.PREFIX}_raidstead_session`))
        return;
      const live = liveEcencyUser();
      if (live !== userRef.current) useGlobalStore.getState().setActiveUser(live);
      setBoot((n) => n + 1);
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);

  /// Signs in on the reader's tap, asking a wallet when nothing else works.
  const signNow = useCallback(async () => {
    const asUser = userRef.current;
    if (!asUser) return;
    refusals.current = 0;
    setStatus("signing");
    try {
      const s = await signIn(asUser, signerFor(asUser) ?? "extension", true, true);
      if (userRef.current !== asUser) return;
      setStatus(saveIfStillWanted(s, asUser) ? "ready" : "failed");
    } catch {
      if (userRef.current === asUser) setStatus("failed");
    }
  }, []);

  /// The server refused the session `token` (a 401): drop it, only if it is
  /// still the stored one, and sign in again (once by itself). With no token
  /// the session changed hands: nothing is dropped, the page looks again.
  const lost = useCallback((token: string | null | undefined) => {
    // no token: the session changed hands (another tab); just look again
    if (!token) {
      setBoot((n) => n + 1);
      return;
    }
    // a refusal of a session already replaced says nothing about the new one
    const now = loadSession();
    if (now && now.token !== token) return;
    if (now) clearSession();
    refusals.current += 1;
    // once by itself; after that the reader asks (the "try again" button)
    if (refusals.current > 1) {
      setStatus("failed");
      return;
    }
    setBoot((n) => n + 1);
  }, []);

  return { status, signNow, lost };
}
