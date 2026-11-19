/*
  Self-hosted copies of the Google Fonts files (SIL Open Font License 1.1,
  see ./README.md). next/font/google downloads them on every build, and a
  build fails whenever Google answers with something else (#2136). These are
  the same files, subsets and unicode ranges; only the latin subsets are
  preloaded, as before (#1600, #1670). See ./README.md to update them.
*/
import localFont from "next/font/local";
import { fontStack } from "./stack";

const fredokaHebrew = localFont({
  src: [
    { path: "./fredoka/hebrew.woff2", weight: "500", style: "normal" },
    { path: "./fredoka/hebrew.woff2", weight: "600", style: "normal" }
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F" }]
});

const fredokaLatinExt = localFont({
  src: [
    { path: "./fredoka/latin-ext.woff2", weight: "500", style: "normal" },
    { path: "./fredoka/latin-ext.woff2", weight: "600", style: "normal" }
  ],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" }]
});

const fredokaLatin = localFont({
  src: [
    { path: "./fredoka/latin.woff2", weight: "500", style: "normal" },
    { path: "./fredoka/latin.woff2", weight: "600", style: "normal" }
  ],
  display: "swap",
  preload: true,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }]
});

/** Fredoka: latin first, every other subset after it, the metric-adjusted fallback (fallbacks.css) last. */
export const fredokaFamily = fontStack([fredokaLatin, fredokaLatinExt, fredokaHebrew], "Fredoka Fallback");
