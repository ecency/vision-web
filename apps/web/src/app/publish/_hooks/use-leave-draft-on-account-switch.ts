"use client";

import { useEffect, useRef } from "react";
import { useActiveUsername } from "@/core/hooks/use-active-username";

/**
 * The draft editor route edits a draft owned by the account that opened it. When
 * another account signs in with the page open, `onLeave` runs once, so the page
 * can drop the composer and send the new account to a fresh one instead of
 * saving its edits into the previous account's draft (#2105).
 *
 * `active` is whether the draft has loaded. Until it has there is nothing to
 * leave: a draft that belongs to another account shows "no draft", and the page
 * loads it once that account signs in. The owner is the signed-in account when
 * the draft loads. Signing out and back in as the same account is not a switch.
 */
export function useLeaveDraftOnAccountSwitch(onLeave: () => void, active: boolean) {
  const username = useActiveUsername();
  const ownerRef = useRef<string | undefined>(undefined);
  const leftRef = useRef(false);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  useEffect(() => {
    if (!active) {
      ownerRef.current = undefined;
      return;
    }
    if (!username || leftRef.current) return;
    if (ownerRef.current === undefined) {
      ownerRef.current = username;
      return;
    }
    if (ownerRef.current !== username) {
      leftRef.current = true;
      onLeaveRef.current();
    }
  }, [username, active]);
}
