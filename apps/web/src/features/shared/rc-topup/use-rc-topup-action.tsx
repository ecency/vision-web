"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { EcencyConfigManager } from "@/config";

// Lazy-loaded so its mutation/SDK import chain is not pulled into every
// comment, editor and vote render until someone actually opens it.
const RcTopupDialog = dynamic(
  () => import("@/features/shared/rc-topup").then((m) => m.RcTopupDialog),
  { ssr: false }
);

/**
 * The one way to offer an RC top-up, shared by the pre-publish warning and the
 * post-failure alert so the two cannot drift apart.
 *
 * When the RC top-up product is live the user spends Ecency Points on a
 * short-term RC-only delegation to their own account, which is the direct fix
 * for being out of RC. Until then it falls back to the Boost+ purchase page,
 * an HP delegation that raises RC as a side effect.
 */
export function useRcTopupAction(username: string | undefined) {
  const [showTopup, setShowTopup] = useState(false);

  // RcTopupDialog resolves its account from useActiveAccount and its mutation
  // spends that account's Points. Left mounted across an account switch it
  // would quietly retarget, spending B's Points for a shortfall that belongs
  // to A, so switching accounts closes it.
  useEffect(() => {
    setShowTopup(false);
  }, [username]);

  const rcTopupEnabled = EcencyConfigManager.getConfigValue(
    ({ visionFeatures }) => visionFeatures.rcTopup.enabled
  );

  const openTopup = useCallback(() => {
    if (rcTopupEnabled) {
      setShowTopup(true);
    } else if (username) {
      // noreferrer as well as noopener: without it the purchase page receives
      // the editor URL, which can carry draft identifiers in the path.
      window.open(
        `/purchase?username=${encodeURIComponent(username)}&type=boost`,
        "_blank",
        "noopener,noreferrer"
      );
    }
  }, [rcTopupEnabled, username]);

  return {
    rcTopupEnabled,
    openTopup,
    dialog: showTopup ? <RcTopupDialog onHide={() => setShowTopup(false)} /> : null
  };
}
