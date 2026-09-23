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

const t: Translate = (key, values) => i18next.t(key, values);

// One player's card each, or a state of the API; the game's own page is the
// one to index.
const noIndex = { index: false, follow: true };

// This route is not edge-cached (see STATIC_PREFIXES in cache-policy.ts):
// the middleware's header would land on a 404 or an error page as well, and
// a page cannot set its own. The API answer is cached at the origin for a
// day by the fetch, so a render stays cheap; the preview image, which is
// what crawlers and chat apps hit, carries its own day-long header.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const [lookup] = await Promise.all([fetchHoneybackShare(id), initI18next()]);
  if (lookup.status === "unavailable") {
    return { title: t("static.honeyback.share.unavailable-title"), robots: noIndex };
  }
  if (lookup.status === "missing") {
    return { title: t("static.honeyback.share.not-found-title"), robots: noIndex };
  }
  const { share } = lookup;
  const title = honeybackShareHeadline(share, t);
  const description = t("static.honeyback.share.description");
  return {
    title,
    description,
    robots: noIndex,
    openGraph: { title, description, type: "website", url: honeybackShareUrl(share.id) },
    twitter: { card: "summary_large_image", title, description }
  };
}

// A share card from the game: what the player did, the game's pitch and a
// way to post the same card to Waves. The preview image next to this file
// is what chat apps and Waves show for the link.
// An API that cannot answer right now gets a card that says so, not a
// thrown error: the app's only error module is the global one, which would
// replace the whole document and send an event to Sentry for every visit
// during an outage of another service. The response is not cached anywhere.
export default async function HoneybackSharePage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const [lookup] = await Promise.all([fetchHoneybackShare(id), initI18next()]);
  if (lookup.status === "missing") notFound();
  return lookup.status === "found" ? <ShareCard share={lookup.share} /> : <UnavailableCard />;
}

function UnavailableCard(): ReactElement {
  const s = (key: string) => t(`static.honeyback.share.${key}`);
  const ink = "#2B1A0E";
  return (
    <>
      <ScrollToTop />
      <Theme />
      <Navbar />
      <div className="app-content static-page honeyback-page">
        <section style={{ background: "linear-gradient(180deg, #FFF7E6 0%, #FFE9B8 100%)" }}>
          <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
            <img src="/assets/honeyback/honeyback-logo.svg" alt="" className="w-full max-w-xs" />
            <h1 className="mt-10 text-2xl font-semibold" style={{ color: ink }}>
              {s("unavailable-title")}
            </h1>
            <p className="mt-2 opacity-70" style={{ color: ink }}>
              {s("unavailable-body")}
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/honeyback-about"
                className="rounded-2xl px-6 py-3 text-base font-bold"
                style={{ background: "#F4B223", color: ink }}
              >
                {s("get-game")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
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
            <img src="/assets/honeyback/honeyback-logo.svg" alt="" className="w-full max-w-xs" />
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
