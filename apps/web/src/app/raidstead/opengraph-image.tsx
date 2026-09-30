import { portraitSvg } from "@ecency/raidstead";
import { initI18next } from "@/features/i18n";
import i18next from "i18next";
import { ImageResponse } from "next/og";

// The preview chat apps and Hive frontends show for a link to the game: the
// week 1 pest (already on the page, so nothing is given away) facing the four
// townsfolk, printed in the game's inks. No dynamic input, so Next renders it
// once at build time.
export const alt = "Raidstead";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#F5F0E6";
const INK = "#2B2336";
const VIOLET = "#7A4BB4";

const art = (kind: string, width: number, height: number) =>
  `data:image/svg+xml;base64,${Buffer.from(portraitSvg(kind, { width, height, pad: 0, spacing: 3 })).toString("base64")}`;

export default async function RaidsteadImage(): Promise<ImageResponse> {
  // an image route has no layout to load the translations for it
  await initI18next();
  const folk = ["scribe", "scout", "smith", "herald"];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
          color: INK,
          fontFamily: "sans-serif",
          padding: "56px 64px"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 520
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 6, color: VIOLET }}>
              RAIDSTEAD
            </div>
            <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.1, marginTop: 20 }}>
              {i18next.t("raidstead.page-description")}
            </div>
          </div>
          <div style={{ fontSize: 28, opacity: 0.75 }}>ecency.com/raidstead</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
          <img src={art("beetle", 460, 330)} width={460} height={330} alt="" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {folk.map((f) => (
              <img key={f} src={art(f, 120, 150)} width={120} height={150} alt="" />
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
