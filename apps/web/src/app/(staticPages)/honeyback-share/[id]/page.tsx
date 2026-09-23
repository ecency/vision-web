import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import {
  fetchHoneybackShare,
  honeybackShareHeadline,
  honeybackShareUrl,
  honeybackWaveComposeUrl,
  HoneybackShare,
  Translate
} from "@/features/honeyback/share";
import { initI18next } from "@/features/i18n";
import i18next from "i18next";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReactElement } from "react";

interface Props {
  params: Promise<{ id: string }>;
}

// Interpolated values are player names and numbers rendered as text by
// React, so i18next's HTML escaping would only show entities.
const t: Translate = (key, values) =>
  i18next.t(key, { ...values, interpolation: { escapeValue: false } });

export const revalidate = 86400;

// A share the API cannot answer for right now is an error, not a 404: the
// error response is not cached and the next request asks again.
function unavailable(): never {
  throw new Error("Honeyback shares are unavailable right now");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [lookup] = await Promise.all([fetchHoneybackShare(id), initI18next()]);
  if (lookup.status === "unavailable") unavailable();
  if (lookup.status === "missing") {
    return { title: t("static.honeyback.share.not-found-title") };
  }
  const { share } = lookup;
  const title = honeybackShareHeadline(share, t);
  const description = t("static.honeyback.share.description");
  return {
    title,
    description,
    // One player's card; the game's own page is the one to index.
    robots: { index: false, follow: true },
    openGraph: { title, description, type: "website", url: honeybackShareUrl(share.id) },
    twitter: { card: "summary_large_image", title, description }
  };
}

// A share card from the game: what the player did, the game's pitch and a
// way to post the same card to Waves. The preview image next to this file
// is what chat apps and Waves show for the link.
export default async function HoneybackSharePage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const [lookup] = await Promise.all([fetchHoneybackShare(id), initI18next()]);
  if (lookup.status === "unavailable") unavailable();
  if (lookup.status === "missing") notFound();
  return <ShareCard share={lookup.share} />;
}

function ShareCard({ share }: { share: HoneybackShare }): ReactElement {
  const s = (key: string, values?: Record<string, string | number>) =>
    t(`static.honeyback.share.${key}`, values);
  const ink = "#2B1A0E";
  const headline = honeybackShareHeadline(share, t);
  const made = new Date(share.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return (
    <>
      <ScrollToTop />
      <Theme />
      <Navbar />

      <div className="app-content static-page honeyback-page">
        <section style={{ background: "linear-gradient(180deg, #FFF7E6 0%, #FFE9B8 100%)" }}>
          <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
            <img
              src="/assets/honeyback/honeyback-logo.svg"
              alt="Honeyback"
              className="w-full max-w-xs"
            />
            <p
              className="mt-10 text-sm font-bold uppercase tracking-widest"
              style={{ color: "#B8760F" }}
            >
              {s(`label.${share.kind}`)}
            </p>
            <p className="mt-2 text-7xl font-black leading-none" style={{ color: ink }}>
              {share.value.toLocaleString("en-US")}
            </p>
            <h1 className="mt-6 text-2xl font-semibold" style={{ color: ink }}>
              {headline}
            </h1>
            <p className="mt-2 opacity-70" style={{ color: ink }}>
              {s("made", { date: made })}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/honeyback-about"
                className="rounded-2xl px-6 py-3 text-base font-bold"
                style={{ background: "#F4B223", color: ink }}
              >
                {s("get-game")}
              </Link>
              <Link
                href={honeybackWaveComposeUrl(share, t)}
                className="rounded-2xl px-6 py-3 text-base font-bold"
                style={{ background: "#3FA66B", color: ink }}
              >
                {s("post-wave")}
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-14 text-center">
          <h2 className="text-2xl font-bold">{s("pitch-title")}</h2>
          <p className="mt-4 text-lg">{s("pitch-body")}</p>
          <p className="mt-10 opacity-80">
            {s("footer")}{" "}
            <Link href="/honeyback-about" className="underline">
              {s("about-link")}
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
