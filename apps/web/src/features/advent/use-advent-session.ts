"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/// The game session for the Ecency user of the page. A login that needs no
/// wallet prompt signs in by itself; otherwise the page asks for one signature.
/// A session made for someone else is ended, never used.
export function useAdventSession(username: string | null) {
  const [status, setStatus] = useState<AdventSessionStatus>("none");
  const userRef = useRef(username);
  userRef.current = username;

  useEffect(() => {
    let cancelled = false;
    let session = loadSession();
    if (session && (session.account !== username || (!username && session.ecency))) {
      raidsteadApi.signOut().catch(() => undefined);
      clearSession();
      session = null;
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
    if (kind !== "key" && kind !== "ecency") {
      setStatus("sign");
      return;
    }
    setStatus("signing");
    signIn(username, kind, true)
      .then((s) => {
        if (cancelled || userRef.current !== username) return;
        saveSession(s);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus(signerFor(username) === "extension" ? "sign" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  /// Signs in on the reader's tap, asking a wallet when nothing else works.
  const signNow = useCallback(async () => {
    const asUser = userRef.current;
    if (!asUser) return;
    setStatus("signing");
    try {
      const s = await signIn(asUser, signerFor(asUser) ?? "extension", true, true);
      if (userRef.current !== asUser || s.account !== asUser) return;
      saveSession(s);
      setStatus("ready");
    } catch {
      setStatus("failed");
    }
  }, []);

  return { status, signNow };
}
