import { fetchHoneybackShare, honeybackShareHeadline, Translate } from "@/features/honeyback/share";
import { initI18next } from "@/features/i18n";
import i18next from "i18next";
import { ImageResponse } from "next/og";

// The preview card for a share link: the number first, then the sentence,
// in the game's colours. An unknown id gets the plain game card rather than
// a broken image, since chat apps fetch this before anyone taps the link.
export const alt = "Honeyback";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

const ink = "#2B1A0E";
const accent = "#B8760F";
const honey = "#F4B223";

const t: Translate = (key, values) =>
  i18next.t(key, { ...values, interpolation: { escapeValue: false } });

export default async function HoneybackShareImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // A route handler has no layout to load the translations for it.
  const [share] = await Promise.all([fetchHoneybackShare(id), initI18next()]);
  const label = share ? t(`static.honeyback.share.label.${share.kind}`) : "";
  const value = share ? share.value.toLocaleString("en-US") : "";
  const headline = share ? honeybackShareHeadline(share, t) : t("static.honeyback.about.tagline");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 80px",
          background: "linear-gradient(180deg, #FFF7E6 0%, #FFE9B8 100%)",
          color: ink,
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 14, background: honey }} />
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 6, color: accent }}>
            HONEYBACK
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {share ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
              <div style={{ fontSize: 200, fontWeight: 900, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 4, color: accent }}>
                {label.toUpperCase()}
              </div>
            </div>
          ) : null}
          <div
            style={{ fontSize: share ? 52 : 80, fontWeight: 600, marginTop: 24, lineHeight: 1.2 }}
          >
            {headline}
          </div>
        </div>
        <div
          style={{ display: "flex", justifyContent: "space-between", fontSize: 30, opacity: 0.75 }}
        >
          <div>ecency.com/honeyback-about</div>
          <div>{t("static.honeyback.share.footer")}</div>
        </div>
      </div>
    ),
    size
  );
}
