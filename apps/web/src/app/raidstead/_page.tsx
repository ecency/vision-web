"use client";

import dynamic from "next/dynamic";
import { Fredoka } from "next/font/google";
import i18next from "i18next";
import { ensureRaidsteadLoaded } from "@/features/i18n/raidstead";
import "./raidstead.scss";

// Headings in the game's printed look; loaded on this route only.
const display = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--rs-display-font",
  display: "swap"
});

function Loading() {
  return (
    <div className="raidstead">
      <p className="rs-loading">{i18next.t("raidstead.loading")}</p>
    </div>
  );
}

// The game draws on a canvas with WebGL; nothing of it can render on the server.
// Its strings load with it (they are split out of the eager locale bundle).
const RaidsteadGame = dynamic(
  () =>
    Promise.all([import("@/app/raidstead/_components/raidstead-game"), ensureRaidsteadLoaded()]).then(
      ([m]) => ({ default: m.RaidsteadGame })
    ),
  { ssr: false, loading: Loading }
);

export function RaidsteadPage() {
  return (
    <div className={display.variable}>
      <RaidsteadGame />
    </div>
  );
}
